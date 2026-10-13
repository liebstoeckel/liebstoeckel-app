// A small message catalog for what the audience reads, in English and German.
//
// Each surface (the engine's live chrome, a plugin, the pages around a live session)
// keeps its own catalog next to its code and picks a language with the same rule:
// a `lang` override when there is one (`?lang=de` on the page), else the reader's
// preferred languages (`navigator.languages` in a browser, `Accept-Language` on a
// server), else English. No runtime, no loader: a catalog is a typed object per
// language, and the type makes every language carry every message.

/** The languages the audience can read the live chrome in. */
export const LOCALES = ["en", "de"] as const;

export type Locale = (typeof LOCALES)[number];

/** The language used when nothing better matches. */
export const DEFAULT_LOCALE: Locale = "en";

/** Whether `v` is a supported language code (exact, lower case). */
export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

/** The supported language a tag like `de-AT` or `EN` stands for, or null. */
function baseLocale(tag: string): Locale | null {
  const base = tag.trim().toLowerCase().split(/[-_]/)[0] ?? "";
  return isLocale(base) ? base : null;
}

/** The reader's languages from an `Accept-Language` header, best first (q-values
 *  honoured, `q=0` dropped). */
function fromHeader(header: string): string[] {
  const out: Array<{ tag: string; q: number; i: number }> = [];
  header.split(",").forEach((part, i) => {
    const [tag, ...params] = part.split(";").map((s) => s.trim());
    if (!tag) return;
    const qp = params.find((p) => p.toLowerCase().startsWith("q="));
    const q = qp === undefined ? 1 : Number(qp.slice(2));
    if (!Number.isFinite(q) || q <= 0) return;
    out.push({ tag, q, i });
  });
  return out.sort((a, b) => b.q - a.q || a.i - b.i).map((x) => x.tag);
}

/**
 * The language to show: `override` if it names a supported language (a `?lang=`
 * parameter), else the first of the reader's languages that is supported, else
 * English. `prefs` is `navigator.languages` (a list) or an `Accept-Language` header.
 */
export function pickLocale(prefs: readonly string[] | string | null | undefined, override?: string | null): Locale {
  if (override) {
    const o = baseLocale(override);
    if (o) return o;
  }
  const list = typeof prefs === "string" ? fromHeader(prefs) : (prefs ?? []);
  for (const tag of list) {
    if (tag === "*") break;
    const l = baseLocale(tag);
    if (l) return l;
  }
  return DEFAULT_LOCALE;
}

/** A message: plain text, or text built from parameters. */
export type Message = string | ((...args: any[]) => string);

/** One language's messages, by key. */
export type Messages = Record<string, Message>;

/** A message set with its texts widened to `string`: what each language must provide
 *  for a key (the same parameters, any text). */
export type MessageShape<M extends Messages> = {
  [K in keyof M]: M[K] extends (...args: infer A) => string ? (...args: A) => string : string;
};

/** Every language's messages, with the English set as the shape the others follow. */
export type Catalog<M extends Messages> = { en: M } & { [L in Exclude<Locale, "en">]: MessageShape<M> };

/**
 * Declare a catalog: one set of messages per language, every language with every key
 * of the English set and the same parameters. Returns a lookup by language.
 *
 * ```ts
 * const msg = defineMessages({
 *   en: { sending: (choice: string) => `Sending your vote: ${choice}` },
 *   de: { sending: (choice: string) => `Ihre Stimme wird gesendet: ${choice}` },
 * });
 * msg(locale).sending("Blue");
 * ```
 */
export function defineMessages<M extends Messages>(catalog: Catalog<M>): (locale?: Locale | null) => MessageShape<M> {
  const sets = catalog as unknown as Record<Locale, MessageShape<M>>;
  return (locale) => (locale && isLocale(locale) ? sets[locale] : sets.en);
}

/** The language for a page in a browser: `?lang=` in the address, else the browser's
 *  languages. English outside a browser. */
export function browserLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  let override: string | null = null;
  try {
    override = new URLSearchParams(globalThis.location?.search ?? "").get("lang");
  } catch {
    /* no address to read */
  }
  const langs = navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : [];
  return pickLocale(langs, override);
}
