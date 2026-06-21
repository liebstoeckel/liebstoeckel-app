import { defineTheme } from "../defineTheme";

// "Nocturne Data Lab", warm-tinted deep ink, expressive optical serif display,
// dual harmonized accents (chartreuse + cyan) with coral/amber for chart series.
export const nocturne = defineTheme({
  name: "nocturne",
  colors: {
    bg: "#08090c",
    surface: "#11141b",
    border: "#222734",
    text: "#f3f1ea",
    muted: "#8b93a7",
    primary: "#caff4d", // chartreuse
    accent: "#62e8ff", // cyan
    accent2: "#ff7a59", // coral
    onPrimary: "#08090c",
  },
  fonts: {
    heading: '"Fraunces Variable", "Times New Roman", serif',
    body: '"Hanken Grotesk Variable", system-ui, sans-serif',
    mono: '"JetBrains Mono Variable", ui-monospace, monospace',
  },
  // chart-series palette (chartreuse → cyan → coral → violet → amber)
  viz: ["#caff4d", "#62e8ff", "#ff7a59", "#b692ff", "#ffd166", "#4ade80"],
  glow: { a: "#1b3a4b", b: "#2a1f3d" },
});
