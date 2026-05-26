/** Resolved brand tokens handed to plugin client components (for canvas/SVG use,
 *  where you need color strings rather than CSS classes). Read at runtime from the
 *  active brand's CSS variables by `@liebstoeckel/plugin-ui`'s `useTheme()`. */
export interface ThemeTokens {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  accent: string;
  accent2: string;
  onPrimary: string;
  fontHeading: string;
  fontBody: string;
  fontMono: string;
  viz: string[];
}
