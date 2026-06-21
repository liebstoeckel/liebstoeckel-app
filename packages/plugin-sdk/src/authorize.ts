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

// Universal bounds on the *values* an audience peer may write into its allowed fields.
// Scope alone (which field changed) is not enough: a peer can write any JSON into an
// allowed field, and an oversized string, pathological nesting, or a runaway number of
// keys is a denial-of-service against the whole session (relay memory, late-join replay,
// and a malformed value crashing the render). Plugins keep their own tighter schema; these
// are the coarse, plugin-agnostic guard rails enforced at the relay trust boundary.
export const MAX_AUDIENCE_STRING = 4096; // chars per string/key — caps oversized text/emoji
export const MAX_AUDIENCE_ENTRIES = 5000; // keys/items per audience-writable container
export const MAX_AUDIENCE_DEPTH = 6; // nesting depth — audience values are shallow

/** Recursively check one audience-written value against the bounds above. */
function withinBounds(value: unknown, depth: number): boolean {
  if (depth > MAX_AUDIENCE_DEPTH) return false;
  if (value === null) return true;
  switch (typeof value) {
    case "string":
      return value.length <= MAX_AUDIENCE_STRING;
    case "number":
      return Number.isFinite(value);
    case "boolean":
      return true;
    case "object": {
      if (Array.isArray(value)) {
        if (value.length > MAX_AUDIENCE_ENTRIES) return false;
        return value.every((v) => withinBounds(v, depth + 1));
      }
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length > MAX_AUDIENCE_ENTRIES) return false;
      for (const [k, v] of entries) {
        if (k.length > MAX_AUDIENCE_STRING) return false;
        if (!withinBounds(v, depth + 1)) return false;
      }
      return true;
    }
    default:
      return false; // function / undefined / symbol / bigint — never valid shared state
  }
}

/** Are all audience-writable subtrees in `doc` within bounds? */
function audienceValuesWithinBounds(doc: Y.Doc, scope: AudienceScope): boolean {
  for (const key of doc.share.keys()) {
    const allowed = scopeForRoot(scope, key);
    if (allowed === null) continue; // presenter-only root — not audience-writable
    let js: Record<string, unknown>;
    try {
      js = doc.getMap(key).toJSON() as Record<string, unknown>;
    } catch {
      return false; // fail closed on an unexpected root shape
    }
    if (allowed === "*") {
      if (!withinBounds(js, 0)) return false;
      continue;
    }
    for (const field of allowed) {
      if (field in js && !withinBounds(js[field], 0)) return false;
    }
  }
  return true;
}

/**
 * Would applying `update` (received from an audience peer) change anything **outside**
 * the audience write-scope, or carry an out-of-bounds value inside it? Returns true if
 * the update is allowed, false if it must be dropped. Pure: it clones `liveState` and
 * never touches the live doc. Fails closed on any decode error.
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
    if (before !== after) return false; // touched a presenter-only field → drop
    // Scope is fine; now bound the values written into the allowed fields so a single
    // update can't carry a multi-megabyte string, deep nesting, or a runaway key count.
    return audienceValuesWithinBounds(clone, scope);
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
