// A tiny runtime-typed schema for plugin shared state. Primitives are Schema
// *instances* (t.string), containers are factories (t.array(t.string)). Gives
// runtime validation + a default value + static type inference.

export interface Schema<T> {
  readonly kind: string;
  /** Validate & coerce; throws on invalid. */
  parse(value: unknown): T;
  /** Non-throwing parse. */
  safeParse(value: unknown): { ok: true; value: T } | { ok: false; error: string };
  /** Best-effort coercion to a valid `T`: repairs/drops invalid parts instead of
   *  throwing — an out-of-shape primitive falls back to the default, a record/array
   *  drops the entries that fail. Used to make *untrusted remote state* safe to read
   *  and render: an audience peer can write any JSON into its allowed live fields, so
   *  a malformed value (e.g. a non-string where a string is expected) must never reach
   *  React as a child and crash the whole deck. */
  sanitize(value: unknown): T;
  /** A sensible empty/default value. */
  default(): T;
  /** phantom, for `Infer<>` only */
  readonly _t?: T;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

function make<T>(kind: string, def: () => T, check: (v: unknown) => v is T): Schema<T> {
  return {
    kind,
    default: def,
    parse(value) {
      if (!check(value)) throw new TypeError(`expected ${kind}, got ${typeof value}`);
      return value;
    },
    safeParse(value) {
      return check(value) ? { ok: true, value } : { ok: false, error: `expected ${kind}` };
    },
    sanitize(value) {
      return check(value) ? value : def();
    },
  };
}

export const t = {
  string: make<string>("string", () => "", (v): v is string => typeof v === "string"),
  number: make<number>("number", () => 0, (v): v is number => typeof v === "number" && Number.isFinite(v)),
  boolean: make<boolean>("boolean", () => false, (v): v is boolean => typeof v === "boolean"),

  array<I>(item: Schema<I>): Schema<I[]> {
    return {
      kind: "array",
      default: () => [],
      parse(value) {
        if (!Array.isArray(value)) throw new TypeError("expected array");
        return value.map((v) => item.parse(v));
      },
      safeParse(value) {
        if (!Array.isArray(value)) return { ok: false, error: "expected array" };
        try {
          return { ok: true, value: value.map((v) => item.parse(v)) };
        } catch (e) {
          return { ok: false, error: String((e as Error).message) };
        }
      },
      sanitize(value) {
        if (!Array.isArray(value)) return [];
        const out: I[] = [];
        for (const v of value) {
          const r = item.safeParse(v);
          if (r.ok) out.push(r.value);
        }
        return out;
      },
    };
  },

  record<V>(value: Schema<V>): Schema<Record<string, V>> {
    return {
      kind: "record",
      default: () => ({}),
      parse(input) {
        if (typeof input !== "object" || input === null || Array.isArray(input)) throw new TypeError("expected record");
        const out: Record<string, V> = {};
        for (const [k, v] of Object.entries(input)) out[k] = value.parse(v);
        return out;
      },
      safeParse(input) {
        try {
          return { ok: true, value: this.parse(input) };
        } catch (e) {
          return { ok: false, error: String((e as Error).message) };
        }
      },
      sanitize(input) {
        if (typeof input !== "object" || input === null || Array.isArray(input)) return {};
        const out: Record<string, V> = {};
        // Drop entries whose value fails the schema (an audience peer could write a
        // record entry of the wrong shape, e.g. a Q&A question whose `text` is an
        // object); the surviving good entries are returned untouched.
        for (const [k, v] of Object.entries(input)) {
          const r = value.safeParse(v);
          if (r.ok) out[k] = r.value;
        }
        return out;
      },
    };
  },

  object<S extends Record<string, Schema<unknown>>>(shape: S): Schema<{ [K in keyof S]: Infer<S[K]> }> {
    type Out = { [K in keyof S]: Infer<S[K]> };
    return {
      kind: "object",
      default: () => {
        const out = {} as Out;
        for (const k in shape) (out as Record<string, unknown>)[k] = shape[k]!.default();
        return out;
      },
      parse(input) {
        if (typeof input !== "object" || input === null || Array.isArray(input)) throw new TypeError("expected object");
        const out = {} as Out;
        for (const k in shape) {
          (out as Record<string, unknown>)[k] = shape[k]!.parse((input as Record<string, unknown>)[k]);
        }
        return out;
      },
      safeParse(input) {
        try {
          return { ok: true, value: this.parse(input) };
        } catch (e) {
          return { ok: false, error: String((e as Error).message) };
        }
      },
      sanitize(input) {
        const src =
          typeof input === "object" && input !== null && !Array.isArray(input)
            ? (input as Record<string, unknown>)
            : {};
        const out = {} as Out;
        // Coerce each known field independently; an unrepairable field falls back to
        // its default, and keys outside the shape are dropped.
        for (const k in shape) (out as Record<string, unknown>)[k] = shape[k]!.sanitize(src[k]);
        return out;
      },
    };
  },
};

/** `schema({...})` is sugar for `t.object({...})`. */
export const schema = t.object;
