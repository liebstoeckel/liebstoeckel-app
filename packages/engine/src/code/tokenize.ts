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
import type { CodeToken, TokenizedStep } from "./types";

const THEME = createCssVariablesTheme({ name: "brand", variablePrefix: "--shiki-", fontStyle: true });

// A pragmatic default language set; build-time cost only.
const LANGS = [
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
] as const;

let hl: Promise<Highlighter> | null = null;
function highlighter(): Promise<Highlighter> {
  if (!hl) hl = createHighlighter({ themes: [THEME], langs: LANGS as unknown as string[] });
  return hl;
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
  const useLang = (h.getLoadedLanguages().includes(resolved) ? resolved : "text") as
    | BundledLanguage
    | SpecialLanguage;
  const src = code.replace(/\n+$/, "");
  const { tokens } = h.codeToTokens(src, { lang: useLang, theme: "brand" });
  const lines: CodeToken[][] = tokens.map((line) =>
    line.map((t) => ({ content: t.content, color: t.color, fontStyle: t.fontStyle })),
  );
  return { lang: resolved, lines };
}
