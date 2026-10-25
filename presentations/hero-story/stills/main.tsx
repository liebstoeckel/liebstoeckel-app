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
  MeshLambertMaterial,
  NoBlending,
  Color,
  Plane,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  type Camera,
} from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { ProjectionScreen } from "../elements/scene/screens";
import { FONT_SANS } from "../elements/scene/palette";
import { Story } from "../elements/scene/story";
import { SCREEN, type Seat } from "../elements/scene/hall";
import { setClock } from "../elements/scene/room";
import { PALETTE } from "../elements/scene/palette";
import { C, MONO } from "../elements/Overlay";
import { CLIPS, PROPS, STILLS, type Anchor, type Callout, type Clip, type Still, type Vec } from "./shots";

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

function Callouts({ items, points, paper, onPlaced }: { items: Callout[]; points: Point[]; paper: boolean; onPlaced: () => void }) {
  const gold = paper ? PAPER.gold : C.goldSoft;
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
                <g key={i} stroke={gold} strokeWidth="1" opacity="0.85">
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
        const label = { fontFamily: MONO, fontSize: 13, lineHeight: 1.5, color: gold, padding: "6px 10px", background: paper ? "transparent" : "rgba(16,20,14,0.82)", whiteSpace: "nowrap" as const };
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

/** The landing page's own slide on the big screen: its heading where the deck's title
 *  is, the mark and the category line on the card. No live dot and no slide number:
 *  the page shows a deck, not a session. The mark comes from whoever renders the
 *  picture (`window.landingMark`, an SVG), since the brand files are not the deck's. */
async function landingScreen(screen: ProjectionScreen) {
  const g = screen.canvas.getContext("2d")!;
  const { W, H } = ProjectionScreen;
  g.fillStyle = PALETTE.screenBg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = PALETTE.text;
  g.font = `700 104px ${FONT_SANS}`;
  ["Your deck is", "a program.", "Run it with", "the room."].forEach((line, i) => g.fillText(line, 96, 300 + i * 120));
  g.fillStyle = PALETTE.gold;
  g.fillRect(96, 696, 520, 10);
  const x = 1090, y = 280, w = 400, h = 380, size = 150;
  g.strokeStyle = "#3a4530";
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(x, y, w, h, 28);
  g.stroke();
  const svg = (window as unknown as { landingMark?: string }).landingMark;
  if (svg) {
    const mark = new Image();
    mark.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await mark.decode();
    g.drawImage(mark, x + (w - size) / 2, y + 52, size, size);
  }
  g.fillStyle = PALETTE.text;
  g.font = `600 38px ${FONT_SANS}`;
  g.textAlign = "center";
  g.fillText("Live, programmable", x + w / 2, y + 270);
  g.fillText("presentations", x + w / 2, y + 318);
  g.textAlign = "left";
  screen.texture.needsUpdate = true;
}

/** The page's light section: forest ink on warm cream, gold darkened to read on it. */
const PAPER = { fill: "#f6f2e6", ink: "#1b2418", gold: "#9a7414", sage: "#5d6b4c" };

/** Redraws the hall in ink on cream: each line keeps its strength (a bright line on the
 *  dark ground becomes a dark one, a faint one stays faint), faces turn cream, gold and
 *  sage darken. The screens keep their pictures. */
function onPaper(story: Story) {
  const ground = new Color(PALETTE.bg).getHSL({ h: 0, s: 0, l: 0 }).l;
  const brightest = new Color(PALETTE.paper).getHSL({ h: 0, s: 0, l: 0 }).l;
  const cream = new Color(PAPER.fill);
  const ink = new Color(PAPER.ink);
  const near = (c: Color, hex: string) => {
    const o = new Color(hex);
    return Math.abs(c.r - o.r) + Math.abs(c.g - o.g) + Math.abs(c.b - o.b) < 0.06;
  };
  const map = (c: Color): Color => {
    if (near(c, PALETTE.gold) || near(c, PALETTE.goldSoft)) return new Color(PAPER.gold);
    if (near(c, PALETTE.sage)) return new Color(PAPER.sage);
    const strength = Math.min(1, Math.max(0, (c.getHSL({ h: 0, s: 0, l: 0 }).l - ground) / (brightest - ground)));
    return cream.clone().lerp(ink, 0.45 + 0.55 * strength);
  };
  story.scene.traverse((o) => {
    if (o instanceof LineSegments2) {
      const attr = o.geometry.getAttribute("instanceColorStart") as unknown as { data: { array: Float32Array; needsUpdate: boolean } };
      const arr = attr.data.array;
      const c = new Color();
      for (let i = 0; i + 2 < arr.length; i += 3) {
        const m = map(c.setRGB(arr[i]!, arr[i + 1]!, arr[i + 2]!));
        arr[i] = m.r;
        arr[i + 1] = m.g;
        arr[i + 2] = m.b;
      }
      attr.data.needsUpdate = true;
    } else if (o instanceof Mesh && o.material instanceof MeshLambertMaterial) {
      // flat cream: on paper the lines draw the form, shading only muddies it
      const m = o.material;
      o.material = new MeshBasicMaterial({ color: cream, side: m.side, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits });
    }
  });
  for (const m of story.hall.materials.outlines) m.uniforms.color!.value = ink.clone();
}

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
    const story = new Story(el, { still: true, reduced: true, people: still.people ?? true, transparent: !!still.clip || !!still.hole });
    if (still.hole) {
      // an opaque hall with one transparent window: the big screen writes nothing but
      // alpha 0, and whatever stands in front of it (the lectern) still covers it
      document.body.style.background = "transparent";
      story.renderer.setClearColor(new Color(PALETTE.bg), 1);
      story.hall.screenPlane.material = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, blending: NoBlending });
    }
    if (still.paper) onPaper(story);
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
      if (still.screen === "landing") await landingScreen(story.screen);
      if (gone) return;

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
      if (still.hole) {
        // where the screen's corners land on the picture, for the page to fit its slide into
        const { x, y, z } = SCREEN.center;
        const [hw, hh] = [SCREEN.width / 2, SCREEN.height / 2];
        (window as unknown as { screenQuad: Point[] }).screenQuad = [
          new Vector3(x - hw, y + hh, z), new Vector3(x + hw, y + hh, z), new Vector3(x + hw, y - hh, z), new Vector3(x - hw, y - hh, z),
        ].map((p) => project(p, cam, w, h));
      }

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
    <div id="still" style={{ position: "relative", width: still.width, height: still.height, overflow: "hidden", background: still.clip || still.hole ? "transparent" : PALETTE.bg, fontFamily: '"Schibsted Grotesk Variable", system-ui, sans-serif' }}>
      <style>{".hs-line { animation: none !important }"}</style>
      <canvas ref={canvas} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      {placed && (still.callouts.length ? <Callouts items={still.callouts} points={placed.points} paper={!!still.paper} onPlaced={done} /> : <Ready onReady={done} />)}
    </div>
  );
}

function Ready({ onReady }: { onReady: () => void }) {
  useLayoutEffect(() => onReady(), [onReady]);
  return null;
}

// ---- clips ----

type Recorded = { width: number; height: number; fps: number; poster: string; chunks: { ts: number; key: boolean; data: string }[] };

/** Records a clip with the browser's own VP9 encoder, every frame on the clip's clock
 *  (the page's clock follows it: `window.__clipTime`, see the recording script), and
 *  leaves the encoded frames on `window.clip` for the script to put in a file. */
async function record(clip: Clip) {
  const { width: w, height: h, fps } = clip;
  const canvas = document.createElement("canvas");
  canvas.style.cssText = `display:block;width:${w}px;height:${h}px`;
  document.getElementById("root")!.append(canvas);
  // the screen draws its text into a canvas: its faces must be in before the first frame
  await Promise.all([
    document.fonts.load('700 128px "Schibsted Grotesk Variable"'),
    document.fonts.load('600 30px "JetBrains Mono Variable"'),
  ]).catch(() => undefined);
  await document.fonts.ready;
  const story = new Story(canvas, { still: false, reduced: false, record: true });
  story.resize(w, h);
  story.refreshText();
  story.setBeat(clip.beat);
  story.hold(v(clip.pos), v(clip.target), clip.fov);
  const at = (t: number) => {
    (window as unknown as { __clipTime: number }).__clipTime = t * 1000;
    story.render(t);
  };
  // the room settles into the slide before the clip starts
  for (let t = 0; t < clip.from; t += 0.05) at(t);

  const chunks: Recorded["chunks"] = [];
  const encoder = new VideoEncoder({
    output: (c) => {
      const b = new Uint8Array(c.byteLength);
      c.copyTo(b);
      let s = "";
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      chunks.push({ ts: c.timestamp, key: c.type === "key", data: btoa(s) });
    },
    error: (e) => {
      throw e;
    },
  });
  encoder.configure({ codec: "vp09.00.10.08", width: w, height: h, bitrate: 2_000_000, framerate: fps, latencyMode: "quality" });
  let poster = "";
  const frames = Math.round(clip.seconds * fps);
  for (let n = 0; n < frames; n++) {
    at(clip.from + n / fps);
    if (n === 0) poster = canvas.toDataURL("image/png");
    const frame = new VideoFrame(canvas, { timestamp: Math.round((n * 1e6) / fps), duration: Math.round(1e6 / fps) });
    encoder.encode(frame, { keyFrame: n % (fps * 2) === 0 });
    frame.close();
    while (encoder.encodeQueueSize > 4) await new Promise((r) => encoder.addEventListener("dequeue", r, { once: true }));
  }
  await encoder.flush();
  story.dispose();
  (window as unknown as { clip: Recorded }).clip = { width: w, height: h, fps, poster, chunks };
  document.body.dataset.ready = "1";
}

const params = new URLSearchParams(location.search);
const clipId = params.get("clip");
if (clipId) {
  const clip = CLIPS.find((c) => c.id === clipId);
  if (clip) void record(clip);
  else document.getElementById("root")!.textContent = `no clip named ${clipId}`;
} else {
  const id = params.get("still") ?? STILLS[0]!.id;
  const still = [...STILLS, ...PROPS].find((s) => s.id === id);
  createRoot(document.getElementById("root")!).render(still ? <Scene still={still} /> : <p style={{ color: "#fff" }}>no still named {id}</p>);
}
