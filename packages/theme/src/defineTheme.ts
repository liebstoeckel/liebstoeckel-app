import type { Theme } from "./tokens";

/** Identity helper for authoring + type-checking a brand. */
export const defineTheme = (t: Theme): Theme => t;

/** Emit a brand's tokens as a [data-brand] CSS-variable block. The `@theme inline`
 *  bridge in index.css maps Tailwind utilities onto these --brand-* vars, so
 *  switching [data-brand] re-skins the whole deck. */
export function themeToCss(t: Theme): string {
  const c = t.colors;
  const f = t.fonts;
  const decls: string[] = [
    `--brand-bg:${c.bg};`,
    `--brand-surface:${c.surface};`,
    `--brand-text:${c.text};`,
    `--brand-muted:${c.muted};`,
    `--brand-primary:${c.primary};`,
    `--brand-accent:${c.accent};`,
    `--brand-on-primary:${c.onPrimary};`,
    `--brand-font-heading:${f.heading};`,
    `--brand-font-body:${f.body};`,
    `--brand-font-mono:${f.mono};`,
  ];
  if (c.border) decls.push(`--brand-border:${c.border};`);
  if (c.accent2) decls.push(`--brand-accent2:${c.accent2};`);
  if (t.glow) decls.push(`--brand-glow-a:${t.glow.a};`, `--brand-glow-b:${t.glow.b};`);
  (t.viz ?? []).forEach((v, i) => decls.push(`--brand-viz-${i}:${v};`));

  return `[data-brand="${t.name}"]{${decls.join("")}}`;
}
