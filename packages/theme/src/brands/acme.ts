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
  fonts: {
    heading: '"Inter", system-ui, sans-serif',
    body: '"Inter", system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  },
});
