// A tiny runtime-typed schema for plugin shared state. Primitives are Schema
// *instances* (t.string), containers are factories (t.array(t.string)). Gives
// runtime validation + a default value + static type inference.

export interface Schema<T> {
  readonly kind: string;
  /** Validate & coerce; throws on invalid. */
  parse(value: unknown): T;
  /** Non-throwing parse. */
  safeParse(value: unknown): { ok: true; value: T } | { ok: false; error: string };
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
    };
  },
};

/** `schema({...})` is sugar for `t.object({...})`. */
export const schema = t.object;
