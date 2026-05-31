import { useState } from "react";

export type BrandColors = {
  primary: string;
  accent: string;
  accent2: string;
  text: string;
  muted: string;
  border: string;
  surface: string;
  viz: string[];
};

function read(): BrandColors {
  const s = getComputedStyle(document.body);
  const v = (k: string) => s.getPropertyValue(k).trim();
  return {
    primary: v("--brand-primary") || "#caff4d",
    accent: v("--brand-accent") || "#62e8ff",
    accent2: v("--brand-accent2") || "#ff7a59",
    text: v("--brand-text") || "#f3f1ea",
    muted: v("--brand-muted") || "#8b93a7",
    border: v("--brand-border") || "#222734",
    surface: v("--brand-surface") || "#11141b",
    viz: [0, 1, 2, 3, 4, 5].map((i) => v(`--brand-viz-${i}`)).filter(Boolean),
  };
}

/** Reads the active brand's chart colors from CSS variables (synchronously, so
 *  no flash). Charts pull their palette from the theme — re-brand and they follow. */
export function useBrandColors(): BrandColors {
  const [c] = useState(read);
  return c;
}
