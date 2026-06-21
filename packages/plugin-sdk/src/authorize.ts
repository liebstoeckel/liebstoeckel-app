import * as Y from "yjs";
import type { PluginManifest } from "./manifest";

// Relay-side write authorization for hosted live sessions ((internal ADR)). A public
// audience link invites strangers, so roles must be *enforced*, not honor-system:
// the presenter/runner may write the whole doc, but an audience peer may only touch
// the interaction fields a plugin explicitly declares (poll votes, Q&A questions/
// votes, reactions) plus the instance index it appends to when rendering a slide.
// Navigation, slide state, and every other key are presenter-only.

export type PeerRole = "presenter" | "runner" | "audience";

/** The doc-level index a client appends to when it renders a `<Plugin>` (instance
 *  discovery, (internal ADR)). A legitimate audience write, the audience renders the deck. */
export const PLUGIN_INDEX_KEY = "plugin-index";

export interface AudienceScope {
  /** plugin def id -> the set of state fields an audience peer may write. */
  pluginFields: Map<string, ReadonlySet<string>>;
  /** doc roots an audience peer may write wholesale (the instance index). */
  wholeRoots: ReadonlySet<string>;
}

/** Build the audience write-scope from a deck's plugin manifest. Plugins that
 *  declare no `audienceWrites` contribute nothing, fail-closed. */
export function buildAudienceScope(manifest: PluginManifest | null | undefined): AudienceScope {
  const pluginFields = new Map<string, ReadonlySet<string>>();
  for (const p of manifest?.plugins ?? []) {
    if (p.id && p.audienceWrites && p.audienceWrites.length > 0) {
      pluginFields.set(p.id, new Set(p.audienceWrites));
    }
  }
  return { pluginFields, wholeRoots: new Set([PLUGIN_INDEX_KEY]) };
}

/** `plugin:<id>` / `plugin:<id>:<instance>` -> `<id>` (or null for a non-plugin root). */
function pluginIdOf(rootKey: string): string | null {
  if (!rootKey.startsWith("plugin:")) return null;
  const rest = rootKey.slice("plugin:".length);
  const colon = rest.indexOf(":");
  return colon === -1 ? rest : rest.slice(0, colon);
}

/** For a doc root: `"*"` (whole root audience-owned), a set of writable fields, or
 *  null (presenter-only). */
function scopeForRoot(scope: AudienceScope, rootKey: string): ReadonlySet<string> | "*" | null {
  if (scope.wholeRoots.has(rootKey)) return "*";
  const id = pluginIdOf(rootKey);
  if (id) {
    const fields = scope.pluginFields.get(id);
    if (fields) return fields;
  }
  return null;
}

/** Deterministic JSON (recursively sorted object keys) so projection equality is
 *  independent of insertion order. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/** Project the doc to JSON with the audience-writable areas removed, so two
 *  projections are equal **iff** nothing outside the audience scope changed. Whole
 *  audience roots are dropped entirely; per-plugin writable fields are dropped from
 *  that plugin's object. */
function projectProtected(doc: Y.Doc, scope: AudienceScope): string {
  const out: Record<string, unknown> = {};
  for (const key of doc.share.keys()) {
    const allowed = scopeForRoot(scope, key);
    if (allowed === "*") continue;
    // A root integrated by applyUpdate is a generic AbstractType whose toJSON() is
    // empty until materialized; every liebstoeckel state root is a Y.Map (plugin
    // state, nav, the instance index, see state.ts / instances.ts), so bind it as
    // one. A deck that used a non-Map root would throw here → caught → fail closed.
    const js = doc.getMap(key).toJSON() as unknown;
    if (allowed && js && typeof js === "object" && !Array.isArray(js)) {
      const filtered: Record<string, unknown> = {};
      for (const [field, v] of Object.entries(js as Record<string, unknown>)) {
        if (!allowed.has(field)) filtered[field] = v;
      }
      // Omit the root when only writable fields remain (empty after filtering): an
      // audience creating a plugin root by writing its *first* vote (root didn't exist
      // before) must not read as a protected change.
      if (Object.keys(filtered).length > 0) out[key] = filtered;
    } else {
      out[key] = js;
    }
  }
  return stableStringify(out);
}

/**
 * Would applying `update` (received from an audience peer) change anything **outside**
 * the audience write-scope? Returns true if the update is allowed, false if it must be
 * dropped. Pure: it clones `liveState` and never touches the live doc. Fails closed on
 * any decode error.
 *
 * `liveState` is the relay's current `Y.encodeStateAsUpdate(hub.doc)`.
 */
export function authorizeAudienceUpdate(liveState: Uint8Array, update: Uint8Array, scope: AudienceScope): boolean {
  const clone = new Y.Doc();
  try {
    Y.applyUpdate(clone, liveState);
    const before = projectProtected(clone, scope);
    Y.applyUpdate(clone, update);
    const after = projectProtected(clone, scope);
    return before === after;
  } catch {
    return false;
  } finally {
    clone.destroy();
  }
}

export interface TokenBucket {
  /** Consume one token at wall-clock `now` (ms). True if allowed, false if empty. */
  tryConsume(now: number): boolean;
}

/** A simple token-bucket rate limiter (pure; the clock is injected). Used per audience
 *  peer to blunt vote/question/reaction spam from the open link. */
export function tokenBucket(capacity: number, refillPerSec: number): TokenBucket {
  const refillPerMs = refillPerSec / 1000;
  let tokens = capacity;
  let last = -1;
  return {
    tryConsume(now) {
      if (last < 0) last = now;
      tokens = Math.min(capacity, tokens + (now - last) * refillPerMs);
      last = now;
      if (tokens >= 1) {
        tokens -= 1;
        return true;
      }
      return false;
    },
  };
}
