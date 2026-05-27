import * as Y from "yjs";
import type { Schema } from "./schema";

// Maps a plugin's typed state onto a Y.Map at `plugin:<id>`. Object/record fields
// become nested Y.Maps (concurrent writes merge — e.g. poll votes); arrays become
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

export interface PluginState<T> {
  readonly root: Y.Map<unknown>;
  /** Current state as plain JS (missing fields filled from schema defaults). */
  snapshot(): T;
  /** Seed defaults (+ optional overrides) only if the state is empty. */
  ensureDefaults(initial?: Partial<T>): void;
  /** Replace a whole top-level field. */
  set<K extends keyof T>(key: K, value: T[K]): void;
  /** Set one entry of a record-typed field (concurrency-friendly). */
  recordSet<K extends keyof T>(field: K, key: string, value: unknown): void;
  recordDelete<K extends keyof T>(field: K, key: string): void;
  /** Observe deep changes; returns an unsubscribe fn. */
  subscribe(cb: (snap: T) => void): () => void;
}

export function pluginState<T>(doc: Y.Doc, id: string, schema: Schema<T>): PluginState<T> {
  const root = doc.getMap<unknown>(`plugin:${id}`);

  const snapshot = (): T => {
    const base = schema.default() as Record<string, unknown>;
    root.forEach((val, key) => (base[key] = toJS(val)));
    return base as T;
  };

  return {
    root,
    snapshot,
    ensureDefaults(initial) {
      if (root.size > 0) return;
      const init = { ...(schema.default() as Record<string, unknown>), ...(initial ?? {}) };
      doc.transact(() => {
        for (const [k, v] of Object.entries(init)) root.set(k, toY(v));
      });
    },
    set(key, value) {
      doc.transact(() => root.set(key as string, toY(value)));
    },
    recordSet(field, key, value) {
      doc.transact(() => {
        let m = root.get(field as string);
        if (!(m instanceof Y.Map)) {
          m = new Y.Map();
          root.set(field as string, m);
        }
        (m as Y.Map<unknown>).set(key, toY(value));
      });
    },
    recordDelete(field, key) {
      doc.transact(() => {
        const m = root.get(field as string);
        if (m instanceof Y.Map) m.delete(key);
      });
    },
    subscribe(cb) {
      const handler = () => cb(snapshot());
      root.observeDeep(handler);
      return () => root.unobserveDeep(handler);
    },
  };
}
