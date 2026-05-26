import { useState } from "react";
import type { ThemeTokens } from "@liebstoeckel/plugin-sdk";

export type { ThemeTokens };

const FALLBACK: ThemeTokens = {
  bg: "#08090c",
  surface: "#11141b",
  border: "#222734",
  text: "#f3f1ea",
  muted: "#8b93a7",
  primary: "#caff4d",
  accent: "#62e8ff",
  accent2: "#ff7a59",
  onPrimary: "#08090c",
  fontHeading: "serif",
  fontBody: "sans-serif",
  fontMono: "monospace",
  viz: ["#caff4d", "#62e8ff", "#ff7a59", "#b692ff", "#ffd166", "#4ade80"],
};

/** Reads the active brand's resolved tokens from CSS variables on <body>.
 *  Safe outside the browser (returns sensible fallbacks). */
export function readTheme(): ThemeTokens {
  if (typeof document === "undefined" || !document.body) return FALLBACK;
  const s = getComputedStyle(document.body);
  const v = (k: string, f: string) => s.getPropertyValue(k).trim() || f;
  return {
    bg: v("--brand-bg", FALLBACK.bg),
    surface: v("--brand-surface", FALLBACK.surface),
    border: v("--brand-border", FALLBACK.border),
    text: v("--brand-text", FALLBACK.text),
    muted: v("--brand-muted", FALLBACK.muted),
    primary: v("--brand-primary", FALLBACK.primary),
    accent: v("--brand-accent", FALLBACK.accent),
    accent2: v("--brand-accent2", FALLBACK.accent2),
    onPrimary: v("--brand-on-primary", FALLBACK.onPrimary),
    fontHeading: v("--brand-font-heading", FALLBACK.fontHeading),
    fontBody: v("--brand-font-body", FALLBACK.fontBody),
    fontMono: v("--brand-font-mono", FALLBACK.fontMono),
    viz: [0, 1, 2, 3, 4, 5].map((i) => v(`--brand-viz-${i}`, FALLBACK.viz[i] ?? FALLBACK.primary)),
  };
}

export function useTheme(): ThemeTokens {
  const [tokens] = useState(readTheme);
  return tokens;
}
