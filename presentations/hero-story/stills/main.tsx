// Draws one picture of the hall (`?still=<id>`, a still or a prop, see shots.ts) at
// its size, for a headless browser to photograph. Not part of the deck: the deck's own scene,
// state and callout parts, placed by a camera of the still's own.

import { createRoot } from "react-dom/client";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import "@liebstoeckel/theme/styles.css";
import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Fog,
  Mesh,
  MeshBasicMaterial,
  Plane,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  type Camera,
} from "three";
import { Story } from "../elements/scene/story";
import { SCREEN, type Seat } from "../elements/scene/hall";
import { setClock } from "../elements/scene/room";
import { PALETTE } from "../elements/scene/palette";
import { C, MONO } from "../elements/Overlay";
import { PROPS, STILLS, type Anchor, type Callout, type Still, type Vec } from "./shots";

const v = (p: Vec) => new Vector3(p[0], p[1], p[2]);

/** A point on the big screen from 0..1 coordinates (u right, v down). */
const onScreen = (u: number, w: number) =>
  new Vector3(SCREEN.center.x + (u - 0.5) * SCREEN.width, SCREEN.center.y + (0.5 - w) * SCREEN.height, SCREEN.center.z + 0.02);

const nearest = (seats: Seat[], p: Vector3) => seats.reduce((a, b) => (b.phone.distanceTo(p) < a.phone.distanceTo(p) ? b : a));

type Point = { x: number; y: number };

function project(p: Vector3, camera: Camera, w: number, h: number): Point {
  const q = p.clone().project(camera);
  return { x: ((q.x + 1) / 2) * w, y: ((1 - q.y) / 2) * h };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function Callouts({ items, points, onPlaced }: { items: Callout[]; points: Point[]; onPlaced: () => void }) {
  const boxes = useRef<(HTMLDivElement | null)[]>([]);
  const [sizes, setSizes] = useState<{ w: number; h: number }[] | null>(null);
  useLayoutEffect(() => {
    if (!sizes) setSizes(boxes.current.map((b) => ({ w: b?.offsetWidth ?? 0, h: b?.offsetHeight ?? 0 })));
    else onPlaced();
  }, [sizes, onPlaced]);

  return (
    <>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
        {sizes &&
          items.map((it, i) => {
            const p = points[i]!;
            if (it.kind === "dim") {
              const q = points[items.length + i]!;
              return (
                <g key={i} stroke={C.goldSoft} strokeWidth="1" opacity="0.85">
                  <line x1={p.x} y1={p.y + 18} x2={q.x} y2={q.y + 18} strokeDasharray="5 4" />
                  <line x1={p.x} x2={p.x} y1={p.y + 10} y2={p.y + 26} />
                  <line x1={q.x} x2={q.x} y1={q.y + 10} y2={q.y + 26} />
                </g>
              );
            }
            const s = sizes[i]!;
            return (
              <g key={i}>
                <line x1={p.x} y1={p.y} x2={clamp(p.x, it.x, it.x + s.w)} y2={clamp(p.y, it.y, it.y + s.h)} stroke={C.line} strokeWidth="1" />
                <circle cx={p.x} cy={p.y} r="4.5" fill={C.bg} stroke={C.goldSoft} strokeWidth="1.5" />
              </g>
            );
          })}
      </svg>
      {items.map((it, i) => {
        const label = { fontFamily: MONO, fontSize: 13, lineHeight: 1.5, color: C.goldSoft, padding: "6px 10px", background: "rgba(16,20,14,0.82)", whiteSpace: "nowrap" as const };
        if (it.kind === "dim") {
          const p = points[i]!;
          const q = points[items.length + i]!;
          return (
            <div key={i} ref={(el) => void (boxes.current[i] = el)} style={{ ...label, position: "absolute", left: (p.x + q.x) / 2, top: (p.y + q.y) / 2 + 30, transform: "translate(-50%, 0)" }}>
              {it.label}
            </div>
          );
        }
        return (
          <div key={i} ref={(el) => void (boxes.current[i] = el)} style={{ position: "absolute", left: it.x, top: it.y }}>
            <div style={{ ...label, borderLeft: `1px solid ${C.line}` }}>
              <div>{it.lines[0]}</div>
              <div style={{ color: C.muted }}>{it.lines[1]}</div>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ---- the hall ----

/** A soft round pool of lamp light on the stage. */
function lightPool(x: number, z: number): Mesh {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(246, 234, 208, 0.55)");
  grad.addColorStop(1, "rgba(246, 234, 208, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const m = new Mesh(new PlaneGeometry(3.2, 2.4), new MeshBasicMaterial({ map: t, transparent: true, opacity: 0.32, depthWrite: false, blending: AdditiveBlending }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.61, z);
  return m;
}

/** The beam from a lamp down to its pool: a faint cone, brightest at the lamp. */
function lightCone(from: Vector3, to: Vector3): Mesh {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "rgba(246, 234, 208, 0.9)");
  grad.addColorStop(1, "rgba(246, 234, 208, 0.05)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  const len = from.distanceTo(to);
  const m = new Mesh(
    new CylinderGeometry(0.12, 1.1, len, 24, 1, true),
    new MeshBasicMaterial({ map: t, transparent: true, opacity: 0.09, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false }),
  );
  m.position.copy(from).lerp(to, 0.5);
  m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), from.clone().sub(to).normalize());
  return m;
}

function Scene({ still }: { still: Still }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [placed, setPlaced] = useState<{ points: Point[] } | null>(null);

  useLayoutEffect(() => {
    const el = canvas.current!;
    const { width: w, height: h } = still;
    const story = new Story(el, { still: true, reduced: true, people: still.people ?? true, transparent: !!still.clip });
    if (still.clip) {
      // a prop: the page shows through around it, no fog (it fades toward the dark
      // ground, a haze on any other), and everything outside the box is cut away
      document.body.style.background = "transparent";
      story.scene.fog = null;
      const [x0, y0, z0] = still.clip.min;
      const [x1, y1, z1] = still.clip.max;
      story.renderer.clippingPlanes = [
        new Plane(new Vector3(1, 0, 0), -x0), new Plane(new Vector3(-1, 0, 0), x1),
        new Plane(new Vector3(0, 1, 0), -y0), new Plane(new Vector3(0, -1, 0), y1),
        new Plane(new Vector3(0, 0, 1), -z0), new Plane(new Vector3(0, 0, -1), z1),
      ];
    }
    story.setBeat(still.beat);
    let gone = false;

    void (async () => {
      // the screen and the cards draw text into canvases: their faces must be in first
      await Promise.all([
        document.fonts.load('700 128px "Schibsted Grotesk Variable"'),
        document.fonts.load('600 30px "JetBrains Mono Variable"'),
      ]).catch(() => undefined);
      await document.fonts.ready;
      if (gone) return;
      story.refreshText();
      if (still.people === false) story.screen.draw({ kind: "title", joined: 0 }, 1, 9);

      const cam = story.camera;
      story.renderer.setPixelRatio(window.devicePixelRatio || 1);
      story.renderer.setSize(w, h, false);
      for (const m of story.hall.materials.lines) m.resolution.set(w, h);
      for (const m of story.hall.materials.outlines) m.uniforms.resolution!.value.set(w, h);
      cam.clearViewOffset();
      cam.aspect = w / h;
      cam.fov = still.fov;
      cam.position.copy(v(still.pos));
      cam.lookAt(v(still.target));
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      const fog = story.scene.fog as Fog | null;
      const d = v(still.pos).distanceTo(v(still.target));
      if (fog) {
        fog.near = d * 0.85;
        fog.far = d * 2.7;
      }
      setClock(story.hall.room, new Date(2026, 0, 5, 10, 10, 0));

      const seats = story.hall.seats;
      // for choosing a seat when framing a shot: every seat's phone and head
      (window as unknown as { seats: unknown }).seats = seats.map((s) => ({ phone: s.phone.toArray().map((n) => +n.toFixed(2)), head: s.head.toArray().map((n) => +n.toFixed(2)), row: s.row }));
      if (still.lights) {
        for (const x of [-4.5, -1.5, 1.5, 4.5]) {
          story.scene.add(lightPool(x, -7.3), lightCone(new Vector3(x, 6.75, -5.5), new Vector3(x, 0.6, -7.3)));
        }
      }
      story.renderer.render(story.scene, cam);

      // where each callout's line starts, on the picture
      const anchor = (a: Anchor): Vector3 => {
        if ("phoneNear" in a) return nearest(seats, v(a.phoneNear)).phone.clone();
        if ("screen" in a) return onScreen(a.screen[0], a.screen[1]);
        return v(a.at);
      };
      const firsts = still.callouts.map((c) => project(c.kind === "dim" ? v(c.a) : anchor(c.anchor), cam, w, h));
      const seconds = still.callouts.map((c) => (c.kind === "dim" ? project(v(c.b), cam, w, h) : { x: 0, y: 0 }));
      setPlaced({ points: [...firsts, ...seconds] });
    })();
    return () => {
      gone = true;
      story.dispose();
    };
  }, [still]);

  const done = useCallback(() => requestAnimationFrame(() => requestAnimationFrame(() => (document.body.dataset.ready = "1"))), []);

  return (
    <div id="still" style={{ position: "relative", width: still.width, height: still.height, overflow: "hidden", background: still.clip ? "transparent" : PALETTE.bg, fontFamily: '"Schibsted Grotesk Variable", system-ui, sans-serif' }}>
      <style>{".hs-line { animation: none !important }"}</style>
      <canvas ref={canvas} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      {placed && (still.callouts.length ? <Callouts items={still.callouts} points={placed.points} onPlaced={done} /> : <Ready onReady={done} />)}
    </div>
  );
}

function Ready({ onReady }: { onReady: () => void }) {
  useLayoutEffect(() => onReady(), [onReady]);
  return null;
}

const id = new URLSearchParams(location.search).get("still") ?? STILLS[0]!.id;
const still = [...STILLS, ...PROPS].find((s) => s.id === id);
createRoot(document.getElementById("root")!).render(still ? <Scene still={still} /> : <p style={{ color: "#fff" }}>no still named {id}</p>);
