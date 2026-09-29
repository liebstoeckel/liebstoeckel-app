import * as Y from "yjs";
import type { Schema } from "./schema";
import { instanceStateKey } from "./instances";

// Maps a plugin's typed state onto a Y.Map at `plugin:<id>` (or `plugin:<id>:<instance>`
// for a named instance, (internal ADR)). Object/record fields
// become nested Y.Maps (concurrent writes merge, e.g. poll votes); arrays become
// Y.Arrays. Reads come back as plain JS, validated against the schema's defaults.

function toY(v: unknown): unknown {
  if (Array.isArray(v)) {
    const a = new Y.Array();
    a.push(v.map(toY));
    return a;
  }
  if (v && typeof v === "object") {
    const m = new Y.Map();
    for (const [k, val] of Object.entries(v)) m.set(k, toY(val));
    return m;
  }
  return v;
}

function toJS(v: unknown): unknown {
  if (v instanceof Y.Array) return v.toArray().map(toJS);
  if (v instanceof Y.Map) {
    const o: Record<string, unknown> = {};
    v.forEach((val, k) => (o[k] = toJS(val)));
    return o;
  }
  return v;
}

/** Tells a plugin's state whether the live doc holds the session's state yet. A live
 *  client starts with an empty doc and gets the whole session state from the server
 *  right after it connects. A write before that lands on the empty doc: seeding
 *  defaults, or the first entry of a record field, creates a fresh map where the session
 *  already has one, and Yjs may let the fresh one win, so the votes or questions in the
 *  session's map disappear for everyone. While `synced` is false the state holds its
 *  writes back and runs them, in order, once the session state has arrived. */
export interface SyncGate {
  readonly synced: boolean;
  /** Call `cb` once the state has arrived (at once if it already has). Returns an
   *  unsubscribe. */
  onSynced(cb: () => void): () => void;
}

export interface PluginState<T> {
  readonly root: Y.Map<unknown>;
  /** Current state as plain JS (missing fields filled from schema defaults). */
  snapshot(): T;
  /** Seed defaults (+ optional overrides) only if the state is empty. Before the live
   *  session state has arrived this (like every write) is held back, and the emptiness
   *  check runs against the session's real state once it is there. */
  ensureDefaults(initial?: Partial<T>): void;
  /** Replace a whole top-level field. */
  set<K extends keyof T>(key: K, value: T[K]): void;
  /** Set one entry of a record-typed field (concurrency-friendly). */
  recordSet<K extends keyof T>(field: K, key: string, value: unknown): void;
  recordDelete<K extends keyof T>(field: K, key: string): void;
  /** Observe deep changes; returns an unsubscribe fn. */
  subscribe(cb: (snap: T) => void): () => void;
}

export function pluginState<T>(
  doc: Y.Doc,
  id: string,
  schema: Schema<T>,
  instance = "",
  gate?: SyncGate,
): PluginState<T> {
  const root = doc.getMap<unknown>(instanceStateKey(id, instance));

  // Writes made before the session state arrived, run in order once it has.
  let held: Array<() => void> | null = null;
  const write = (fn: () => void) => {
    if (!gate || gate.synced) return fn();
    if (!held) {
      held = [];
      gate.onSynced(() => {
        const run = held ?? [];
        held = null;
        for (const f of run) f();
      });
    }
    held.push(fn);
  };

  const snapshot = (): T => {
    const base = schema.default() as Record<string, unknown>;
    root.forEach((val, key) => (base[key] = toJS(val)));
    // The doc is shared with an untrusted audience over the live link, which can write
    // arbitrary JSON into a plugin's audience-writable fields. Coerce against the schema
    // so a malformed remote value (e.g. an object where a string is expected) can never
    // reach a plugin's render as an invalid React child and crash the whole deck.
    return schema.sanitize(base);
  };

  return {
    root,
    snapshot,
    ensureDefaults(initial) {
      write(() => {
        if (root.size > 0) return;
        const init = { ...(schema.default() as Record<string, unknown>), ...(initial ?? {}) };
        doc.transact(() => {
          for (const [k, v] of Object.entries(init)) root.set(k, toY(v));
        });
      });
    },
    set(key, value) {
      write(() => doc.transact(() => root.set(key as string, toY(value))));
    },
    recordSet(field, key, value) {
      write(() =>
        doc.transact(() => {
          let m = root.get(field as string);
          if (!(m instanceof Y.Map)) {
            m = new Y.Map();
            root.set(field as string, m);
          }
          (m as Y.Map<unknown>).set(key, toY(value));
        }),
      );
    },
    recordDelete(field, key) {
      write(() =>
        doc.transact(() => {
          const m = root.get(field as string);
          if (m instanceof Y.Map) m.delete(key);
        }),
      );
    },
    subscribe(cb) {
      const handler = () => cb(snapshot());
      root.observeDeep(handler);
      return () => root.unobserveDeep(handler);
    },
  };
}
