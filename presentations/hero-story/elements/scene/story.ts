// The story: one hall, one camera, six beats. Each slide of the deck is a beat;
// entering a beat moves the camera to its shot and starts what happens there:
// phones join, votes fly to a poll, a question rises from a seat, the room plays
// a game an agent just wrote, three people edit the same slide, and the whole
// hall pulls back to one file.

import { Color, DirectionalLight, Fog, HemisphereLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { Packets, QuestionCard } from "./effects";
import { buildHall, SCREEN, type Hall, type Seat } from "./hall";
import { recolor } from "./lines";
import { setClock } from "./room";
import { PALETTE } from "./palette";
import { LaptopScreen, ProjectionScreen, type EditState, type Editor, type PollState, type Question } from "./screens";

export const BEATS = 6;

// `shift` slides the picture sideways (a lens shift, as fraction of the width),
// so the room sits beside the slide's words instead of under them.
type Shot = { pos: Vector3; target: Vector3; fov: number; drift: number; shift: number };
const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

export const SHOTS: Shot[] = [
  { pos: v(12.8, 8.8, 13.8), target: v(-0.2, 1.4, -2.6), fov: 30, drift: 1, shift: 0.15 }, // the hall
  { pos: v(2.2, 5.4, 6.4), target: v(-0.3, 2.8, -9.6), fov: 37, drift: 0.5, shift: 0.1 }, // over the rows to the poll
  { pos: v(12.5, 5.6, 5.8), target: v(-0.4, 1.5, -2.6), fov: 32, drift: 0.6, shift: 0.14 }, // side, a question rises
  { pos: v(0, 9.6, 12.8), target: v(0, 2.6, -4.6), fov: 40, drift: 0.6, shift: 0.17 }, // from the back: the room plays
  { pos: v(1.5, 4.0, 5.0), target: v(0.3, 3.35, -9.6), fov: 32, drift: 0.25, shift: 0.19 }, // close on the slide being edited
  { pos: v(17.5, 19.5, 18.5), target: v(0.2, 1.6, -3.2), fov: 27, drift: 0.8, shift: 0.14 }, // the whole room as one model
];

const POLL: PollState = { question: "Where do we go next?", options: ["Lisbon", "Berlin", "A cabin"], counts: [0, 0, 0] };
const WEIGHTS = [0.47, 0.31, 0.22];
const ASKED = "Can I write my own plugin?";

export const EDITORS: Record<"web" | "dev" | "agent", Editor> = {
  web: { name: "Mara, browser", color: PALETTE.sage },
  dev: { name: "Jonas, editor", color: PALETTE.goldSoft },
  agent: { name: "Agent, terminal", color: PALETTE.paper },
};
const EDITED = { question: "Where should the offsite be?", option: "Porto", note: "Voting closes in 30 seconds" };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const pick = (w: number[]) => {
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) if ((r -= w[i]!) <= 0) return i;
  return w.length - 1;
};
/** `text` typed out over [t0, t1]: the share of characters shown at time t. */
const typed = (text: string, t: number, t0: number, t1: number) => text.slice(0, Math.round(text.length * Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))));

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
  private readonly packetsSage = new Packets(160, PALETTE.sage);
  private readonly upvotes = new Packets(40, PALETTE.gold, 0.05);
  private readonly card = new QuestionCard(ASKED);
  private readonly fog = new Fog(PALETTE.bg, 10, 40);
  private readonly live: boolean;

  beat = 0;
  private beatAt = 0;
  private clock = 0;
  private last = 0;
  private dt = 0;
  private from: Shot = SHOTS[0]!;
  private tweenAt = -10;
  private readonly lookAt = new Vector3();
  private shift = 0;
  private joinedAt: number[] = [];
  private lastJoined = -1;
  private phoneColor: string[] = [];
  private poll: PollState = structuredClone(POLL);
  private voted = 0;
  private questions: Question[] = [];
  private pulls = [0, 0];
  private pullAcc = 0;
  private edit: EditState = { question: POLL.question, options: [...POLL.options], note: "", cursors: [] };
  private editKey = "";
  private screenDirty = true;
  private readonly cardSeat: Seat;
  private readonly bubbleSeats: Seat[];
  private running = false;
  private disposed = false;
  onFrame?: (anchors: Anchors) => void;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly opts: { still: boolean; reduced: boolean },
  ) {
    this.live = !opts.reduced && !opts.still;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: opts.still, powerPreference: "high-performance" });
    this.renderer.setClearColor(new Color(PALETTE.bg), 1);
    this.scene.fog = this.fog;
    this.scene.add(new HemisphereLight("#e9e6d7", "#10140e", 1.1));
    const sun = new DirectionalLight("#f6ead0", 1.4);
    sun.position.set(-6, 12, 8);
    this.scene.add(sun);

    this.hall = buildHall();
    this.scene.add(this.hall.group, this.packets.mesh, this.packetsSage.mesh, this.upvotes.mesh, this.card.group);
    (this.hall.screenPlane.material as { map: unknown }).map = this.screen.texture;
    (this.hall.laptopScreen.material as { map: unknown }).map = this.laptop.texture;
    this.laptop.draw(LaptopScreen.TOTAL);
    this.phoneColor = this.hall.seats.map(() => "");

    const nearest = (p: Vector3) => this.hall.seats.reduce((a, b) => (b.phone.distanceTo(p) < a.phone.distanceTo(p) ? b : a));
    this.cardSeat = nearest(v(-0.6, 0.3, -2.2));
    // whose phone each slide zooms into, picked where the bubble has room
    this.bubbleSeats = [nearest(v(3.6, 1.2, 1.6)), nearest(v(2.6, 0.5, -2.2)), this.cardSeat, nearest(v(-2.4, 0.9, 3.0)), nearest(v(0, 0, 0)), nearest(v(0, 0, 0))];

    this.applyShot(SHOTS[0]!, 1, 0);
    this.enter(0);
  }

  /** Called with the deck's current slide index. */
  setBeat(i: number) {
    const b = Math.max(0, Math.min(BEATS - 1, i));
    if (b === this.beat && this.beatAt > 0) return;
    this.from = this.currentShot();
    this.tweenAt = this.live ? this.clock : -10;
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
    this.laptop.draw(LaptopScreen.TOTAL);
    if (!this.running) this.frame(performance.now());
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  // ---- beats ----

  private enter(b: number) {
    this.beatAt = this.clock || 0.0001;
    this.packets.clear();
    this.packetsSage.clear();
    this.upvotes.clear();
    this.card.group.visible = false;
    const seats = this.hall.seats;
    if (b === 0) {
      // the room joins: a few phones are in, the rest arrive over a few seconds
      this.joinedAt = seats.map((_, i) => (i % 7 === 0 || !this.live ? 0 : 0.4 + Math.pow(Math.random(), 0.8) * 4.6));
      seats.forEach((_, i) => this.setPhone(i, this.joinedAt[i] === 0 ? PALETTE.gold : null));
    } else if (b === 3) {
      // two teams, picked by each person: cats (gold) against dogs (sage)
      seats.forEach((_, i) => this.setPhone(i, this.team(i) === 0 ? PALETTE.gold : PALETTE.sage));
    } else {
      seats.forEach((_, i) => this.setPhone(i, PALETTE.gold));
    }
    if (b === 1) {
      this.voted = 0;
      this.poll = structuredClone(POLL);
      this.poll.counts = this.live ? [3, 2, 1] : [21, 14, 10];
    }
    if (b === 2) {
      this.card.votes = 3;
      this.questions = [
        { text: "Will the slides be online afterwards?", votes: 9 },
        { text: "Does it work without wifi?", votes: 6 },
      ];
      if (!this.live) this.questions.unshift({ text: ASKED, votes: 14 });
    }
    if (b === 3) {
      this.pulls = this.live ? [0, 0] : [31, 27];
      this.pullAcc = 0;
    }
    if (b === 4) this.editKey = "";
    if (b === 5 && this.poll.counts.reduce((a, c) => a + c, 0) < 30) this.poll.counts = [21, 14, 10];
    this.screenDirty = true;
  }

  /** Which side a seat picked in the tug of war: 0 cats, 1 dogs (fixed per seat, about half each). */
  private team(i: number): 0 | 1 {
    return ((i * 2654435761) >>> 0) % 100 < 50 ? 0 : 1;
  }

  /** Lights a phone in a color, or turns it off (null). */
  private setPhone(i: number, color: string | null) {
    const key = color ?? "";
    if (this.phoneColor[i] === key) return;
    this.phoneColor[i] = key;
    const seat = this.hall.seats[i]!;
    recolor(this.hall.phoneLines, seat.edges, new Color(color ?? PALETTE.figure));
    this.hall.phoneScreens.setColorAt(i, new Color(color ? (color === PALETTE.gold ? PALETTE.goldSoft : color) : PALETTE.fill));
    this.hall.phoneScreens.instanceColor!.needsUpdate = true;
  }

  private tick(t: number) {
    const now = this.clock;
    const seats = this.hall.seats;
    switch (this.beat) {
      case 0: {
        let joined = 0;
        seats.forEach((_, i) => {
          if (t >= this.joinedAt[i]!) {
            this.setPhone(i, PALETTE.gold);
            joined++;
          }
        });
        if (joined + 1 !== this.lastJoined) {
          this.lastJoined = joined + 1;
          this.screenDirty = true;
        }
        break;
      }
      case 1: {
        if (!this.live) break;
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
        if (!this.live) break;
        const k = Math.min(1, Math.max(0, (t - 0.4) / 6));
        const hover = this.cardSeat.head.clone().add(v(0, 1.25, -0.4));
        const [u, vv] = ProjectionScreen.qaSlot(0);
        this.card.place(k, this.cardSeat.head, hover, this.onScreen(u, vv).add(v(0, 0, 0.2)), this.camera, 2.4);
        // upvotes fly to the card while it hovers
        if (k > 0.28 && k < 0.66 && this.card.votes - 3 < Math.floor(((k - 0.28) / 0.38) * 11)) {
          const seat = seats[(this.card.votes * 11 + 5) % seats.length]!;
          this.card.votes++;
          this.upvotes.send(seat.phone, hover, now, 0.55, 0.6);
        }
        if (k >= 1 && this.questions[0]?.text !== ASKED) {
          this.questions.unshift({ text: ASKED, votes: this.card.votes });
          this.screenDirty = true;
        }
        break;
      }
      case 3: {
        if (!this.live || t < 0.8) break;
        // both teams pull; the lead swings from one side to the other
        const rate = 16 + 6 * Math.sin(t * 2.1);
        const catShare = 0.5 + 0.22 * Math.sin(t * 0.9);
        this.pullAcc += rate * this.dt;
        while (this.pullAcc >= 1) {
          this.pullAcc -= 1;
          const side = Math.random() < catShare ? 0 : 1;
          const team = seats.filter((_, i) => this.team(i) === side);
          const seat = team[Math.floor(Math.random() * team.length)]!;
          const [u, vv] = ProjectionScreen.ropeEnd(side);
          (side === 0 ? this.packets : this.packetsSage).send(seat.phone, this.onScreen(u, vv), now, 0.7 + Math.random() * 0.4, 1 + Math.random(), () => {
            this.pulls[side]!++;
            this.screenDirty = true;
          });
        }
        break;
      }
      case 4: {
        // three people edit the same slide: the question in the browser, a new
        // option in the editor, a note from the agent in the terminal
        const done = !this.live;
        const T = done ? 99 : t;
        const q = T < 1.6 ? POLL.question : T < 2.4 ? POLL.question.slice(0, Math.round(POLL.question.length * (1 - (T - 1.6) / 0.8))) : typed(EDITED.question, T, 2.4, 4.0);
        const opt = typed(EDITED.option, T, 4.4, 5.0);
        const note = typed(EDITED.note, T, 5.6, 6.8);
        const cursors: EditState["cursors"] = [];
        if (T >= 1.6) cursors.push({ who: EDITORS.web, at: "question" });
        if (T >= 4.2) cursors.push({ who: EDITORS.dev, at: "option:3" });
        if (T >= 5.4) cursors.push({ who: EDITORS.agent, at: "note" });
        const options = opt ? [...POLL.options, opt] : [...POLL.options];
        const key = `${q}|${opt}|${note}|${cursors.length}`;
        if (key !== this.editKey) {
          this.editKey = key;
          this.edit = { question: q, options, note, cursors };
          this.screenDirty = true;
        }
        break;
      }
    }
  }

  /** A point on the projection screen, from 0..1 coordinates (u right, v down). */
  private onScreen(u: number, vv: number): Vector3 {
    return v(SCREEN.center.x + (u - 0.5) * SCREEN.width, SCREEN.center.y + (0.5 - vv) * SCREEN.height, SCREEN.center.z + 0.02);
  }

  private drawScreen() {
    if (!this.screenDirty) return;
    this.screenDirty = false;
    switch (this.beat) {
      case 0:
        this.screen.draw({ kind: "title", joined: Math.max(this.lastJoined, 1) }, 1, 9);
        break;
      case 1:
        this.screen.draw({ kind: "poll", poll: this.poll }, 4, 9);
        break;
      case 2:
        this.screen.draw({ kind: "qa", questions: this.questions }, 6, 9);
        break;
      case 3:
        this.screen.draw({ kind: "tug", cats: this.pulls[0]!, dogs: this.pulls[1]! }, 7, 9);
        break;
      case 4:
        this.screen.draw({ kind: "edit", edit: this.edit }, 4, 9);
        break;
      default:
        this.screen.draw({ kind: "title", joined: this.hall.seats.length + 1 }, 1, 9);
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
    if (this.live) {
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
    if (this.disposed) return;
    const sec = ms / 1000;
    this.dt = this.last ? Math.min(0.05, sec - this.last) : 0.016;
    this.last = sec;
    this.clock += this.dt;
    const t = this.clock - this.beatAt;
    const k = this.tweenAt < 0 ? 1 : Math.min(1, (this.clock - this.tweenAt) / 2.1);
    this.applyShot(SHOTS[this.beat]!, k, this.clock);
    this.tick(t);
    this.packets.update(this.clock);
    this.packetsSage.update(this.clock);
    this.upvotes.update(this.clock);
    this.drawScreen();
    setClock(this.hall.room, new Date());
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
    put("screen", SCREEN.center.clone());
    const [ku, kv] = ProjectionScreen.knot(this.pulls[0]!, this.pulls[1]!);
    put("knot", this.onScreen(ku, kv));
    put("plant", this.hall.plant.clone().add(v(0, 1.6, 0)));
    put("stageL", v(-6.5, 0.6, -6.2));
    put("stageR", v(6.5, 0.6, -6.2));
    for (const at of ["question", "option:3", "note"]) {
      const [u, vv] = ProjectionScreen.editSpot(at);
      put(`edit:${at}`, this.onScreen(u, vv));
    }
    return out;
  }
}
