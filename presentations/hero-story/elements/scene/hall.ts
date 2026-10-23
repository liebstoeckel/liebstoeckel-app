// The lecture hall, built once from a handful of low-poly primitives: raked
// rows of seated people holding phones, a stage with a speaker at a lectern, a
// projection screen, and a potted lovage in the corner. Every face is filled in
// near-ground color so it hides the edges behind it; the edges themselves are
// the drawing.

import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { EdgeBatch, lineMaterial } from "./lines";
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
  materials: { lines: ReturnType<typeof lineMaterial>[] };
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

export function buildHall(opts: { life: boolean; people?: boolean }): Hall {
  const group = new Group();
  const roomMat = lineMaterial(1);
  const figureMat = lineMaterial(1.15);
  const structureMat = lineMaterial(1.3);
  const phoneMat = lineMaterial(1.35);
  const fillMat = new MeshLambertMaterial({ color: PALETTE.fill, flatShading: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  /** A shape as its own object (faces plus edges), for the parts that move. */
  const solid = (geo: BufferGeometry, color: Color) => {
    const o = new Object3D();
    const b = new EdgeBatch();
    b.addEdges(geo, new Matrix4(), color);
    o.add(new Mesh(geo, fillMat), b.build(figureMat));
    return o;
  };
  const fills: BufferGeometry[] = [];
  const room = new EdgeBatch(); // dim structure
  const figures = new EdgeBatch(); // people
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
  const torso = new CylinderGeometry(0.235, 0.17, 0.5, 6, 1);
  // heads are a little longer front to back, so where they look reads
  const head = new IcosahedronGeometry(0.13, 0).scale(0.94, 1.04, 1.16);
  const thigh = new BoxGeometry(0.36, 0.13, 0.42);
  const arm = new CylinderGeometry(0.042, 0.036, 1, 4, 1);
  const chairBack = new BoxGeometry(0.54, 0.5, 0.05);
  const chairSeat = new BoxGeometry(0.52, 0.06, 0.46);
  const phoneGeo = new BoxGeometry(0.1, 0.18, 0.014);
  const phoneTransforms: Matrix4[] = [];
  const UP = new Vector3(0, 1, 0);
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
      const addPart: typeof addSolid = people ? addSolid : () => [0, 0];
      const seatY = 0.45;
      const slouch = -0.05 - r() * 0.14;
      const sz = 0.92 + r() * 0.14;
      addPart(thigh, at(new Vector3(0, seatY + 0.07, -0.14)), figures, col(PALETTE.figure));
      addPart(torso, at(new Vector3(0, seatY + 0.39 * sz, 0.04), new Euler(slouch, 0, (r() - 0.5) * 0.08), new Vector3(sz, sz, sz * 0.62)), figures, col(PALETTE.figure));
      const headLocal = new Vector3((r() - 0.5) * 0.04, seatY + 0.8 * sz, -0.03 + slouch * 0.5);
      let head3d: Object3D | undefined;
      if (opts.life) {
        head3d = solid(head, col(PALETTE.figure));
        head3d.position.copy(headLocal.clone().applyMatrix4(person));
        head3d.rotation.set(HEAD_DOWN, turn, 0, "YXZ");
        if (people) group.add(head3d);
      } else {
        addPart(head, at(headLocal, new Euler(HEAD_DOWN + (r() - 0.5) * 0.2, (r() - 0.5) * 0.3, 0, "YXZ")), figures, col(PALETTE.figure));
      }
      // the phone, held low in front of the chest, screen tilted up to the face
      const phoneLocal = new Vector3((r() - 0.5) * 0.06, seatY + 0.36 * sz + r() * 0.06, -0.36);
      const pm = at(phoneLocal, new Euler(-0.75 - r() * 0.3, 0, (r() - 0.5) * 0.3, "YXZ"));
      if (!people) continue;
      // both forearms reach from the shoulders to the phone
      for (const side of [-1, 1]) {
        const shoulder = new Vector3(side * 0.2 * sz, seatY + 0.58 * sz, 0.0);
        const hand = phoneLocal.clone().add(new Vector3(side * 0.06, -0.03, 0.03));
        const dir = hand.clone().sub(shoulder);
        const len = dir.length();
        const q = new Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
        const m = person.clone().multiply(new Matrix4().compose(shoulder.clone().addScaledVector(dir, 0.5), q, new Vector3(1, len, 1)));
        addSolid(arm, m, figures, col(PALETTE.figure));
      }
      const g = phoneGeo.clone().applyMatrix4(pm).toNonIndexed(); // boxes are indexed
      g.deleteAttribute("normal");
      g.deleteAttribute("uv");
      fills.push(g);
      const edges = phones.addEdges(phoneGeo, pm, col(PALETTE.figure));
      phoneTransforms.push(pm);
      const phonePos = new Vector3().setFromMatrixPosition(pm);
      const headPos = headLocal.clone().applyMatrix4(person);
      seats.push({ phone: phonePos, head: headPos.add(new Vector3(0, 0.28, 0)), row, edges, turn, head3d });
    }
  }

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

  // the speaker, built from parts that can move
  const speakerPos = new Vector3(3.45, 0.6, -7.45);
  const paper = col(PALETTE.paper);
  const part = (geo: BufferGeometry, p: Vector3, e = new Euler()) => {
    const o = solid(geo, paper);
    o.position.copy(p);
    o.rotation.copy(e);
    return o;
  };
  const speakerRoot = new Object3D();
  speakerRoot.position.copy(speakerPos);
  speakerRoot.rotation.y = 0.18;
  if (people) group.add(speakerRoot);
  const leg = new BoxGeometry(0.13, 0.86, 0.15);
  speakerRoot.add(part(leg, new Vector3(-0.1, 0.43, 0)), part(leg, new Vector3(0.1, 0.43, 0)));
  // the upper body turns at the hips
  const speakerBody = new Object3D();
  speakerBody.position.set(0, 0.86, 0);
  speakerRoot.add(speakerBody);
  speakerBody.add(part(new CylinderGeometry(0.21, 0.17, 0.72, 5, 1), new Vector3(0, 0.36, 0)));
  const speakerHeadObj = part(new IcosahedronGeometry(0.16, 0).scale(0.94, 1.04, 1.12), new Vector3(0, 0.94, 0), new Euler(-0.1, 0, 0, "YXZ"));
  speakerBody.add(speakerHeadObj);
  // the pointing arm hangs from the shoulder; the other rests on the lectern
  const armPivot = new Object3D();
  armPivot.position.set(-0.2, 0.66, 0);
  armPivot.rotation.set(-0.55, 0, 1.05);
  armPivot.add(part(new CylinderGeometry(0.045, 0.04, 0.72, 4, 1), new Vector3(0, 0.36, 0)));
  speakerBody.add(armPivot);
  speakerBody.add(part(new CylinderGeometry(0.045, 0.04, 0.6, 4, 1), new Vector3(0.27, 0.34, 0.22), new Euler(0.9, 0, -0.25)));
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

  group.add(room.build(roomMat), figures.build(figureMat), structure.build(structureMat));
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
    materials: { lines: [roomMat, figureMat, structureMat, phoneMat, ...roomParts.materials] },
  };
}
