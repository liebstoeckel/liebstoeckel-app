// The story: one hall, one camera, six beats. Each slide of the deck is a beat;
// entering a beat moves the camera to its shot and starts what the room does
// there (phones join, votes fly, a question rises, reactions float up, the
// speaker's laptop types the slide).

import { Color, Fog, PerspectiveCamera, Scene, Vector3, WebGLRenderer, HemisphereLight, DirectionalLight } from "three";
import { Packets, QuestionCard, Reactions } from "./effects";
import { buildHall, SCREEN, type Hall, type Seat } from "./hall";
import { recolor } from "./lines";
import { PALETTE } from "./palette";
import { LaptopScreen, ProjectionScreen, type PollState, type Question } from "./screens";

export const BEATS = 6;

// `shift` slides the picture sideways (a lens shift, as fraction of the width),
// so the room sits beside the slide's words instead of under them.
type Shot = { pos: Vector3; target: Vector3; fov: number; drift: number; shift: number };
const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

export const SHOTS: Shot[] = [
  { pos: v(12.8, 8.8, 13.8), target: v(-0.2, 1.4, -2.6), fov: 30, drift: 1, shift: 0.15 }, // the hall
  { pos: v(2.2, 5.4, 6.4), target: v(-0.3, 2.8, -9.6), fov: 37, drift: 0.5, shift: 0.1 }, // over the rows to the poll
  { pos: v(12.5, 5.6, 5.8), target: v(-0.4, 1.5, -2.6), fov: 32, drift: 0.6, shift: 0.14 }, // side, a question rises
  { pos: v(5.4, 3.6, -10.4), target: v(-0.9, 1.9, 1.6), fov: 46, drift: 0.4, shift: 0.06 }, // behind the speaker: the room reacts
  { pos: v(5.2, 3.4, -9.9), target: v(2.7, 1.5, -5.4), fov: 32, drift: 0.15, shift: 0.18 }, // the speaker's corner
  { pos: v(17.5, 19.5, 18.5), target: v(0.2, 1.6, -3.2), fov: 27, drift: 0.8, shift: 0.14 }, // the whole room as one model
];

const POLL: PollState = { question: "Where do we go next?", options: ["Lisbon", "Berlin", "A cabin"], counts: [0, 0, 0] };
const WEIGHTS = [0.47, 0.31, 0.22];
const ASKED = "Can I write my own plugin?";

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const pick = (w: number[]) => {
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) if ((r -= w[i]!) <= 0) return i;
  return w.length - 1;
};

export type Anchor = { x: number; y: number; on: boolean };
export type Anchors = Record<string, Anchor>;

export class Story {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(31, 16 / 9, 0.1, 120);
  readonly hall: Hall;
  private readonly screen = new ProjectionScreen();
  private readonly laptop = new LaptopScreen();
  private readonly packets = new Packets();
  private readonly upvotes = new Packets(40, PALETTE.gold, 0.05);
  private readonly reactions = new Reactions();
  private readonly card = new QuestionCard(ASKED);
  private readonly fog = new Fog(PALETTE.bg, 10, 40);

  beat = 0;
  private beatAt = 0;
  private clock = 0;
  private last = 0;
  private from: Shot = SHOTS[0]!;
  private tweenAt = -10;
  private readonly lookAt = new Vector3();
  private shift = 0;
  private joinedAt: number[] = [];
  private lit: boolean[] = [];
  private poll: PollState = structuredClone(POLL);
  private questions: Question[] = [];
  private tally = [0, 0, 0, 0];
  private screenDirty = true;
  private reactAcc = 0;
  private cardSeat: Seat;
  private bubbleSeats: Seat[];
  private running = false;
  onFrame?: (anchors: Anchors) => void;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly opts: { still: boolean; reduced: boolean },
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: opts.still, powerPreference: "high-performance" });
    this.renderer.setClearColor(new Color(PALETTE.bg), 1);
    this.scene.fog = this.fog;
    this.scene.add(new HemisphereLight("#e9e6d7", "#10140e", 1.1));
    const sun = new DirectionalLight("#f6ead0", 1.4);
    sun.position.set(-6, 12, 8);
    this.scene.add(sun);

    this.hall = buildHall();
    this.scene.add(this.hall.group, this.packets.mesh, this.upvotes.mesh, this.reactions.group, this.card.group);
    (this.hall.screenPlane.material as { map: unknown }).map = this.screen.texture;
    (this.hall.laptopScreen.material as { map: unknown }).map = this.laptop.texture;
    this.lit = this.hall.seats.map(() => false);

    const nearest = (p: Vector3) => this.hall.seats.reduce((a, b) => (b.phone.distanceTo(p) < a.phone.distanceTo(p) ? b : a));
    this.cardSeat = nearest(v(-0.6, 0.3, -2.2));
    // whose phone each slide zooms into, picked where the bubble has room
    this.bubbleSeats = [nearest(v(3.6, 1.2, 1.6)), nearest(v(2.6, 0.5, -2.2)), this.cardSeat, nearest(v(-2.2, 0.9, 0.6)), nearest(v(0, 0, 0)), nearest(v(0, 0, 0))];

    this.applyShot(SHOTS[0]!, 1, 0);
    this.enter(0);
  }

  /** Called with the deck's current slide index. */
  setBeat(i: number) {
    const b = Math.max(0, Math.min(BEATS - 1, i));
    if (b === this.beat && this.beatAt > 0) return;
    this.from = this.currentShot();
    this.tweenAt = this.opts.reduced || this.opts.still ? -10 : this.clock;
    this.beat = b;
    this.enter(b);
    if (!this.running) this.frame(performance.now());
  }

  resize(cssW: number, cssH: number) {
    // the canvas is laid out at the stage's logical 1280x720 and scaled by the
    // deck; render at the size it is actually shown, lines sized in real pixels
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio((dpr * cssW) / 1280);
    this.renderer.setSize(1280, 720, false);
    for (const m of this.hall.materials.lines) m.resolution.set(cssW, cssH);
    if (!this.running) this.frame(performance.now());
  }

  start() {
    if (this.opts.still) {
      this.frame(performance.now());
      return;
    }
    this.running = true;
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  /** Redraws the canvases once web fonts have arrived. */
  refreshText() {
    this.screenDirty = true;
    this.laptop.reset();
    if (!this.running) this.frame(performance.now());
  }

  dispose() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }

  // ---- beats ----

  private enter(b: number) {
    this.beatAt = this.clock || 0.0001;
    this.packets.clear();
    this.upvotes.clear();
    this.reactions.clear();
    this.reactAcc = 0;
    const seats = this.hall.seats;
    if (b === 0) {
      // the room joins: a few phones are in, the rest arrive over a few seconds
      this.joinedAt = seats.map((_, i) => (i % 7 === 0 ? 0 : 0.4 + Math.pow(Math.random(), 0.8) * 4.6));
      if (this.opts.reduced || this.opts.still) this.joinedAt = seats.map(() => 0);
      seats.forEach((_, i) => this.setLit(i, this.joinedAt[i] === 0));
    } else {
      seats.forEach((_, i) => this.setLit(i, true));
    }
    this.card.group.visible = false;
    if (b === 1) {
      this.voted = 0;
      this.poll = structuredClone(POLL);
      this.poll.counts = [3, 2, 1];
      if (this.opts.reduced || this.opts.still) this.poll.counts = [21, 14, 10];
    }
    if (b === 2) {
      this.card.votes = 3;
      this.questions = [
        { text: "Will the slides be online afterwards?", votes: 9 },
        { text: "Does it work without wifi?", votes: 6 },
      ];
      if (this.opts.reduced || this.opts.still) this.questions.unshift({ text: ASKED, votes: 14 });
    }
    if (b === 3) this.tally = this.opts.reduced || this.opts.still ? [18, 11, 7, 23] : [0, 0, 0, 0];
    if (b === 4 || b === 5) {
      if (this.poll.counts.reduce((a, c) => a + c, 0) < 30) this.poll.counts = [21, 14, 10];
    }
    this.screenDirty = true;
  }

  private setLit(i: number, on: boolean) {
    if (this.lit[i] === on) return;
    this.lit[i] = on;
    const seat = this.hall.seats[i]!;
    recolor(this.hall.phoneLines, seat.edges, new Color(on ? PALETTE.gold : PALETTE.figure));
    this.hall.phoneScreens.setColorAt(i, new Color(on ? PALETTE.goldSoft : PALETTE.fill));
    this.hall.phoneScreens.instanceColor!.needsUpdate = true;
  }

  private tick(t: number) {
    const now = this.clock;
    const seats = this.hall.seats;
    const live = !this.opts.reduced && !this.opts.still;
    switch (this.beat) {
      case 0: {
        let joined = 0;
        seats.forEach((_, i) => {
          if (t >= this.joinedAt[i]!) {
            if (!this.lit[i]) this.setLit(i, true);
            joined++;
          }
        });
        const shown = joined + 1;
        if (shown !== this.lastJoined) {
          this.lastJoined = shown;
          this.screenDirty = true;
        }
        break;
      }
      case 1: {
        if (!live) break;
        // most of the room votes in the first few seconds, a few stragglers after
        const want = Math.min(seats.length, Math.floor(seats.length * (1 - Math.pow(1 - Math.min(1, t / 6), 2.2))));
        while (this.voted < want) {
          const seat = seats[(this.voted * 7 + 3) % seats.length]!;
          this.voted++;
          const opt = pick(WEIGHTS);
          const max = Math.max(1, ...this.poll.counts);
          const [u, vv] = ProjectionScreen.barEnd(opt, Math.min(1, (this.poll.counts[opt]! + 1) / max));
          this.packets.send(seat.phone, this.onScreen(u, vv), now, 0.9 + Math.random() * 0.5, 1.2 + Math.random() * 1.4, () => {
            this.poll.counts[opt]!++;
            this.screenDirty = true;
          });
        }
        break;
      }
      case 2: {
        const T = 6;
        const k = Math.min(1, Math.max(0, (t - 0.4) / T));
        const hover = this.cardSeat.head.clone().add(v(0, 1.25, -0.4));
        const [u, vv] = ProjectionScreen.qaSlot(0);
        if (live) {
          this.card.place(k, this.cardSeat.head, hover, this.onScreen(u, vv).add(v(0, 0, 0.2)), this.camera, 2.4);
          // upvotes fly to the card while it hovers
          if (k > 0.28 && k < 0.66 && this.card.votes - 3 < Math.floor(((k - 0.28) / 0.38) * 11)) {
            const seat = seats[(this.card.votes * 11 + 5) % seats.length]!;
            this.card.votes++;
            this.upvotes.send(seat.phone, hover, now, 0.55, 0.6);
          }
          if (k >= 1 && this.questions[0]?.text !== ASKED) {
            this.questions.unshift({ text: ASKED, votes: this.card.votes, fresh: true });
            this.screenDirty = true;
          }
        }
        break;
      }
      case 3: {
        if (!live) break;
        const rate = 14 + 9 * Math.sin(t * 1.3) + (t < 1.5 ? 12 : 0);
        this.reactAcc += rate * this.dt;
        while (this.reactAcc >= 1) {
          this.reactAcc -= 1;
          const seat = seats[Math.floor(Math.random() * seats.length)]!;
          const kind = pick([0.3, 0.15, 0.25, 0.3]);
          this.reactions.emit(seat.phone, now, kind);
          this.tally[kind]!++;
          this.screenDirty = true;
        }
        break;
      }
      case 4:
        this.laptop.draw(live ? Math.max(0, (t - 0.9) * 46) : LaptopScreen.TOTAL);
        break;
      case 5:
        this.laptop.draw(LaptopScreen.TOTAL);
        break;
    }
  }
  private lastJoined = -1;
  private voted = 0;
  private dt = 0;

  /** A point on the projection screen, from 0..1 coordinates (u right, v down). */
  private onScreen(u: number, vv: number): Vector3 {
    return v(SCREEN.center.x + (u - 0.5) * SCREEN.width, SCREEN.center.y + (0.5 - vv) * SCREEN.height, SCREEN.center.z + 0.02);
  }

  private drawScreen() {
    if (!this.screenDirty) return;
    this.screenDirty = false;
    const slide = this.beat + 1;
    switch (this.beat) {
      case 0:
        this.screen.draw({ kind: "title", joined: Math.max(this.lastJoined, 1) }, 1, 9);
        break;
      case 1:
      case 4:
        this.screen.draw({ kind: "poll", poll: this.poll }, 4, 9);
        break;
      case 2:
        this.screen.draw({ kind: "qa", questions: this.questions }, 6, 9);
        break;
      case 3:
        this.screen.draw({ kind: "reactions", tally: this.tally }, 8, 9);
        break;
      default:
        this.screen.draw({ kind: "title", joined: this.hall.seats.length + 1 }, slide, 9);
    }
  }

  // ---- camera ----

  private currentShot(): Shot {
    return { pos: this.camera.position.clone(), target: this.lookAt.clone(), fov: this.camera.fov, drift: SHOTS[this.beat]!.drift, shift: this.shift };
  }

  private applyShot(to: Shot, k: number, time: number) {
    const from = this.from;
    const e = ease(k);
    const pos = from.pos.clone().lerp(to.pos, e);
    const target = from.target.clone().lerp(to.target, e);
    const fov = from.fov + (to.fov - from.fov) * e;
    const shift = from.shift + (to.shift - from.shift) * e;
    if (shift !== this.shift) {
      this.shift = shift;
      this.camera.setViewOffset(1280, 720, -shift * 1280, 0, 1280, 720);
    }
    if (!this.opts.reduced && !this.opts.still) {
      const d = to.drift * 0.16;
      pos.x += Math.sin(time * 0.21) * d;
      pos.y += Math.sin(time * 0.17 + 1) * d * 0.5;
      pos.z += Math.cos(time * 0.19) * d;
    }
    this.camera.position.copy(pos);
    this.lookAt.copy(target);
    this.camera.lookAt(target);
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const dist = pos.distanceTo(target);
    this.fog.near = dist * 0.85;
    this.fog.far = dist * 2.7;
  }

  // ---- frame ----

  private frame(ms: number) {
    const sec = ms / 1000;
    this.dt = this.last ? Math.min(0.05, sec - this.last) : 0.016;
    this.last = sec;
    this.clock += this.dt;
    const t = this.clock - this.beatAt;
    const k = this.tweenAt < 0 ? 1 : Math.min(1, (this.clock - this.tweenAt) / 2.1);
    this.applyShot(SHOTS[this.beat]!, k, this.clock);
    this.tick(t);
    this.packets.update(this.clock);
    this.upvotes.update(this.clock);
    this.reactions.update(this.clock);
    this.drawScreen();
    this.renderer.render(this.scene, this.camera);
    this.onFrame?.(this.anchors());
  }

  private anchors(): Anchors {
    const out: Anchors = {};
    const put = (name: string, p: Vector3) => {
      const q = p.clone().project(this.camera);
      out[name] = { x: ((q.x + 1) / 2) * 1280, y: ((1 - q.y) / 2) * 720, on: q.z < 1 && Math.abs(q.x) < 1.05 && Math.abs(q.y) < 1.05 };
    };
    put("phone", this.bubbleSeats[this.beat]!.phone);
    put("laptop", this.hall.laptop);
    put("screen", SCREEN.center.clone().add(v(-2.6, 0.9, 0)));
    put("speaker", this.hall.speakerHead);
    put("plant", this.hall.plant.clone().add(v(0, 1.6, 0)));
    put("stageL", v(-6.5, 0.6, -6.2));
    put("stageR", v(6.5, 0.6, -6.2));
    return out;
  }
}
