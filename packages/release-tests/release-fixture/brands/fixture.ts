import { defineTheme } from "@liebstoeckel/theme";

/** A brand of the deck's own, so the build has to inject a [data-brand] block. */
export const fixture = defineTheme({
  name: "fixture",
  colors: {
    bg: "#10141c",
    surface: "#18202d",
    border: "#2a3446",
    text: "#eef1f6",
    muted: "#9aa4b5",
    primary: "#e8833a",
    accent: "#5cc8b2",
    accent2: "#c49bff",
    onPrimary: "#10141c",
  },
  fonts: {
    heading: '"Fixture Serif", Georgia, serif',
    body: '"Hanken Grotesk Variable", system-ui, sans-serif',
    mono: '"JetBrains Mono Variable", ui-monospace, monospace',
  },
  viz: ["#e8833a", "#5cc8b2", "#c49bff", "#f2c94c", "#6fa8ff"],
  glow: { a: "#2a1a10", b: "#0f2622" },
});
