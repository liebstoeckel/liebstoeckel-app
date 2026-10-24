// The story: one hall, one camera, six beats. Each slide of the deck is a beat;
// entering a beat moves the camera to its shot and starts what happens there:
// phones join, votes fly to a poll, a question rises from a seat, the room plays
// a game an agent just wrote, three people edit the same slide, and the whole
// hall pulls back to one file.

import { Color, DirectionalLight, Fog, HemisphereLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import { Packets, QuestionCard } from "./effects";
import { audienceLife } from "./features";
import { buildHall, HEAD_DOWN, SCREEN, type Hall, type Seat } from "./hall";
import { recolor } from "./lines";
import { setClock } from "./room";
import { PALETTE } from "./palette";
import { LaptopScreen, ProjectionScreen, type EditState, type Editor, type PollState, type Question } from "./screens";

export const BEATS = 6;

// `shift` slides the picture sideways (a lens shift, as fraction of the width),
// so the room sits beside the slide's words instead of under them.
type Shot = { pos: Vector3; target: Vector3; fov: number; drift: number; shift: number };
const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const UP = new Vector3(0, 1, 0);

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

/** A shot as one list of numbers (position, target, field of view, lens shift, drift),
 *  so the camera can fly from one shot to the next as a single curve. */
const poseOf = (s: Shot) => [s.pos.x, s.pos.y, s.pos.z, s.target.x, s.target.y, s.target.z, s.fov, s.shift, s.drift];
/** Seconds the camera takes to reach a new slide's shot. */
const FLIGHT = 1.3;
const pick = (w: number[]) => {
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) if ((r -= w[i]!) <= 0) return i;
  return w.length - 1;
};
/** `text` typed out over [t0, t1]: the share of characters shown at time t. */
const typed = (text: string, t: number, t0: number, t1: number) => text.slice(0, Math.round(text.length * Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))));

/** The speaker's pointing arm (Euler x, y, z at the shoulder): hanging down, an open gesture to the room, pointing at the screen. */
const ARM_POSES: [number, number, number][] = [
  [0.05, 0, Math.PI - 0.16],
  [0.95, 0, 0.45],
  [-0.55, 0, 1.05],
];

export type Anchor = { x: number; y: number; on: boolean };
export type Anchors = Record<string, Anchor>;

export class Story {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(31, 16 / 9, 0.1, 120);
  readonly hall: Hall;
  /** What the big screen shows (the landing page's stills draw their own). */
  readonly screen = new ProjectionScreen();
  private readonly laptop = new LaptopScreen();
  private readonly packets = new Packets();
  private readonly packetsSage = new Packets(160, PALETTE.sage);
  private readonly upvotes = new Packets(40, PALETTE.gold, 0.05);
  /** The question that rises from a seat on the Q&A slide. */
  readonly card = new QuestionCard(ASKED);
  private readonly fog = new Fog(PALETTE.bg, 10, 40);
  private readonly live: boolean;

  beat = 0;
  private beatAt = 0;
  private clock = 0;
  private last = 0;
  private dt = 0;
  // the camera's shot now and how fast each of its numbers changes (per second), and
  // the flight toward the slide's shot: when it began, from where and at what speed
  private pose = poseOf(SHOTS[0]!);
  private speed = this.pose.map(() => 0);
  private flight: { at: number; from: number[]; speed: number[] } | null = null;
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
  /** idle life: per head, its current and target angles and when it next changes */
  private heads: { yaw: number; pitch: number; ty: number; tp: number; until: number }[] = [];
  private headBase: Vector3[] = [];
  private readonly lean = new Vector3();
  private readonly leanTarget = new Vector3();
  private armPose = 0; // 0 down, 1 open gesture, 2 pointing at the screen
  private armUntil = 0;
  onFrame?: (anchors: Anchors) => void;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly opts: { still: boolean; reduced: boolean; people?: boolean },
  ) {
    this.live = !opts.reduced && !opts.still;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: opts.still, powerPreference: "high-performance" });
    this.renderer.setClearColor(new Color(PALETTE.bg), 1);
    this.scene.fog = this.fog;
    this.scene.add(new HemisphereLight("#e9e6d7", "#10140e", 1.1));
    const sun = new DirectionalLight("#f6ead0", 1.4);
    sun.position.set(-6, 12, 8);
    this.scene.add(sun);

    this.hall = buildHall({ life: this.live && audienceLife(), people: opts.people ?? true });
    this.heads = this.hall.seats.map(() => ({ yaw: 0, pitch: HEAD_DOWN, ty: 0, tp: HEAD_DOWN, until: Math.random() * 6 }));
    this.headBase = this.hall.seats.map((s) => (s.head3d ? s.head3d.position.clone() : new Vector3()));
    this.scene.add(this.hall.group, this.packets.mesh, this.packetsSage.mesh, this.upvotes.mesh, this.card.group);
    (this.hall.screenPlane.material as { map: unknown }).map = this.screen.texture;
    (this.hall.laptopScreen.material as { map: unknown }).map = this.laptop.texture;
    this.laptop.draw(LaptopScreen.TOTAL);
    this.phoneColor = this.hall.seats.map(() => "");

    // (an empty hall has no seats: nothing then rises from one or gets a close-up)
    const nearest = (p: Vector3) => this.hall.seats.reduce<Seat | undefined>((a, b) => (!a || b.phone.distanceTo(p) < a.phone.distanceTo(p) ? b : a), undefined)!;
    this.cardSeat = nearest(v(-0.6, 0.3, -2.2));
    // whose phone each slide zooms into, picked where the bubble has room
    this.bubbleSeats = [nearest(v(3.6, 1.2, 1.6)), nearest(v(2.6, 0.5, -2.2)), this.cardSeat, nearest(v(-2.4, 0.9, 3.0)), nearest(v(0, 0, 0)), nearest(v(0, 0, 0))];

    this.applyShot(0);
    this.enter(0);
  }

  /** Called with the deck's current slide index. */
  setBeat(i: number) {
    const b = Math.max(0, Math.min(BEATS - 1, i));
    if (b === this.beat && this.beatAt > 0) return;
    // a new slide changes where the camera heads, never how fast it is going, so
    // slides passed in quick succession read as one flight through the hall
    this.flight = this.live ? { at: this.clock, from: [...this.pose], speed: [...this.speed] } : null;
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
    for (const m of this.hall.materials.outlines) m.uniforms.resolution!.value.set(cssW, cssH);
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

  /** Stops drawing, for a deck scrolled out of view; `resume` picks up again. */
  pause() {
    if (!this.running) return;
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  resume() {
    if (this.running || this.disposed || this.opts.still) return;
    // no catching up on the time away: the next frame steps as if none passed
    this.last = 0;
    this.running = true;
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  /** The pointer over the deck, -1..1 each way; the camera leans a little toward it. */
  setPointer(nx: number, ny: number) {
    if (this.live) this.leanTarget.set(nx, ny, 0);
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
    // a new slide: the room looks up at the screen, front rows first, and the
    // speaker points at it
    const now = this.clock;
    this.hall.seats.forEach((s, i) => this.lookAtScreen(i, now + s.row * 0.12 + Math.random() * 0.35, 1.4 + Math.random() * 1.6));
    this.armPose = 2;
    this.armUntil = now + 2.2;
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

  /** Moves the camera's shot along its flight: a cubic curve that leaves where the
   *  camera was at the speed it had and comes to rest on the slide's shot. Without a
   *  flight (still pictures, reduced motion, arrived) the camera is on the shot. */
  private fly() {
    const to = poseOf(SHOTS[this.beat]!);
    const f = this.flight;
    const s = f ? Math.min(1, (this.clock - f.at) / FLIGHT) : 1;
    if (!f || s >= 1) {
      this.pose = to;
      this.speed.fill(0);
      this.flight = null;
      return;
    }
    const s2 = s * s;
    const s3 = s2 * s;
    // cubic Hermite basis for the start, the start speed and the end, and their slopes
    const h0 = 2 * s3 - 3 * s2 + 1, h1 = s3 - 2 * s2 + s, h2 = 3 * s2 - 2 * s3;
    const d0 = 6 * s2 - 6 * s, d1 = 3 * s2 - 4 * s + 1, d2 = 6 * s - 6 * s2;
    for (let i = 0; i < to.length; i++) {
      const p0 = f.from[i]!, v0 = f.speed[i]! * FLIGHT, p1 = to[i]!;
      this.pose[i] = h0 * p0 + h1 * v0 + h2 * p1;
      this.speed[i] = (d0 * p0 + d1 * v0 + d2 * p1) / FLIGHT;
    }
  }

  private applyShot(time: number) {
    const p = this.pose;
    const pos = new Vector3(p[0]!, p[1]!, p[2]!);
    const target = new Vector3(p[3]!, p[4]!, p[5]!);
    const fov = p[6]!;
    const shift = p[7]!;
    if (shift !== this.shift) {
      this.shift = shift;
      this.camera.setViewOffset(1280, 720, -shift * 1280, 0, 1280, 720);
    }
    if (this.live) {
      const d = p[8]! * 0.16;
      pos.x += Math.sin(time * 0.21) * d;
      pos.y += Math.sin(time * 0.17 + 1) * d * 0.5;
      pos.z += Math.cos(time * 0.19) * d;
    }
    if (this.live) {
      // lean a little toward the pointer: a small orbit around the target
      const f = target.clone().sub(pos);
      const dist = f.length();
      const right = f.clone().cross(UP).normalize();
      const up = right.clone().cross(f).normalize();
      pos.addScaledVector(right, this.lean.x * dist * 0.035).addScaledVector(up, -this.lean.y * dist * 0.022);
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(target);
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const dist = pos.distanceTo(target);
    this.fog.near = dist * 0.85;
    this.fog.far = dist * 2.7;
  }

  // ---- life ----

  /** Head i looks at the screen from `at` for `hold` seconds. */
  private lookAtScreen(i: number, at: number, hold: number) {
    const seat = this.hall.seats[i]!;
    const h = this.heads[i]!;
    const p = seat.head;
    const facing = Math.atan2(p.x, p.z - SCREEN.center.z); // the yaw that faces the screen's middle
    const lift = Math.atan2(SCREEN.center.y - p.y, p.z - SCREEN.center.z);
    h.until = at + hold;
    // the turn starts at `at`: until then the head keeps what it does
    const start = () => {
      h.ty = facing - seat.turn;
      h.tp = lift * 0.9;
    };
    if (at <= this.clock) start();
    else this.pending.push({ at, run: start });
  }
  private pending: { at: number; run: () => void }[] = [];

  private animateLife(dt: number) {
    const now = this.clock;
    if (this.pending.length) {
      const due = this.pending.filter((x) => x.at <= now);
      this.pending = this.pending.filter((x) => x.at > now);
      due.forEach((x) => x.run());
    }
    const k = 1 - Math.exp(-dt * 5);
    // the audience: back to their phones, a glance up, a word with a neighbour
    this.hall.seats.forEach((seat, i) => {
      const h = this.heads[i]!;
      if (!seat.head3d) return;
      if (now > h.until) {
        const roll = Math.random();
        if (roll < 0.12) this.lookAtScreen(i, now, 1.2 + Math.random() * 2);
        else if (roll < 0.2) {
          h.ty = (Math.random() < 0.5 ? -1 : 1) * (0.55 + Math.random() * 0.3);
          h.tp = -0.12;
          h.until = now + 1.4 + Math.random() * 1.6;
        } else {
          h.ty = (Math.random() - 0.5) * 0.25;
          h.tp = HEAD_DOWN + (Math.random() - 0.5) * 0.15;
          h.until = now + 3 + Math.random() * 6;
        }
      }
      h.yaw += (h.ty - h.yaw) * k;
      h.pitch += (h.tp - h.pitch) * k;
      seat.head3d.rotation.set(h.pitch, seat.turn + h.yaw, 0, "YXZ");
      // the neck: looking up lifts the head and draws it back a little
      const lift = h.pitch - HEAD_DOWN;
      const base = this.headBase[i]!;
      seat.head3d.position.set(base.x + Math.sin(seat.turn) * lift * 0.08, base.y + lift * 0.09, base.z + Math.cos(seat.turn) * lift * 0.08);
    });
    // the speaker: shifts weight, turns to the room, gestures, points at the screen
    const sp = this.hall.speaker;
    const t = now;
    sp.root.position.x = sp.home.x + Math.sin(t * 0.23) * 0.12;
    sp.body.rotation.y = Math.sin(t * 0.41) * 0.14;
    sp.body.rotation.z = Math.sin(t * 0.31) * 0.025;
    if (now > this.armUntil) {
      this.armPose = this.armPose === 1 ? 0 : Math.random() < 0.55 ? 1 : 0;
      this.armUntil = now + 2 + Math.random() * 3;
    }
    const pose = ARM_POSES[this.armPose]!;
    const a = sp.arm.rotation;
    const ka = 1 - Math.exp(-dt * 3.5);
    a.set(a.x + (pose[0] - a.x) * ka, a.y + (pose[1] - a.y) * ka, a.z + (pose[2] - a.z) * ka);
    const lookYaw = this.armPose === 2 ? 0.75 : Math.sin(t * 0.5) * 0.45;
    const hd = sp.head.rotation;
    hd.set(hd.x + ((this.armPose === 2 ? 0.05 : -0.1) - hd.x) * ka, hd.y + (lookYaw - hd.y) * ka, 0, "YXZ");
    // the camera's lean toward the pointer, eased
    this.lean.lerp(this.leanTarget, 1 - Math.exp(-dt * 2.5));
  }

  // ---- frame ----

  private frame(ms: number) {
    if (this.disposed) return;
    const sec = ms / 1000;
    this.dt = this.last ? Math.min(0.05, sec - this.last) : 0.016;
    this.last = sec;
    this.clock += this.dt;
    const t = this.clock - this.beatAt;
    this.fly();
    this.applyShot(this.clock);
    this.tick(t);
    this.packets.update(this.clock);
    this.packetsSage.update(this.clock);
    this.upvotes.update(this.clock);
    this.drawScreen();
    if (this.live) this.animateLife(this.dt);
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
