// A brand = one typed token object. This is the single source of truth for a
// corporate design; everything visual derives from it. See defineTheme/themeToCss.
export interface Theme {
  /** kebab-case id, used as the [data-brand="..."] selector */
  name: string;
  colors: {
    bg: string;
    surface: string;
    text: string;
    muted: string;
    primary: string;
    accent: string;
    onPrimary: string;
    /** optional: hairline/border color */
    border?: string;
    /** optional: secondary accent for richer compositions + charts */
    accent2?: string;
  };
  fonts: {
    heading: string;
    body: string;
    mono: string;
  };
  /** optional: ordered chart-series palette, exposed as --brand-viz-0..n */
  viz?: string[];
  /** optional: two-stop atmosphere gradient (--brand-glow-a / --brand-glow-b) */
  glow?: { a: string; b: string };
}
