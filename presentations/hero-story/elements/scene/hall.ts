// The lecture hall, built once from a handful of low-poly primitives: raked
// rows of seated people holding phones, a stage with a speaker at a lectern, a
// projection screen, and a potted lovage in the corner. Every face is filled in
// near-ground color so it hides the edges behind it; the edges themselves are
// the drawing. The people are round, so they are drawn by their outline.

import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { EdgeBatch, hullOf, lineMaterial, outlineMaterial } from "./lines";
import { PALETTE } from "./palette";
import { buildRoom, type Room } from "./room";

export const SCREEN = { center: new Vector3(0, 3.7, -9.62), width: 8, height: 4.5 };
export const LAPTOP_SCREEN = { width: 0.5, height: 0.31 };

export type Seat = {
  /** where the phone sits, in world space */
  phone: Vector3;
  /** a point just above the head, for things that rise from a person */
  head: Vector3;
  row: number;
  /** segment range of this phone's edges in the phone line batch */
  edges: [number, number];
  /** which way the person's body faces (radians about y) */
  turn: number;
  /** the head as its own object, when the audience has idle life */
  head3d?: Object3D;
};

/** The speaker, in parts that can move: the whole figure, the upper body, the head and the pointing arm. */
export type Speaker = { root: Object3D; body: Object3D; head: Object3D; arm: Object3D; home: Vector3 };

export type Hall = {
  group: Group;
  seats: Seat[];
  phoneLines: LineSegments2;
  phoneScreens: InstancedMesh;
  laptopScreen: Mesh;
  screenPlane: Mesh;
  speakerHead: Vector3;
  speaker: Speaker;
  laptop: Vector3;
  plant: Vector3;
  room: Room;
  materials: { lines: ReturnType<typeof lineMaterial>[]; outlines: ShaderMaterial[] };
};

const col = (hex: string) => new Color(hex);

function place(pos: Vector3, rot = new Euler(), scale = 1): Matrix4 {
  return new Matrix4().compose(pos, new Quaternion().setFromEuler(rot), new Vector3(scale, scale, scale));
}

// A deterministic generator, so the room looks the same on every load and in
// every thumbnail.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 48271) % 2147483647;
    return s / 2147483647;
  };
}

/** A head looking down at the phone in its hands. */
export const HEAD_DOWN = -0.45;

const HAIR = ["short", "long", "bun", "hood", "short", "none", "long", "short", "bun", "short"] as const;
type Hair = (typeof HAIR)[number];

/** Position and normals only, so shapes of every kind merge into one mesh. */
function strip(g: BufferGeometry): BufferGeometry {
  if (g.hasAttribute("uv")) g.deleteAttribute("uv");
  return g;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** How far the hair stands off the head in a direction (x right, y up, z back). */
function hairDepth(hair: Hair, d: Vector3): number {
  const fringe = d.z * 0.9 + d.y * 0.6; // high toward the back and the crown, low on the face
  switch (hair) {
    case "short":
      return 0.07 * smooth(0.0, 0.45, d.y + 0.35 * d.z);
    case "bun":
      return 0.07 * smooth(0.0, 0.45, d.y + 0.35 * d.z) + 0.5 * Math.exp(-d.distanceToSquared(BUN) / 0.05);
    case "long":
      return 0.12 * smooth(-0.35, 0.15, fringe) + 0.08 * smooth(0.2, 0.8, d.z) * smooth(0.2, -0.5, d.y);
    case "hood":
      return 0.26 * (1 - smooth(0.5, 0.8, -d.z) * (1 - smooth(0.4, 0.75, Math.abs(d.y))));
    default:
      return 0;
  }
}
const BUN = new Vector3(0, 0.72, 0.7).normalize();

/** A head: an egg centred on the origin, face toward -z. The hair is part of the
 *  same closed shape, the egg pushed out where it grows: a separate shell would
 *  step out of the head at its rim, and the outline would break at the step. */
function headShape(hair: Hair, size = 0.1): BufferGeometry {
  const g = new SphereGeometry(size, 16, 11);
  const p = g.getAttribute("position");
  const d = new Vector3();
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    d.multiplyScalar(size * (1 + hairDepth(hair, d)));
    p.setXYZ(i, d.x, d.y, d.z);
  }
  g.applyMatrix4(new Matrix4().makeScale(0.95, 1.12, 1.06));
  g.computeVertexNormals();
  return g;
}

/** A matrix that stands a y-axis shape between a and b, and the distance. */
function between(a: Vector3, b: Vector3): { m: Matrix4; len: number } {
  const d = b.clone().sub(a);
  const len = d.length();
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
  return { m: new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new Vector3(1, 1, 1)), len };
}

export function buildHall(opts: { life: boolean; people?: boolean }): Hall {
  const group = new Group();
  const roomMat = lineMaterial(1);
  const structureMat = lineMaterial(1.3);
  const phoneMat = lineMaterial(1.35);
  const fillMat = new MeshLambertMaterial({ color: PALETTE.fill, flatShading: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  // the people are round and drawn with an outline only: smooth faces in the
  // ground's color, a pen line around them (the speaker's in paper, as the
  // lectern's lines are brighter than the rows')
  const bodyMat = new MeshLambertMaterial({ color: PALETTE.fill, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const figureOutline = outlineMaterial(col(PALETTE.figure), 1.2);
  const speakerOutline = outlineMaterial(col(PALETTE.paper), 1.35);
  /** Shapes are made once and shared: the faces and the outline's hull. */
  const shapes = new Map<string, { geo: BufferGeometry; hull: BufferGeometry }>();
  const shape = (key: string, make: () => BufferGeometry) => {
    let s = shapes.get(key);
    if (!s) {
      const geo = strip(make());
      s = { geo, hull: hullOf(geo) };
      shapes.set(key, s);
    }
    return s;
  };
  const capsule = (r: number, len: number) => shape(`capsule:${r}:${len.toFixed(3)}`, () => new CapsuleGeometry(r, Math.max(0.001, len), 3, 8));
  /** A shape as its own object (faces plus outline), for the parts that move. */
  const solid = (s: { geo: BufferGeometry; hull: BufferGeometry }, outline: ShaderMaterial) => {
    const o = new Object3D();
    o.add(new Mesh(s.geo, bodyMat), new Mesh(s.hull, outline));
    return o;
  };
  const fills: BufferGeometry[] = [];
  const bodies: BufferGeometry[] = [];
  const hulls: BufferGeometry[] = [];
  const addBody = (s: { geo: BufferGeometry; hull: BufferGeometry }, m: Matrix4) => {
    bodies.push(s.geo.clone().applyMatrix4(m));
    hulls.push(s.hull.clone().applyMatrix4(m));
  };
  const limb = (r: number, a: Vector3, b: Vector3, frame: Matrix4) => {
    const { m, len } = between(a, b);
    addBody(capsule(r, len), frame.clone().multiply(m));
  };
  const room = new EdgeBatch(); // dim structure
  const structure = new EdgeBatch(); // stage, screen, lectern
  const phones = new EdgeBatch();
  const r = rng(20261022);
  // an empty hall (before anyone arrives) still works out every person and then
  // drops them, so the random numbers, and with them the chairs, come out the same
  const people = opts.people !== false;

  const addSolid = (geo: BufferGeometry, m: Matrix4, batch: EdgeBatch, color: Color, threshold = 24) => {
    const c = geo.clone().applyMatrix4(m);
    const g = c.index ? c.toNonIndexed() : c;
    g.deleteAttribute("normal");
    g.deleteAttribute("uv");
    fills.push(g);
    return batch.addEdges(geo, m, color, threshold);
  };

  // floor grid: a quiet blueprint under everything
  const grid: number[] = [];
  for (let x = -9; x <= 9; x += 1.5) grid.push(x, 0, -11, x, 0, 9);
  for (let z = -11; z <= 9; z += 1.5) grid.push(-9, 0, z, 9, 0, z);
  room.addSegments(grid, col("#262d20"));

  // raked rows: risers, chairs, and seated people looking at their phones
  const ROWS = 6;
  const seats: Seat[] = [];
  const chairBack = new BoxGeometry(0.54, 0.5, 0.05);
  const chairSeat = new BoxGeometry(0.52, 0.06, 0.46);
  const phoneGeo = new BoxGeometry(0.1, 0.18, 0.014);
  const phoneTransforms: Matrix4[] = [];
  // closed at the bottom too: an open rim would break the outline where it shows
  const torsoShape = shape("torso", () =>
    new LatheGeometry([[0, 0], [0.135, 0], [0.15, 0.1], [0.17, 0.25], [0.165, 0.35], [0.125, 0.43], [0.05, 0.465], [0, 0.47]].map(([x, y]) => new Vector2(x, y)), 12),
  );
  const neckShape = shape("neck", () => new CylinderGeometry(0.04, 0.046, 0.1, 10, 1));
  const handShape = shape("hand", () => new SphereGeometry(0.034, 8, 6));
  let index = 0;
  for (let row = 0; row < ROWS; row++) {
    const z = -2.4 + row * 1.45;
    const y = row * 0.3;
    if (row > 0) addSolid(new BoxGeometry(13, y, 1.45), place(new Vector3(0, y / 2, z)), room, col(PALETTE.room));
    const n = row % 2 === 0 ? 10 : 9;
    const spacing = 1.18;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * spacing + (r() - 0.5) * 0.1;
      const pz = z + 0.2;
      // everyone turns a little toward the middle of the screen
      const turn = Math.atan2(x, 9.6 + pz) * 0.75;
      // every person is built in their own frame (facing -z) and placed once
      const person = new Matrix4().compose(new Vector3(x, y, pz), new Quaternion().setFromEuler(new Euler(0, turn, 0)), new Vector3(1, 1, 1));
      const at = (p: Vector3, e = new Euler(), sc = new Vector3(1, 1, 1)) =>
        person.clone().multiply(new Matrix4().compose(p, new Quaternion().setFromEuler(e), sc));
      addSolid(chairSeat, at(new Vector3(0, 0.42, 0.02)), room, col(PALETTE.room));
      addSolid(chairBack, at(new Vector3(0, 0.74, 0.27), new Euler(0.12, 0, 0)), room, col(PALETTE.room));
      // a few empty seats, so the room reads as people and not a pattern
      if (r() < 0.12) continue;
      // eight numbers per person from the room's sequence (the seats depend on
      // it), the rest from the person's own
      const slouch = -0.04 - r() * 0.13;
      const size = 0.93 + r() * 0.13;
      const lean = (r() - 0.5) * 0.06;
      const look = (r() - 0.5) * 0.3;
      const phoneX = (r() - 0.5) * 0.06;
      const phoneY = r() * 0.05;
      const tilt = -0.65 - r() * 0.3;
      const roll = (r() - 0.5) * 0.25;
      const own = rng(1009 + 7919 * index++);
      const shoulders = 0.9 + own() * 0.22;
      const hair = HAIR[Math.floor(own() * HAIR.length)]!;
      const nod = HEAD_DOWN + (own() - 0.5) * 0.2;

      // scaled about the seat, so everyone still sits on the chair
      const body = at(new Vector3(0, 0.45, 0)).multiply(new Matrix4().makeScale(size, size, size)).multiply(new Matrix4().makeTranslation(0, -0.45, 0));
      const torso = body.clone().multiply(new Matrix4().compose(new Vector3(0, 0.5, 0.05), new Quaternion().setFromEuler(new Euler(slouch, 0, lean)), new Vector3(1, 1, 1)));
      const phoneAt = new Vector3(phoneX, 0.27 + phoneY, -0.27);
      const pm = torso.clone().multiply(new Matrix4().compose(phoneAt, new Quaternion().setFromEuler(new Euler(tilt, 0, roll, "YXZ")), new Vector3(1, 1, 1)));
      const headAt = new Vector3(0, 0.62, -0.015).applyMatrix4(torso);
      if (!people) continue;

      for (const s of [-1, 1]) {
        const hip = new Vector3(s * 0.09, 0.52, 0.04), knee = new Vector3(s * 0.1, 0.53, -0.36), ankle = new Vector3(s * 0.11, 0.08, -0.41);
        limb(0.062, hip, knee, body);
        limb(0.048, knee, ankle, body);
        limb(0.04, new Vector3(s * 0.11, 0.04, -0.4), new Vector3(s * 0.11, 0.04, -0.53), body);
        // the arms bend at the elbow and hold the phone at its sides
        const shoulder = new Vector3(s * 0.165 * shoulders, 0.405, 0), elbow = new Vector3(s * 0.185 * shoulders, 0.17, -0.05);
        const hand = phoneAt.clone().add(new Vector3(s * 0.055, -0.02, 0.015));
        limb(0.042, shoulder, elbow, torso);
        limb(0.036, elbow, hand, torso);
        addBody(handShape, torso.clone().multiply(new Matrix4().makeTranslation(hand.x, hand.y, hand.z)));
      }
      addBody(torsoShape, torso.clone().multiply(new Matrix4().makeScale(shoulders, 1, 0.66)));
      addBody(neckShape, torso.clone().multiply(new Matrix4().makeTranslation(0, 0.48, -0.005)));
      const headShapeOf = shape(`head:${hair}`, () => headShape(hair));
      let head3d: Object3D | undefined;
      if (opts.life) {
        head3d = solid(headShapeOf, figureOutline);
        head3d.position.copy(headAt);
        head3d.rotation.set(HEAD_DOWN, turn, 0, "YXZ");
        head3d.scale.setScalar(size);
        group.add(head3d);
      } else {
        addBody(headShapeOf, new Matrix4().compose(headAt, new Quaternion().setFromEuler(new Euler(nod, turn + look, 0, "YXZ")), new Vector3(size, size, size)));
      }

      const g = phoneGeo.clone().applyMatrix4(pm).toNonIndexed(); // boxes are indexed
      g.deleteAttribute("normal");
      g.deleteAttribute("uv");
      fills.push(g);
      const edges = phones.addEdges(phoneGeo, pm, col(PALETTE.figure));
      phoneTransforms.push(pm);
      const phonePos = new Vector3().setFromMatrixPosition(pm);
      seats.push({ phone: phonePos, head: headAt.clone().add(new Vector3(0, 0.28, 0)), row, edges, turn, head3d });
    }
  }
  if (bodies.length) group.add(new Mesh(mergeGeometries(bodies)!, bodyMat), new Mesh(mergeGeometries(hulls)!, figureOutline));

  // stage, screen on its truss, lectern, speaker
  addSolid(new BoxGeometry(13, 0.6, 3.9), place(new Vector3(0, 0.3, -8.15)), structure, col(PALETTE.structure));
  addSolid(new BoxGeometry(8.3, 4.8, 0.12), place(new Vector3(0, SCREEN.center.y, SCREEN.center.z - 0.1)), structure, col(PALETTE.structure));
  for (const sx of [-4.45, 4.45]) {
    addSolid(new BoxGeometry(0.1, 5.8, 0.1), place(new Vector3(sx, 0.6 + 2.9, SCREEN.center.z - 0.1)), structure, col(PALETTE.structure));
  }
  addSolid(new BoxGeometry(9.1, 0.1, 0.1), place(new Vector3(0, 6.45, SCREEN.center.z - 0.1)), structure, col(PALETTE.structure));

  const lecternPos = new Vector3(3.5, 0.6, -6.75);
  addSolid(new CylinderGeometry(0.44, 0.33, 1.1, 4, 1), place(lecternPos.clone().add(new Vector3(0, 0.55, 0)), new Euler(0, Math.PI / 4, 0)), structure, col(PALETTE.structure));
  // laptop on the lectern, open toward the speaker (who stands upstage of it)
  const laptopBase = lecternPos.clone().add(new Vector3(0, 1.115, 0));
  addSolid(new BoxGeometry(0.5, 0.022, 0.34), place(laptopBase), structure, col(PALETTE.structure));
  const hinge = laptopBase.clone().add(new Vector3(0, 0.011, 0.17));
  const lidRot = new Euler(0.32, 0, 0);
  const lidCenter = hinge.clone().add(new Vector3(0, 0.155, 0).applyEuler(lidRot));
  addSolid(new BoxGeometry(0.5, 0.31, 0.016), place(lidCenter, lidRot), structure, col(PALETTE.structure));

  // the speaker, built from parts that can move, drawn like the audience
  const speakerPos = new Vector3(3.45, 0.6, -7.45);
  const part = (s: { geo: BufferGeometry; hull: BufferGeometry }, p: Vector3, e = new Euler()) => {
    const o = solid(s, speakerOutline);
    o.position.copy(p);
    o.rotation.copy(e);
    return o;
  };
  const speakerRoot = new Object3D();
  speakerRoot.position.copy(speakerPos);
  speakerRoot.rotation.y = 0.18;
  if (people) group.add(speakerRoot);
  const leg = capsule(0.065, 0.74);
  const foot = capsule(0.045, 0.12);
  for (const s of [-1, 1]) {
    speakerRoot.add(part(leg, new Vector3(s * 0.1, 0.43, 0)), part(foot, new Vector3(s * 0.1, 0.045, -0.07), new Euler(Math.PI / 2, 0, 0)));
  }
  // the upper body turns at the hips
  const speakerBody = new Object3D();
  speakerBody.position.set(0, 0.86, 0);
  speakerRoot.add(speakerBody);
  const standing = shape("torso:standing", () =>
    new LatheGeometry([[0, 0], [0.15, 0], [0.165, 0.15], [0.19, 0.45], [0.185, 0.58], [0.14, 0.68], [0.055, 0.72], [0, 0.725]].map(([x, y]) => new Vector2(x, y)), 12).scale(1, 1, 0.66),
  );
  speakerBody.add(part(standing, new Vector3(0, 0, 0)), part(shape("neck:speaker", () => new CylinderGeometry(0.045, 0.05, 0.1, 10, 1)), new Vector3(0, 0.75, 0)));
  const speakerHeadObj = part(shape("head:speaker", () => headShape("short", 0.115)), new Vector3(0, 0.92, 0), new Euler(-0.1, 0, 0, "YXZ"));
  speakerBody.add(speakerHeadObj);
  // the pointing arm hangs from the shoulder; the other rests on the lectern
  const armPivot = new Object3D();
  armPivot.position.set(-0.2, 0.66, 0);
  armPivot.rotation.set(-0.55, 0, 1.05);
  armPivot.add(part(capsule(0.045, 0.62), new Vector3(0, 0.36, 0)));
  speakerBody.add(armPivot);
  speakerBody.add(part(capsule(0.045, 0.5), new Vector3(0.27, 0.34, 0.22), new Euler(0.9, 0, -0.25)));
  const speakerHead = speakerPos.clone().add(new Vector3(0, 1.8, 0));

  // lovage in the corner: a pot, a few stems, flat umbels
  const plant = new Vector3(-5.7, 0.6, -6.9);
  addSolid(new CylinderGeometry(0.3, 0.22, 0.46, 6, 1), place(plant.clone().add(new Vector3(0, 0.23, 0))), structure, col(PALETTE.structure));
  const stems: number[] = [];
  const umbel = new OctahedronGeometry(0.16, 0);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.4;
    const h = 0.9 + (k % 3) * 0.32;
    const top = plant.clone().add(new Vector3(Math.cos(a) * 0.32, 0.46 + h, Math.sin(a) * 0.32));
    stems.push(plant.x, plant.y + 0.46, plant.z, top.x, top.y, top.z);
    for (let j = 0; j < 5; j++) {
      const b = (j / 5) * Math.PI * 2;
      const tip = top.clone().add(new Vector3(Math.cos(b) * 0.22, 0.12, Math.sin(b) * 0.22));
      stems.push(top.x, top.y, top.z, tip.x, tip.y, tip.z);
      addSolid(umbel, place(tip, new Euler(0, b, 0), 0.35), structure, col(PALETTE.sage));
    }
  }
  structure.addSegments(stems, col(PALETTE.sage));

  // the room around it all, quieter than the hall
  const roomParts = buildRoom(group, addSolid);

  // filled faces: one merged mesh, flat-shaded so the facets read
  const fillMesh = new Mesh(mergeGeometries(fills, false)!, fillMat);
  group.add(fillMesh);

  group.add(room.build(roomMat), structure.build(structureMat));
  const phoneLines = phones.build(phoneMat);
  group.add(phoneLines);

  // phone screens: one instanced plane each, dark until the phone joins
  const screens = new InstancedMesh(new PlaneGeometry(0.084, 0.158), new MeshBasicMaterial({ toneMapped: false, fog: false }), phoneTransforms.length);
  const offset = new Matrix4().makeTranslation(0, 0, 0.0085);
  phoneTransforms.forEach((m, i) => {
    screens.setMatrixAt(i, m.clone().multiply(offset));
    screens.setColorAt(i, col(PALETTE.fill));
  });
  group.add(screens);

  // the projection surface and the laptop display carry canvas textures (set later)
  const screenPlane = new Mesh(new PlaneGeometry(SCREEN.width, SCREEN.height), new MeshBasicMaterial({ toneMapped: false }));
  screenPlane.position.copy(SCREEN.center);
  group.add(screenPlane);
  const laptopScreen = new Mesh(new PlaneGeometry(0.46, 0.27), new MeshBasicMaterial({ toneMapped: false }));
  // the display faces the speaker, which is the lid's back side in our build
  laptopScreen.position.copy(lidCenter.clone().add(new Vector3(0, 0, -0.0095).applyEuler(lidRot)));
  laptopScreen.rotation.set(lidRot.x, Math.PI, 0);
  group.add(laptopScreen);

  return {
    group,
    seats,
    phoneLines,
    phoneScreens: screens,
    laptopScreen,
    screenPlane,
    speakerHead,
    speaker: { root: speakerRoot, body: speakerBody, head: speakerHeadObj, arm: armPivot, home: speakerPos.clone() },
    laptop: lidCenter,
    plant,
    room: roomParts,
    materials: { lines: [roomMat, structureMat, phoneMat, ...roomParts.materials], outlines: [figureOutline, speakerOutline] },
  };
}
