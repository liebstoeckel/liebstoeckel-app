// Things that move through the hall: vote packets flying from phones to the
// screen, reactions rising over the rows, and a question card that travels from
// a seat to the screen. All pooled, so nothing is allocated per frame.

import {
  CanvasTexture,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Camera,
} from "three";
import { drawIcon } from "./icons";
import { FONT_MONO, FONT_SANS, PALETTE } from "./palette";

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Packet = { from: Vector3; ctrl: Vector3; to: Vector3; t0: number; dur: number; done?: () => void; live: boolean };

export class Packets {
  readonly mesh: InstancedMesh;
  private readonly pool: Packet[] = [];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3();

  constructor(capacity = 260, color: string = PALETTE.goldSoft, size = 0.07) {
    this.mesh = new InstancedMesh(new OctahedronGeometry(size, 0), new MeshBasicMaterial({ color, toneMapped: false, fog: false }), capacity);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < capacity; i++) {
      this.pool.push({ from: new Vector3(), ctrl: new Vector3(), to: new Vector3(), t0: 0, dur: 1, live: false });
      this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    }
  }

  send(from: Vector3, to: Vector3, now: number, dur: number, arc: number, done?: () => void) {
    const slot = this.pool.find((x) => !x.live);
    if (!slot) return done?.();
    slot.from.copy(from);
    slot.to.copy(to);
    slot.ctrl.copy(from).lerp(to, 0.5);
    slot.ctrl.y += arc;
    slot.t0 = now;
    slot.dur = dur;
    slot.done = done;
    slot.live = true;
  }

  clear() {
    this.pool.forEach((x) => (x.live = false));
  }

  update(now: number) {
    this.pool.forEach((x, i) => {
      if (!x.live) {
        this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        return;
      }
      const t = Math.min(1, (now - x.t0) / x.dur);
      if (t >= 1) {
        x.live = false;
        this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        x.done?.();
        return;
      }
      const e = easeInOut(t);
      const u = 1 - e;
      this.p.set(
        u * u * x.from.x + 2 * u * e * x.ctrl.x + e * e * x.to.x,
        u * u * x.from.y + 2 * u * e * x.ctrl.y + e * e * x.to.y,
        u * u * x.from.z + 2 * u * e * x.ctrl.z + e * e * x.to.z,
      );
      const sc = Math.min(1, t * 6) * (1 - Math.max(0, t - 0.9) * 6);
      this.s.setScalar(sc);
      this.q.setFromAxisAngle(this.p.clone().normalize(), now * 3 + i);
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function iconTexture(kind: number): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  drawIcon(c.getContext("2d")!, kind, 64, 64, 1);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

type Riser = { sprite: Sprite; from: Vector3; t0: number; dur: number; sway: number; live: boolean };

export class Reactions {
  readonly group = new Group();
  private readonly pool: Riser[] = [];

  constructor(capacity = 140) {
    const mats = [0, 1, 2, 3].map((k) => new SpriteMaterial({ map: iconTexture(k), toneMapped: false, depthWrite: false, fog: false }));
    for (let i = 0; i < capacity; i++) {
      const sprite = new Sprite(mats[i % 4]!);
      sprite.visible = false;
      this.group.add(sprite);
      this.pool.push({ sprite, from: new Vector3(), t0: 0, dur: 1, sway: 0, live: false });
    }
  }

  /** kind 0..3: heart, spark, laugh, clap */
  emit(from: Vector3, now: number, kind: number) {
    const slot = this.pool.find((x) => !x.live && x.sprite.material === this.pool[kind]!.sprite.material);
    if (!slot) return;
    slot.from.copy(from);
    slot.t0 = now;
    slot.dur = 2.2 + Math.random() * 1.2;
    slot.sway = (Math.random() - 0.5) * 2;
    slot.live = true;
    slot.sprite.visible = true;
  }

  clear() {
    this.pool.forEach((x) => {
      x.live = false;
      x.sprite.visible = false;
    });
  }

  update(now: number) {
    for (const x of this.pool) {
      if (!x.live) continue;
      const t = (now - x.t0) / x.dur;
      if (t >= 1) {
        x.live = false;
        x.sprite.visible = false;
        continue;
      }
      x.sprite.position.set(
        x.from.x + Math.sin(t * 5 + x.sway * 3) * 0.14 * x.sway,
        x.from.y + 0.2 + t * 2.6,
        x.from.z + t * -0.4,
      );
      const s = 0.42 * Math.min(1, t * 5) * (1 - Math.pow(t, 3));
      x.sprite.scale.set(s, s, s);
    }
  }
}

// A question card that rises from a seat, collects upvotes, and flies to the screen.
export class QuestionCard {
  readonly group = new Group();
  private readonly canvas = document.createElement("canvas");
  private readonly g: CanvasRenderingContext2D;
  private readonly tex: CanvasTexture;
  private readonly mesh: Mesh;
  votes = 0;
  private drawn = -1;

  constructor(readonly text: string) {
    this.canvas.width = 1024;
    this.canvas.height = 256;
    this.g = this.canvas.getContext("2d")!;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.mesh = new Mesh(new PlaneGeometry(2, 0.5), new MeshBasicMaterial({ map: this.tex, toneMapped: false, transparent: true, depthWrite: false, fog: false }));
    this.group.add(this.mesh);
    this.group.visible = false;
    this.draw();
  }

  draw() {
    if (this.drawn === this.votes) return;
    this.drawn = this.votes;
    const g = this.g;
    g.clearRect(0, 0, 1024, 256);
    g.fillStyle = "#231f10";
    g.beginPath();
    g.roundRect(6, 6, 1012, 244, 28);
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = PALETTE.gold;
    g.stroke();
    g.fillStyle = PALETTE.text;
    g.font = `600 54px ${FONT_SANS}`;
    g.fillText(this.text, 52, 146);
    g.fillStyle = PALETTE.goldSoft;
    g.font = `500 50px ${FONT_MONO}`;
    g.textAlign = "right";
    g.fillText(`▲ ${this.votes}`, 972, 146);
    g.textAlign = "left";
    this.tex.needsUpdate = true;
  }

  /** Places the card along its path: rise (0..0.25), hover (0.25..0.7), fly (0.7..1). */
  place(t: number, seat: Vector3, hover: Vector3, screen: Vector3, camera: Camera, screenScale: number) {
    this.group.visible = t > 0 && t < 1;
    if (!this.group.visible) return;
    const p = this.group.position;
    if (t < 0.25) {
      const e = easeInOut(t / 0.25);
      p.copy(seat).lerp(hover, e);
      this.group.scale.setScalar(0.3 + 0.7 * e);
    } else if (t < 0.7) {
      p.copy(hover);
      p.y += Math.sin((t - 0.25) * 18) * 0.03;
      this.group.scale.setScalar(1);
    } else {
      const e = easeInOut((t - 0.7) / 0.3);
      p.copy(hover).lerp(screen, e);
      this.group.scale.setScalar(1 + (screenScale - 1) * e);
    }
    (this.mesh.material as MeshBasicMaterial).opacity = t < 0.88 ? 1 : 1 - (t - 0.88) / 0.12;
    this.group.quaternion.copy(camera.quaternion);
    this.draw();
  }
}
