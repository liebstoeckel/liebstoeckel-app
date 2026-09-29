import * as Y from "yjs";
import type { PluginManifest } from "./manifest";

// Relay-side write authorization for hosted live sessions. A public
// audience link invites strangers, so roles must be *enforced*, not honor-system:
// the presenter/runner may write the whole doc, but an audience peer may only touch
// the interaction fields a plugin explicitly declares (poll votes, Q&A questions/
// votes, reactions) plus the instance index it appends to when rendering a slide.
// Navigation, slide state, and every other key are presenter-only.

export type PeerRole = "presenter" | "runner" | "audience";

/** The doc-level index a client appends to when it renders a `<Plugin>` (instance
 *  discovery). A legitimate audience write, the audience renders the deck. */
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

// Universal bounds on the *values* an audience peer may write into its allowed fields.
// Scope alone (which field changed) is not enough: a peer can write any JSON into an
// allowed field, and an oversized string, pathological nesting, or a runaway number of
// keys is a denial-of-service against the whole session (relay memory, late-join replay,
// and a malformed value crashing the render). Plugins keep their own tighter schema; these
// are the coarse, plugin-agnostic guard rails enforced at the relay trust boundary.
//
// The entry caps depend on what a field holds. A field of single values (poll votes, Q&A
// upvotes) gets one small entry per participant, or per participant and question, so it
// has to grow with the audience. A field that holds objects (Q&A questions, reactions, the
// instance index) gets the lower cap, and so does any container nested inside an entry.
export const MAX_AUDIENCE_STRING = 4096; // chars per string/key, caps oversized text/emoji
/** Entries per audience-writable field that holds any object, and per nested container. */
export const MAX_AUDIENCE_ENTRIES = 10_000;
/** Entries per audience-writable field that holds only single values (votes, upvotes). */
export const MAX_AUDIENCE_TALLY_ENTRIES = 50_000;
export const MAX_AUDIENCE_DEPTH = 6; // nesting depth, audience values are shallow

const isObjectLike = (v: unknown): boolean => v !== null && typeof v === "object";

/** Entry cap for a container at `depth` below its field, given whether it holds objects. */
const capFor = (depth: number, holdsObjects: boolean): number =>
  depth === 0 && !holdsObjects ? MAX_AUDIENCE_TALLY_ENTRIES : MAX_AUDIENCE_ENTRIES;

/** Recursively check one audience-written value against the bounds above. `depth` is its
 *  depth below the field (0 = the field's own value). */
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
    case "undefined":
      // Yjs stores JSON plus `undefined` (an optional field left unset, e.g. an
      // instance-index entry without a title). It carries no payload, so it is as
      // harmless as an absent field; rejecting it muted every audience peer.
      return true;
    case "object": {
      if (Array.isArray(value)) {
        if (value.length > capFor(depth, value.some(isObjectLike))) return false;
        return value.every((v) => withinBounds(v, depth + 1));
      }
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length > capFor(depth, entries.some(([, v]) => isObjectLike(v)))) return false;
      for (const [k, v] of entries) {
        if (k.length > MAX_AUDIENCE_STRING) return false;
        if (!withinBounds(v, depth + 1)) return false;
      }
      return true;
    }
    default:
      return false; // function / symbol / bigint, never valid shared state
  }
}

// Yjs internals the gate reads. They are stable across Yjs 13 and typed loosely here on
// purpose: `_map` is how a map-like type (including a root the doc has not bound to a
// Y.Map yet) keeps its entries, and `_item` links a nested type to its parent.
type Entry = { deleted: boolean; content: { getContent(): unknown[] } };
type AnyType = Y.AbstractType<unknown> & {
  _map: Map<string, Entry>;
  _item: { parent: unknown; parentSub: string | null } | null;
  _start: unknown;
};

/** The live value of `key` in a map-like type, or undefined. */
function entryOf(type: AnyType, key: string): unknown {
  const item = type._map.get(key);
  if (!item || item.deleted) return undefined;
  const content = item.content.getContent();
  return content[content.length - 1];
}

/** Marker for a value the audience may never write (a subdocument, binary-in-a-type). */
const UNPLAIN = Symbol("unplain");

/** A shared value as plain JSON. Maps and arrays convert; text and XML types read as their
 *  string form, as they did before; a subdocument is never plain. */
function plain(value: unknown): unknown {
  if (value instanceof Y.Doc) return UNPLAIN;
  if (value instanceof Y.AbstractType) return value.toJSON();
  return value;
}

/** A root's entries as plain JSON (works for a root the doc has not bound yet). */
function rootJSON(type: AnyType): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of type._map) {
    if (!item.deleted) out[key] = plain(entryOf(type, key));
  }
  return out;
}

/** Deterministic JSON (recursively sorted object keys), for comparing values. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/** Live entries of a map-like type and whether any of them is an object. One pass, no
 *  JSON: this runs on every audience write into a field. */
function census(type: AnyType): { size: number; holdsObjects: boolean } {
  let size = 0;
  let holdsObjects = false;
  for (const item of type._map.values()) {
    if (item.deleted) continue;
    size++;
    if (!holdsObjects) {
      const c = item.content.getContent();
      holdsObjects = isObjectLike(c[c.length - 1]);
    }
  }
  return { size, holdsObjects };
}

/** Does the doc hold updates it could not apply yet? */
function hasPending(doc: Y.Doc): boolean {
  return doc.store.pendingStructs !== null || doc.store.pendingDs !== null;
}

/** Where a changed type sits: its root's name and the keys leading down to it
 *  (null for a step into an array). */
interface Place {
  root: string;
  path: (string | null)[];
  type: AnyType;
  keys: Set<string | null>;
}

/**
 * The relay's audience write check for one session, incremental. It keeps a shadow copy of
 * the session doc (every update the doc applies reaches it) and tries an audience update on
 * the shadow first, reading which types and keys the update changed from Yjs itself
 * (`transaction.changed`). So a check costs about as much as the update is large, not as
 * much as the session is: a check that walked the whole doc turned into the relay's limit
 * at a few thousand voters.
 *
 * An update is refused when it changes anything outside the audience scope (a key of a
 * presenter-only root or field, anything in an array root), when a value it writes into
 * the scope is out of bounds, when a field it adds to ends up over its entry cap, or when
 * it cannot apply yet (it would wait in the doc and join it unchecked later). After a
 * refusal the shadow no longer matches the doc and is rebuilt from it before the next
 * check.
 *
 * Yjs records no change inside a type the same update creates, nor inside a deleted one.
 * The first is covered because the new type is itself a new value at a key of an existing
 * type, which is recorded and checked as a whole; the second changes nothing anyone sees.
 */
export class AudienceGate {
  private shadow = new Y.Doc();
  private dirty = true;
  /** Set while {@link apply} writes an accepted update into the live doc. */
  private muted = false;
  private readonly onLive = (update: Uint8Array) => {
    // the rebuild will pick it up; or the shadow holds it already
    if (this.dirty || this.muted) return;
    try {
      Y.applyUpdate(this.shadow, update);
    } catch {
      this.dirty = true;
    }
  };

  constructor(
    private readonly live: Y.Doc,
    private readonly scope: AudienceScope,
  ) {
    live.on("update", this.onLive);
  }

  private rebuild(): void {
    this.shadow.destroy();
    this.shadow = new Y.Doc();
    Y.applyUpdate(this.shadow, Y.encodeStateAsUpdate(this.live));
    this.dirty = false;
  }

  /** Would `update`, sent by an audience peer, be allowed? Never touches the live doc;
   *  the caller applies the update itself when this returns true. Fails closed. */
  check(update: Uint8Array): boolean {
    try {
      if (this.dirty) this.rebuild();
      const ok = this.tryOnShadow(update);
      if (!ok) this.dirty = true;
      return ok;
    } catch {
      this.dirty = true;
      return false;
    }
  }

  /** Apply an update {@link check} just allowed to the live doc. The shadow already holds
   *  it, so it is not applied there a second time: every Yjs transaction costs time in
   *  proportion to the number of clients in the doc, which in a large session is one per
   *  viewer. */
  apply(update: Uint8Array, origin?: unknown): void {
    this.muted = true;
    try {
      Y.applyUpdate(this.live, update, origin);
    } finally {
      this.muted = false;
    }
  }

  private tryOnShadow(update: Uint8Array): boolean {
    const shadow = this.shadow;
    const roots = new Map<unknown, string>();
    for (const [name, type] of shadow.share) roots.set(type, name);
    const places: Place[] = [];
    let unplaced = false;
    const collect = (tr: Y.Transaction) => {
      for (const [type, keys] of tr.changed) {
        const path: (string | null)[] = [];
        let t = type as AnyType;
        while (t._item) {
          path.unshift(t._item.parentSub);
          t = t._item.parent as AnyType;
        }
        // a root created by this very update is not in `roots` yet
        const root = roots.get(t) ?? [...shadow.share].find(([, v]) => v === t)?.[0];
        if (root === undefined) unplaced = true;
        else places.push({ root, path, type: type as AnyType, keys });
      }
    };
    const pendingBefore = hasPending(shadow);
    shadow.on("afterTransaction", collect);
    try {
      Y.applyUpdate(shadow, update);
    } finally {
      shadow.off("afterTransaction", collect);
    }
    if (unplaced) return false;
    // An update that cannot apply yet (a clock gap, or a reference to something the doc
    // lacks) changes nothing now, but it would wait in the doc and join it unchecked once
    // the gap closes. Refuse it: a real client only builds on what it has received.
    if (!pendingBefore && hasPending(shadow)) return false;
    for (const place of places) if (!this.placeAllowed(place)) return false;
    return true;
  }

  private placeAllowed({ root, path, type, keys }: Place): boolean {
    const allowed = scopeForRoot(this.scope, root);
    if (allowed === null) return this.unchangedRoot(root);
    // For a whole audience root the root is the unit; for a plugin root each declared
    // field is. `depth` is the changed type's depth below its unit.
    let depth: number;
    if (allowed === "*") {
      depth = path.length;
    } else if (path.length === 0) {
      // keys of the plugin root itself: each is a field
      for (const key of keys) {
        if (key === null) return false; // a plugin root is a map, never a sequence
        if (!allowed.has(key)) {
          if (!this.unchangedField(root, key)) return false;
          continue;
        }
        const v = plain(entryOf(type, key));
        if (v === UNPLAIN || !withinBounds(v, 0)) return false;
      }
      return true;
    } else {
      const field = path[0];
      if (field === null || field === undefined) return false;
      if (!allowed.has(field)) return this.unchangedField(root, field);
      depth = path.length - 1;
    }
    if (depth === 0 && allowed === "*" && keys.has(null)) return false; // an array root
    if (keys.has(null)) {
      // a sequence changed (an array, or text): judge it whole
      const v = plain(type);
      return v !== UNPLAIN && withinBounds(v, depth);
    }
    let adds = false;
    for (const key of keys) {
      const v = plain(entryOf(type, key as string));
      if (v === UNPLAIN) return false;
      if (v !== undefined) adds = true;
      if ((key as string).length > MAX_AUDIENCE_STRING || !withinBounds(v, depth + 1)) return false;
    }
    if (!adds) return true; // only deletions: a container never grows by them
    const { size, holdsObjects } = census(type);
    return size <= capFor(depth, holdsObjects);
  }

  /** A presenter-only field an update touched: allowed only if its value is the same as
   *  before (a no-op rewrite), which is what comparing the protected state always meant. */
  private unchangedField(root: string, field: string): boolean {
    const before = this.live.share.get(root) as AnyType | undefined;
    const after = this.shadow.share.get(root) as AnyType;
    const a = before ? plain(entryOf(before, field)) : undefined;
    const b = plain(entryOf(after, field));
    return a !== UNPLAIN && b !== UNPLAIN && stableStringify(a) === stableStringify(b);
  }

  /** A presenter-only root: allowed only if it reads the same as before. */
  private unchangedRoot(root: string): boolean {
    const before = this.live.share.get(root) as AnyType | undefined;
    const after = this.shadow.share.get(root) as AnyType;
    // a root with sequence content is never audience state: refuse any change to it
    if (after._start !== null || (before && before._start !== null)) return false;
    const a = stableStringify(before ? rootJSON(before) : {});
    const b = stableStringify(rootJSON(after));
    return a === b;
  }

  destroy(): void {
    this.live.off("update", this.onLive);
    this.shadow.destroy();
  }
}

/**
 * Would applying `update` (received from an audience peer) change anything **outside**
 * the audience write-scope, carry an out-of-bounds value inside it, or leave anything
 * waiting that the doc cannot apply yet? Returns true if the update is allowed, false if
 * it must be dropped. Pure: it works on copies built from `liveState`. Fails closed on any
 * decode error. A relay checks every write of a session with one {@link AudienceGate}
 * instead, which does not copy the whole doc per write.
 *
 * `liveState` is the relay's current `Y.encodeStateAsUpdate(hub.doc)`.
 */
export function authorizeAudienceUpdate(liveState: Uint8Array, update: Uint8Array, scope: AudienceScope): boolean {
  const live = new Y.Doc();
  let gate: AudienceGate | undefined;
  try {
    Y.applyUpdate(live, liveState);
    gate = new AudienceGate(live, scope);
    return gate.check(update);
  } catch {
    return false;
  } finally {
    gate?.destroy();
    live.destroy();
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
