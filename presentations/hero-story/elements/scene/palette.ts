// The hall is drawn in the house palette: forest-charcoal ground, hairlines in
// sage and bone, and gold only where something is live (a phone, a vote, a
// question). Keeping gold for the live parts is what tells the story at a glance.

export const PALETTE = {
  bg: "#10140e",
  fill: "#1a2114", // faces: barely lighter than the ground, so edges carry the form
  fillLive: "#2a2410",
  room: "#4f5845", // far structure: risers, walls
  figure: "#7c8570", // people
  structure: "#9da28c", // stage, screen frame, lectern
  gold: "#c9a24b",
  goldSoft: "#e0c580",
  paper: "#f4f1e6",
  sage: "#9cae86",
  screenBg: "#141a10",
  text: "#e9e6d7",
  muted: "#9da28c",
} as const;

export const FONT_SANS = '"Schibsted Grotesk Variable", "Schibsted Grotesk", system-ui, sans-serif';
export const FONT_MONO = '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace';
