// What the projection screen and the speaker's laptop show. Both are 2D canvases
// mapped onto planes in the hall, redrawn only when their content changes.

import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from "three";
import { drawIcon } from "./icons";
import { FONT_MONO, FONT_SANS, PALETTE } from "./palette";

export type PollState = { question: string; options: string[]; counts: number[] };
export type Question = { text: string; votes: number; fresh?: boolean };

export type ScreenContent =
  | { kind: "title"; joined: number }
  | { kind: "poll"; poll: PollState }
  | { kind: "qa"; questions: Question[] }
  | { kind: "reactions"; tally: number[] };


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
    else this.reactions(c.tally);
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

  private reactions(tally: number[]) {
    const g = this.g;
    g.fillStyle = PALETTE.text;
    g.font = `700 96px ${FONT_SANS}`;
    g.fillText("That was the demo.", 128, 360);
    g.fillStyle = PALETTE.muted;
    g.font = `500 44px ${FONT_SANS}`;
    g.fillText("How did it land?", 128, 440);
    tally.forEach((n, i) => {
      const x = 170 + i * 340;
      drawIcon(g, i, x, 640, 0.9);
      g.fillStyle = PALETTE.goldSoft;
      g.font = `500 56px ${FONT_MONO}`;
      g.fillText(String(n), x + 76, 660);
    });
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
