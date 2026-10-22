// What the projection screen and the speaker's laptop show. Both are 2D canvases
// mapped onto planes in the hall, redrawn only when their content changes.

import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from "three";
import { FONT_MONO, FONT_SANS, PALETTE } from "./palette";

export type PollState = { question: string; options: string[]; counts: number[] };
export type Question = { text: string; votes: number; fresh?: boolean };

export type ScreenContent =
  | { kind: "title"; joined: number }
  | { kind: "poll"; poll: PollState }
  | { kind: "qa"; questions: Question[] }
  | { kind: "tug"; left: number; right: number }
  | { kind: "edit"; edit: EditState };

/** Who is editing the slide, shown as a name tag where their change lands. */
export type Editor = { name: string; color: string };
export type EditState = {
  question: string;
  options: string[];
  note: string;
  /** which part each editor is on right now: "question", "option:<i>" or "note" */
  cursors: { who: Editor; at: string }[];
};


function texture(canvas: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 8;
  return t;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

export class ProjectionScreen {
  readonly canvas = document.createElement("canvas");
  readonly texture: CanvasTexture;
  private readonly g: CanvasRenderingContext2D;
  static readonly W = 1600;
  static readonly H = 900;

  constructor() {
    this.canvas.width = ProjectionScreen.W;
    this.canvas.height = ProjectionScreen.H;
    this.g = this.canvas.getContext("2d")!;
    this.texture = texture(this.canvas);
  }

  /** Where a poll bar ends, in 0..1 screen coordinates (u right, v down). */
  static barEnd(i: number, share: number): [number, number] {
    return [0.08 + 0.62 * share, 0.5 + i * 0.15];
  }
  /** Where the question list starts, in 0..1 screen coordinates. */
  static qaSlot(i: number): [number, number] {
    return [0.5, 0.36 + i * 0.19];
  }

  draw(c: ScreenContent, slide: number, total: number) {
    const g = this.g;
    const { W, H } = ProjectionScreen;
    g.fillStyle = PALETTE.screenBg;
    g.fillRect(0, 0, W, H);
    // chrome: live dot, slide number
    g.fillStyle = PALETTE.sage;
    g.beginPath();
    g.arc(98, 92, 10, 0, Math.PI * 2);
    g.fill();
    g.font = `600 30px ${FONT_MONO}`;
    g.fillText("LIVE", 124, 103);
    g.fillStyle = PALETTE.muted;
    g.textAlign = "right";
    g.fillText(`${String(slide).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, W - 90, 103);
    g.textAlign = "left";

    if (c.kind === "title") this.title(c.joined);
    else if (c.kind === "poll") this.poll(c.poll);
    else if (c.kind === "qa") this.qa(c.questions);
    else if (c.kind === "tug") this.tug(c.left, c.right);
    else this.edit(c.edit);
    this.texture.needsUpdate = true;
  }

  private title(joined: number) {
    const g = this.g;
    g.fillStyle = PALETTE.text;
    g.font = `700 128px ${FONT_SANS}`;
    g.fillText("Welcome,", 96, 420);
    g.fillText("everyone", 96, 556);
    g.fillStyle = PALETTE.gold;
    g.fillRect(96, 588, 520, 10);
    // the join card: a phone glyph, not a code anyone could try to scan
    const x = 1090, y = 280, w = 400, h = 380;
    g.strokeStyle = "#3a4530";
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(x, y, w, h, 28);
    g.stroke();
    g.strokeStyle = PALETTE.goldSoft;
    g.lineWidth = 8;
    g.beginPath();
    g.roundRect(x + 150, y + 54, 100, 176, 18);
    g.stroke();
    g.fillStyle = PALETTE.gold;
    g.fillRect(x + 166, y + 84, 68, 112);
    g.fillStyle = PALETTE.text;
    g.font = `600 40px ${FONT_SANS}`;
    g.textAlign = "center";
    g.fillText("Join on your phone", x + w / 2, y + 296);
    g.fillStyle = PALETTE.goldSoft;
    g.font = `500 34px ${FONT_MONO}`;
    g.fillText(`${joined} joined`, x + w / 2, y + 346);
    g.textAlign = "left";
  }

  private poll(p: PollState) {
    const g = this.g;
    const { W } = ProjectionScreen;
    g.fillStyle = PALETTE.text;
    g.font = `700 84px ${FONT_SANS}`;
    g.fillText(p.question, 128, 300);
    const total = p.counts.reduce((a, b) => a + b, 0);
    const max = Math.max(1, ...p.counts);
    g.font = `500 30px ${FONT_MONO}`;
    g.fillStyle = PALETTE.muted;
    g.fillText(`${total} votes`, 128, 370);
    p.options.forEach((o, i) => {
      const [, v] = ProjectionScreen.barEnd(i, 0);
      const y = v * 900;
      g.fillStyle = PALETTE.text;
      g.font = `600 42px ${FONT_SANS}`;
      g.fillText(o, 128, y - 26);
      // track and bar
      g.fillStyle = "#232b1c";
      roundRect(g, 128, y - 8, W * 0.62, 30, 15);
      g.fill();
      const share = p.counts[i]! / max;
      g.fillStyle = PALETTE.gold;
      roundRect(g, 128, y - 8, Math.max(30, W * 0.62 * share), 30, 15);
      g.fill();
      g.fillStyle = PALETTE.goldSoft;
      g.font = `500 40px ${FONT_MONO}`;
      g.fillText(String(p.counts[i]), 128 + W * 0.62 + 36, y + 18);
    });
  }

  private qa(questions: Question[]) {
    const g = this.g;
    const { W } = ProjectionScreen;
    g.fillStyle = PALETTE.text;
    g.font = `700 72px ${FONT_SANS}`;
    g.fillText("Questions from the room", 128, 220);
    questions.slice(0, 3).forEach((q, i) => {
      const [, v] = ProjectionScreen.qaSlot(i);
      const y = v * 900 - 62;
      const top = i === 0;
      g.fillStyle = top ? "#231f10" : "#192014";
      roundRect(g, 128, y, W - 256, 132, 18);
      g.fill();
      g.lineWidth = top ? 4 : 2;
      g.strokeStyle = top ? PALETTE.gold : "#35402c";
      g.stroke();
      g.fillStyle = PALETTE.text;
      g.font = `600 44px ${FONT_SANS}`;
      g.fillText(q.text, 176, y + 82);
      g.fillStyle = top ? PALETTE.goldSoft : PALETTE.muted;
      g.font = `500 38px ${FONT_MONO}`;
      g.textAlign = "right";
      g.fillText(`▲ ${q.votes}`, W - 176, y + 80);
      g.textAlign = "left";
    });
  }

  /** Where the rope ends sit, in 0..1 screen coordinates. */
  static ropeEnd(side: 0 | 1): [number, number] {
    return [side === 0 ? 0.12 : 0.88, 0.6];
  }

  private tug(left: number, right: number) {
    const g = this.g;
    const { W } = ProjectionScreen;
    g.fillStyle = PALETTE.text;
    g.font = `700 84px ${FONT_SANS}`;
    g.fillText("Tug of war", 128, 250);
    g.fillStyle = PALETTE.muted;
    g.font = `500 40px ${FONT_SANS}`;
    g.fillText("Left half of the room against the right half. Tap to pull.", 128, 320);
    const y = 0.6 * 900;
    const x0 = 0.12 * W, x1 = 0.88 * W;
    const p = Math.max(-1, Math.min(1, (right - left) / 26));
    const knot = (x0 + x1) / 2 + p * (x1 - x0) * 0.32;
    // the rope: each side in its team's color up to the knot
    g.lineCap = "round";
    g.lineWidth = 14;
    g.strokeStyle = PALETTE.gold;
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(knot, y);
    g.stroke();
    g.strokeStyle = PALETTE.sage;
    g.beginPath();
    g.moveTo(knot, y);
    g.lineTo(x1, y);
    g.stroke();
    // the middle line and the knot
    g.strokeStyle = "#3a4530";
    g.lineWidth = 3;
    g.setLineDash([10, 10]);
    g.beginPath();
    g.moveTo(W / 2, y - 120);
    g.lineTo(W / 2, y + 120);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = PALETTE.paper;
    g.beginPath();
    g.moveTo(knot, y - 46);
    g.lineTo(knot + 30, y);
    g.lineTo(knot, y + 46);
    g.lineTo(knot - 30, y);
    g.closePath();
    g.fill();
    g.font = `600 44px ${FONT_SANS}`;
    g.fillStyle = PALETTE.goldSoft;
    g.fillText("Left", x0, y + 120);
    g.font = `500 44px ${FONT_MONO}`;
    g.fillText(String(left), x0 + 110, y + 120);
    g.textAlign = "right";
    g.fillStyle = PALETTE.sage;
    g.fillText(String(right), x1 - 140, y + 120);
    g.font = `600 44px ${FONT_SANS}`;
    g.fillText("Right", x1, y + 120);
    g.textAlign = "left";
  }

  /** Where each part of the edited slide sits, in 0..1 screen coordinates. */
  static editSpot(at: string): [number, number] {
    if (at === "question") return [0.45, 0.27];
    if (at === "note") return [0.78, 0.4];
    const i = Number(at.split(":")[1] ?? 0);
    return [0.2, 0.52 + i * 0.105];
  }

  private edit(e: EditState) {
    const g = this.g;
    const { W } = ProjectionScreen;
    g.fillStyle = PALETTE.text;
    g.font = `700 80px ${FONT_SANS}`;
    g.fillText(e.question, 128, 280);
    g.fillStyle = PALETTE.goldSoft;
    g.font = `500 36px ${FONT_MONO}`;
    g.textAlign = "right";
    g.fillText(e.note, W - 128, 370);
    g.textAlign = "left";
    e.options.forEach((o, i) => {
      const y = (0.52 + i * 0.105) * 900;
      g.strokeStyle = "#35402c";
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(128, y - 52, W * 0.58, 76, 16);
      g.stroke();
      g.fillStyle = PALETTE.text;
      g.font = `600 40px ${FONT_SANS}`;
      g.fillText(o, 164, y);
    });
    // name tags: where each editor's change is landing
    for (const c of e.cursors) {
      const [u, v] = ProjectionScreen.editSpot(c.at);
      g.font = `600 30px ${FONT_SANS}`;
      const w = g.measureText(c.who.name).width + 36;
      const x = c.at === "note" ? u * W - w + 120 : u * W;
      const y = v * 900 - (c.at === "question" ? 120 : 70);
      g.fillStyle = c.who.color;
      g.beginPath();
      g.roundRect(x, y - 40, w, 50, 10);
      g.fill();
      g.fillRect(x, y + 10, 4, 34);
      g.fillStyle = PALETTE.bg;
      g.fillText(c.who.name, x + 18, y - 5);
    }
  }
}

const CODE = [
  [["k", "import"], ["p", " { "], ["t", "Plugin"], ["p", " } "], ["k", "from"], ["s", ' "@liebstoeckel/engine"']],
  [],
  [["p", "<"], ["t", "Plugin"], ["a", " id"], ["p", "="], ["s", '"poll"'], ["a", " props"], ["p", "={{"]],
  [["a", "  question"], ["p", ": "], ["s", '"Where do we go next?"'], ["p", ","]],
  [["a", "  options"], ["p", ": ["], ["s", '"Lisbon"'], ["p", ", "], ["s", '"Berlin"'], ["p", ", "], ["s", '"A cabin"'], ["p", "],"]],
  [["p", "}} />"]],
] as const;

const TOKEN_COLOR: Record<string, string> = { k: PALETTE.goldSoft, p: PALETTE.muted, t: PALETTE.paper, a: PALETTE.sage, s: "#d8c48e" };

export class LaptopScreen {
  readonly canvas = document.createElement("canvas");
  readonly texture: CanvasTexture;
  private readonly g: CanvasRenderingContext2D;
  /** characters of the code visible so far */
  private shown = -1;

  constructor() {
    this.canvas.width = 920;
    this.canvas.height = 540;
    this.g = this.canvas.getContext("2d")!;
    this.texture = texture(this.canvas);
  }

  reset() {
    this.shown = -1;
  }

  static readonly TOTAL = CODE.reduce((n, line) => n + line.reduce((m, [, t]) => m + t.length, 0) + 1, 0);

  draw(chars: number) {
    const c = Math.min(LaptopScreen.TOTAL, Math.floor(chars));
    if (c === this.shown) return;
    this.shown = c;
    const g = this.g;
    g.fillStyle = "#0d110b";
    g.fillRect(0, 0, 920, 540);
    g.fillStyle = "#1a2114";
    g.fillRect(0, 0, 920, 52);
    g.fillStyle = PALETTE.muted;
    g.font = `500 24px ${FONT_MONO}`;
    g.fillText("slides/02-poll.mdx", 28, 34);
    g.font = `500 25px ${FONT_MONO}`;
    let left = c;
    let y = 108;
    let cursor: [number, number] | null = null;
    for (const line of CODE) {
      let x = 28;
      for (const [k, text] of line) {
        if (left <= 0) break;
        const part = text.slice(0, left);
        g.fillStyle = TOKEN_COLOR[k]!;
        g.fillText(part, x, y);
        x += g.measureText(part).width;
        left -= part.length;
      }
      if (left > 0) left -= 1;
      cursor = [x, y];
      if (left <= 0) break;
      y += 50;
    }
    if (cursor && c < LaptopScreen.TOTAL) {
      g.fillStyle = PALETTE.gold;
      g.fillRect(cursor[0] + 2, cursor[1] - 22, 12, 28);
    }
    this.texture.needsUpdate = true;
  }
}
