import { defineTheme } from "../defineTheme";

// "liebstoeckel" — the house brand. Noir, all-grotesk: forest-charcoal ground,
// warm gold primary, sage secondary; a single confident grotesk for display + body,
// monospace for labels/code. The tokens below are the canonical brand spec.
export const liebstoeckel = defineTheme({
  name: "liebstoeckel",
  colors: {
    bg: "#10140e", // forest charcoal
    surface: "#1a2014", // raised panels
    border: "#2c3326",
    text: "#e9e6d7", // warm off-white
    muted: "#9da28c", // sage-gray
    primary: "#c9a24b", // gold
    accent: "#e0c580", // gold-soft (links, glow, interactive)
    accent2: "#9cae86", // sage
    onPrimary: "#10140e",
  },
  fonts: {
    heading: '"Schibsted Grotesk Variable", system-ui, sans-serif',
    body: '"Schibsted Grotesk Variable", system-ui, sans-serif',
    mono: '"JetBrains Mono Variable", ui-monospace, monospace',
  },
  // chart-series palette — gold → sage → soft-gold → teal → terracotta → olive
  viz: ["#c9a24b", "#9cae86", "#e0c580", "#6fa39b", "#c77d4a", "#b7c96b"],
  glow: { a: "#1d2a16", b: "#33280f" },
});
