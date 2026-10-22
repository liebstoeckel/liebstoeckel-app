// Reaction icons, drawn as gold line glyphs so they belong to the drawing
// (and so they look the same everywhere, emoji fonts or not).

import { PALETTE } from "./palette";

export const REACTION_NAMES = ["Love", "Spark", "Laugh", "Applause"] as const;

/** Draws reaction `kind` (0 heart, 1 spark, 2 laugh, 3 clap) centered at x, y; `s` = 1 fits a 128 px box. */
export function drawIcon(g: CanvasRenderingContext2D, kind: number, x: number, y: number, s: number) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.strokeStyle = PALETTE.goldSoft;
  g.fillStyle = PALETTE.gold;
  g.lineWidth = 7;
  g.lineJoin = "round";
  g.lineCap = "round";
  if (kind === 0) {
    g.beginPath();
    g.moveTo(0, 38);
    g.bezierCurveTo(-56, 0, -40, -46, 0, -20);
    g.bezierCurveTo(40, -46, 56, 0, 0, 38);
    g.fill();
  } else if (kind === 1) {
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 ? 16 : 46;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  } else if (kind === 2) {
    g.beginPath();
    g.arc(0, 0, 42, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(0, 4, 22, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    g.beginPath();
    g.moveTo(-20, -12);
    g.lineTo(-9, -6);
    g.moveTo(20, -12);
    g.lineTo(9, -6);
    g.stroke();
  } else {
    for (const side of [-1, 1]) {
      g.save();
      g.rotate(side * 0.35);
      g.beginPath();
      g.roundRect(side * 14 - 14, -38, 28, 70, 14);
      g.stroke();
      g.restore();
    }
  }
  g.restore();
}
