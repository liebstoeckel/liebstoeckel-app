// The room around the hall, drawn quieter than the hall itself: a back wall
// with acoustic panels, a side wall with two windows (and the faint light they
// throw on the floor), a door with an exit sign and a clock that shows the
// viewer's own time, speakers hung beside the screen, a lighting bar over the
// stage, steps up to it and a glass on the lectern.

import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { EdgeBatch, lineMaterial } from "./lines";
import { FONT_SANS, PALETTE } from "./palette";

type AddSolid = (geo: BufferGeometry, m: Matrix4, batch: EdgeBatch, color: Color, threshold?: number) => void;

export type Room = {
  /** clock hands, each turned about the wall's normal */
  clock: { hour: Object3D; minute: Object3D; second: Object3D };
  materials: LineMaterial[];
};

const WALL = new Color("#353c2e");
const DETAIL = new Color("#4a5241");

const place = (p: Vector3, e = new Euler(), s = 1) => new Matrix4().compose(p, new Quaternion().setFromEuler(e), new Vector3(s, s, s));

export function buildRoom(group: Group, addSolid: AddSolid): Room {
  const env = new EdgeBatch();
  const seg: number[] = [];
  const line = (a: Vector3, b: Vector3) => seg.push(a.x, a.y, a.z, b.x, b.y, b.z);
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const H = 7.5; // ceiling height

  // back wall behind the stage, filled so the screen reads against it
  addSolid(new BoxGeometry(18, H, 0.2), place(v(0, H / 2, -11.1)), env, WALL);
  // acoustic panels: a quiet grid on the wall's face
  for (let x = -7.5; x <= 7.5; x += 1.5) line(v(x, 1.2, -10.99), v(x, 6.6, -10.99));
  for (const y of [1.2, 3.9, 6.6]) line(v(-8.2, y, -10.99), v(8.2, y, -10.99));

  // the left wall, lines only, so it never hides the room from a camera
  const X = -9;
  for (const [y0, y1, z0, z1] of [
    [0, 0, -11, 9],
    [H, H, -11, 9],
    [1.1, 1.1, -11, 9],
    [0, H, -11, -11],
  ] as const) line(v(X, y0, z0), v(X, y1, z1));
  // two tall windows with mullions
  for (const zc of [-1.2, 4.2]) {
    const w = 2.4, h = 3.8, y0 = 1.9;
    const z0 = zc - w / 2, z1 = zc + w / 2, y1 = y0 + h;
    for (const [a, b] of [
      [v(X, y0, z0), v(X, y0, z1)],
      [v(X, y1, z0), v(X, y1, z1)],
      [v(X, y0, z0), v(X, y1, z0)],
      [v(X, y0, z1), v(X, y1, z1)],
      [v(X, y0, zc), v(X, y1, zc)],
      [v(X, y0 + h * 0.62, z0), v(X, y0 + h * 0.62, z1)],
    ]) line(a!, b!);
    // the light they throw: a faint slanted patch on the floor
    const patch = new Mesh(
      new PlaneGeometry(w, 3.2),
      new MeshBasicMaterial({ color: "#e9e6d7", transparent: true, opacity: 0.035, depthWrite: false }),
    );
    patch.rotation.set(-Math.PI / 2, 0, 0);
    patch.position.set(X + 2.2, 0.005, zc + 0.7);
    patch.scale.set(1, 1, 1);
    group.add(patch);
  }
  // a door near the stage, with an exit sign above it
  {
    const z0 = -5.6, z1 = -4.4, h = 2.3;
    line(v(X, 0, z0), v(X, h, z0));
    line(v(X, 0, z1), v(X, h, z1));
    line(v(X, h, z0), v(X, h, z1));
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 96;
    const g = c.getContext("2d")!;
    g.fillStyle = "#151a11";
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = PALETTE.sage;
    g.font = `700 54px ${FONT_SANS}`;
    g.textAlign = "center";
    g.fillText("EXIT", 128, 68);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    const sign = new Mesh(new PlaneGeometry(0.62, 0.23), new MeshBasicMaterial({ map: t, toneMapped: false }));
    sign.position.set(X + 0.02, h + 0.32, (z0 + z1) / 2);
    sign.rotation.y = Math.PI / 2;
    group.add(sign);
  }

  // speakers hung from the ceiling on both sides of the screen
  for (const s of [-1, 1]) {
    const p = v(s * 5.35, 5.5, -9.25);
    const rot = new Euler(0.22, -s * 0.28, 0);
    addSolid(new BoxGeometry(0.62, 0.95, 0.5), place(p, rot), env, DETAIL);
    // two drivers on the front face
    const front = new Vector3(0, 0, 0.26);
    for (const [dy, r] of [[0.2, 0.12], [-0.15, 0.2]] as const) {
      const c = p.clone().add(new Vector3(0, dy, 0).add(front).applyEuler(rot));
      env.addEdges(new CylinderGeometry(r, r, 0.02, 10, 1), place(c, new Euler(rot.x + Math.PI / 2, rot.y, 0, "YXZ")), DETAIL);
    }
    line(p.clone().add(v(-0.22, 0.47, 0)), v(p.x - 0.22, H, p.z));
    line(p.clone().add(v(0.22, 0.47, 0)), v(p.x + 0.22, H, p.z));
  }

  // a lighting bar over the front of the stage, with four lamps aimed down
  // (lamps in outline only: filled, they turn into dark blots seen from below)
  line(v(-6.2, 7.2, -5.6), v(6.2, 7.2, -5.6));
  for (const x of [-4.5, -1.5, 1.5, 4.5]) {
    env.addEdges(new CylinderGeometry(0.13, 0.18, 0.42, 8, 1), place(v(x, 6.92, -5.6), new Euler(-0.6, 0, 0)), DETAIL);
  }

  // steps up to the stage, at its right front corner
  for (let i = 0; i < 3; i++) {
    const h = 0.2 * (i + 1);
    addSolid(new BoxGeometry(0.9, h, 0.34), place(v(6.95, h / 2, -6.0 - i * 0.34)), env, DETAIL);
  }

  // a glass of water on the lectern
  addSolid(new CylinderGeometry(0.045, 0.038, 0.14, 7, 1), place(v(3.24, 1.79, -6.62)), env, DETAIL);

  env.addSegments(seg, WALL);

  // the clock, on the side wall facing into the room: a ring with ticks; the
  // hands are separate so they can turn. Seen from inside, 3 o'clock is -z.
  const clockAt = v(X + 0.04, 4.6, 1.5); // between the two windows
  const R = 0.5;
  const ring = new EdgeBatch();
  ring.addEdges(new CylinderGeometry(R, R, 0.06, 24, 1), place(clockAt, new Euler(0, 0, Math.PI / 2)), DETAIL);
  const ticks: number[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r0 = i % 3 === 0 ? R * 0.74 : R * 0.84;
    ticks.push(clockAt.x + 0.04, clockAt.y + Math.cos(a) * r0, clockAt.z - Math.sin(a) * r0);
    ticks.push(clockAt.x + 0.04, clockAt.y + Math.cos(a) * R * 0.92, clockAt.z - Math.sin(a) * R * 0.92);
  }
  ring.addSegments(ticks, DETAIL);

  const envMat = lineMaterial(1);
  const ringMat = lineMaterial(1.1);
  const handMat = lineMaterial(1.6);
  const secondMat = lineMaterial(1);
  group.add(env.build(envMat), ring.build(ringMat));

  const hand = (length: number, color: Color, mat: LineMaterial) => {
    const b = new EdgeBatch();
    b.addSegments([0, -length * 0.15, 0, 0, length, 0], color);
    const pivot = new Object3D();
    pivot.position.copy(clockAt).add(v(0.06, 0, 0));
    pivot.add(b.build(mat));
    group.add(pivot);
    return pivot;
  };
  return {
    clock: {
      hour: hand(R * 0.5, new Color(PALETTE.structure), handMat),
      minute: hand(R * 0.78, new Color(PALETTE.structure), handMat),
      second: hand(R * 0.86, new Color(PALETTE.gold), secondMat),
    },
    materials: [envMat, ringMat, handMat, secondMat],
  };
}

/** Sets the hands to a time of day. */
export function setClock(room: Room, now: Date) {
  const s = now.getSeconds() + now.getMilliseconds() / 1000;
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;
  // the hands point up (+y) at 12 and turn about the wall's normal (x)
  room.clock.second.rotation.x = -(s / 60) * Math.PI * 2;
  room.clock.minute.rotation.x = -(m / 60) * Math.PI * 2;
  room.clock.hour.rotation.x = -(h / 12) * Math.PI * 2;
}
