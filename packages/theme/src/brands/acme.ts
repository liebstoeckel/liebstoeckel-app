import { defineTheme } from "../defineTheme";

export const acme = defineTheme({
  name: "acme",
  colors: {
    bg: "#0b0e14",
    surface: "#141925",
    text: "#e6eaf2",
    muted: "#8a93a6",
    border: "#222a3a",
    primary: "#3b82f6",
    accent: "#22d3ee",
    onPrimary: "#ffffff",
  },
  // Bundled families only: a family without a bundled @font-face renders as
  // whatever the viewer's system falls back to, so the same deck looks
  // different per machine (and in build-time thumbnails).
  fonts: {
    heading: '"Schibsted Grotesk Variable", system-ui, sans-serif',
    body: '"Schibsted Grotesk Variable", system-ui, sans-serif',
    mono: '"JetBrains Mono Variable", ui-monospace, monospace',
  },
});
