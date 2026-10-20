// BUILD-TIME ONLY. Tokenizes code with Shiki using its css-variables theme, so
// every token's color is a `var(--shiki-token-*)` string that the theme binds to
// the active brand at runtime. Imported only from the `code` macro (stripped from
// the browser bundle) and from build tooling, never from the deck runtime.
import {
  createCssVariablesTheme,
  createHighlighter,
  type BundledLanguage,
  type Highlighter,
  type SpecialLanguage,
} from "shiki";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import type { CodeToken, TokenizedStep } from "./types";

const THEME = createCssVariablesTheme({ name: "brand", variablePrefix: "--shiki-", fontStyle: true });

// The languages a code state can be highlighted in; anything else is plain text.
// Build-time cost only, and each grammar loads the first time a state uses it.
const LANGS = new Set([
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "json",
  "bash",
  "html",
  "css",
  "python",
  "rust",
  "go",
  "sql",
  "yaml",
  "markdown",
  "diff",
]);

let hl: Promise<Highlighter> | null = null;
function highlighter(): Promise<Highlighter> {
  // The JavaScript regex engine instead of the default oniguruma WASM one: the
  // macro runs inside the bundler, where awaiting off-thread work such as
  // WebAssembly.compile can deadlock the build (the bundler blocks on the macro
  // promise while the completion needs the loop to tick). Pure-JS regexes have
  // nothing off-thread to await, and drop the WASM payload from build time.
  if (!hl) hl = createHighlighter({ themes: [THEME], langs: [], engine: createJavaScriptRegexEngine() });
  return hl;
}

const loading = new Map<string, Promise<void>>();
async function ensureLanguage(h: Highlighter, lang: string): Promise<boolean> {
  if (!LANGS.has(lang)) return false;
  if (!h.getLoadedLanguages().includes(lang)) {
    let p = loading.get(lang);
    if (!p) loading.set(lang, (p = h.loadLanguage(lang as BundledLanguage)));
    await p;
  }
  return true;
}

function aliasLang(lang: string): string {
  const l = lang.toLowerCase();
  return (
    {
      ts: "typescript",
      js: "javascript",
      mjs: "javascript",
      sh: "bash",
      shell: "bash",
      zsh: "bash",
      md: "markdown",
      yml: "yaml",
      py: "python",
      rs: "rust",
    }[l] ?? l
  );
}

/** Tokenize one code state. Unknown languages fall back to plain text. */
export async function tokenizeStep(code: string, lang = "ts"): Promise<TokenizedStep> {
  const h = await highlighter();
  const resolved = aliasLang(lang);
  const useLang = ((await ensureLanguage(h, resolved)) ? resolved : "text") as BundledLanguage | SpecialLanguage;
  const src = code.replace(/\n+$/, "");
  // No time limit per line. Shiki's default (500 ms) gives up on a line and emits
  // the rest as one token; the first line after a cold start can take that long
  // while the grammar's expressions compile, so the result depended on how fast
  // the machine was (a cold build shipped `greet(name) {` as one token).
  const { tokens } = h.codeToTokens(src, { lang: useLang, theme: "brand", tokenizeTimeLimit: 0 });
  const lines: CodeToken[][] = tokens.map((line) =>
    line.map((t) => ({ content: t.content, color: t.color, fontStyle: t.fontStyle })),
  );
  return { lang: resolved, lines };
}
