import { defineTheme } from "../defineTheme";

export const sunset = defineTheme({
  name: "sunset",
  colors: {
    bg: "#1a1018",
    surface: "#2a1a22",
    text: "#fdf2f0",
    muted: "#c79a93",
    border: "#3a2630",
    primary: "#f97316",
    accent: "#f43f5e",
    onPrimary: "#1a1018",
  },
  // Bundled families only (see acme.ts): unbundled fonts render per-machine.
  fonts: {
    heading: '"Hanken Grotesk Variable", system-ui, sans-serif',
    body: '"Hanken Grotesk Variable", system-ui, sans-serif',
    mono: '"JetBrains Mono Variable", ui-monospace, monospace',
  },
});
