// Draws one still of the hall (`?still=<id>`, see shots.ts) at its size, for a
// headless browser to photograph. Not part of the deck: the deck's own scene,
// state and callout parts, placed by a camera of the still's own.

import { createRoot } from "react-dom/client";
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import "@liebstoeckel/theme/styles.css";
import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Matrix4,
  Fog,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  type Camera,
} from "three";
import { Story } from "../elements/scene/story";
import { SCREEN, type Seat } from "../elements/scene/hall";
import { setClock } from "../elements/scene/room";
import { Packets } from "../elements/scene/effects";
import { ProjectionScreen } from "../elements/scene/screens";
import { PALETTE } from "../elements/scene/palette";
import { C, Choice, Line, MONO, Pane, Phone, Status, mute } from "../elements/Overlay";
import { STILLS, type Anchor, type Callout, type Still, type Vec } from "./shots";

const v = (p: Vec) => new Vector3(p[0], p[1], p[2]);

/** A point on the big screen from 0..1 coordinates (u right, v down). */
const onScreen = (u: number, w: number) =>
  new Vector3(SCREEN.center.x + (u - 0.5) * SCREEN.width, SCREEN.center.y + (0.5 - w) * SCREEN.height, SCREEN.center.z + 0.02);

const nearest = (seats: Seat[], p: Vector3) => seats.reduce((a, b) => (b.phone.distanceTo(p) < a.phone.distanceTo(p) ? b : a));

/** The same side as the deck's tug of war picks for a seat: 0 cats, 1 dogs. */
const team = (i: number) => (((i * 2654435761) >>> 0) % 100 < 50 ? 0 : 1);

// ---- the callouts, as the deck shows them, sized for a portrait frame ----

const BODIES: Record<string, ReactNode> = {
  join: (
    <Phone>
      <Status>Joined</Status>
      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>You're in.</div>
      <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.35 }}>Slide 1 of 9. Your screen follows the talk.</div>
    </Phone>
  ),
  vote: (
    <Phone>
      <Status>Slide 4 of 9</Status>
      <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>Where do we go next?</div>
      <Choice on>Lisbon</Choice>
      <Choice>Berlin</Choice>
      <Choice>A cabin</Choice>
    </Phone>
  ),
  agent: (
    <Pane title="terminal: offsite-talk" who="Agent" color={C.paper} width={392}>
      <Line at={0}>
        <span style={{ color: C.goldSoft }}>&gt; </span>add a tug of war after the Q&amp;A: cats against dogs
      </Line>
      <Line at={0}>{mute("● Wrote ")}plugins/tug/client.tsx</Line>
      <Line at={0}>{mute("● Added ")}slides/05-tug.mdx</Line>
      <Line at={0}>
        <span style={{ color: C.sage }}>✓ </span>build --check: ok
      </Line>
    </Pane>
  ),
  web: (
    <Pane title="deck editor, browser *" who="Mara" color={C.sage} width={236}>
      <div style={{ fontSize: 11, color: C.muted }}>Question</div>
      <div style={{ fontSize: 13, padding: "6px 9px", marginTop: 3, borderRadius: 8, border: `1px solid ${C.sage}` }}>Where should the offsite be?</div>
      <div style={{ fontSize: 11, color: C.sage, marginTop: 6 }}>Saved</div>
    </Pane>
  ),
  dev: (
    <Pane title="02-poll.mdx, editor" who="Jonas" color={C.goldSoft} width={236}>
      <div>{mute("options: [")}</div>
      <div>
        {"  "}
        <span style={{ color: C.code }}>"Lisbon"</span>
        {mute(", ")}
        <span style={{ color: C.code }}>"Berlin"</span>
        {mute(",")}
      </div>
      <div style={{ background: "rgba(201,162,75,0.16)", margin: "0 -12px", padding: "0 12px" }}>
        {"  "}
        <span style={{ color: C.code }}>"A cabin"</span>
        {mute(", ")}
        <span style={{ color: C.paper }}>"Porto"</span>
      </div>
      <div>{mute("],")}</div>
    </Pane>
  ),
  bot: (
    <Pane title="terminal" who="Agent" color={C.paper} width={176}>
      <div>
        <span style={{ color: C.goldSoft }}>&gt; </span>add a 30 second timer to the poll
      </div>
      <div>{mute("● Edited ")}02-poll.mdx</div>
    </Pane>
  ),
};

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
            {it.kind === "box" ? (
              BODIES[it.body]
            ) : (
              <div style={{ ...label, borderLeft: `1px solid ${C.line}` }}>
                <div>{it.lines[0]}</div>
                <div style={{ color: C.muted }}>{it.lines[1]}</div>
              </div>
            )}
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

/** A phone's own screen showing the poll, as its owner sees it. */
function pollScreen(): Mesh {
  const c = document.createElement("canvas");
  c.width = 336;
  c.height = 632;
  const g = c.getContext("2d")!;
  const sans = '"Schibsted Grotesk Variable", system-ui, sans-serif';
  g.fillStyle = "#161b12";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = PALETTE.sage;
  g.beginPath();
  g.arc(34, 70, 8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = PALETTE.muted;
  g.font = `500 24px ${sans}`;
  g.fillText("Slide 4 of 9", 52, 79);
  g.fillStyle = PALETTE.text;
  g.font = `700 38px ${sans}`;
  g.fillText("Where do we", 26, 150);
  g.fillText("go next?", 26, 196);
  ["Lisbon", "Berlin", "A cabin"].forEach((o, i) => {
    const y = 250 + i * 104;
    const on = i === 0;
    g.beginPath();
    g.roundRect(22, y, 292, 82, 18);
    g.fillStyle = on ? PALETTE.gold : "rgba(201, 162, 75, 0.1)";
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = on ? PALETTE.gold : "rgba(201, 162, 75, 0.4)";
    g.stroke();
    g.fillStyle = on ? PALETTE.bg : PALETTE.text;
    g.font = `600 32px ${sans}`;
    g.fillText(o, 48, y + 52);
    if (on) g.fillText("✓", 272, y + 52);
  });
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return new Mesh(new PlaneGeometry(0.084, 0.158), new MeshBasicMaterial({ map: t, toneMapped: false, fog: false }));
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
    const story = new Story(el, { still: true, reduced: true, people: still.people ?? true });
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
      cam.clearViewOffset();
      cam.aspect = w / h;
      cam.fov = still.fov;
      cam.position.copy(v(still.pos));
      cam.lookAt(v(still.target));
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      const fog = story.scene.fog as Fog;
      const d = v(still.pos).distanceTo(v(still.target));
      fog.near = d * 0.85;
      fog.far = d * 2.7;
      setClock(story.hall.room, new Date(2026, 0, 5, 10, 10, 0));

      const seats = story.hall.seats;
      // for choosing a seat when framing a shot: every seat's phone and head
      (window as unknown as { seats: unknown }).seats = seats.map((s) => ({ phone: s.phone.toArray().map((n) => +n.toFixed(2)), head: s.head.toArray().map((n) => +n.toFixed(2)), row: s.row }));
      const cardSeat = seats.length ? nearest(seats, new Vector3(-0.6, 0.3, -2.2)) : null;
      const hover = cardSeat ? cardSeat.head.clone().add(new Vector3(0, 1.25, -0.4)) : new Vector3();
      if (still.card && cardSeat) {
        const [u, w2] = ProjectionScreen.qaSlot(0);
        story.card.votes = 14;
        // the question is on its way: the screen does not list it yet
        story.screen.draw({ kind: "qa", questions: [{ text: "Will the slides be online afterwards?", votes: 9 }, { text: "Does it work without wifi?", votes: 6 }] }, 6, 9);
        story.card.place(0.22, cardSeat.head, hover, onScreen(u, w2), cam, 2.4);
      }
      // things in flight, frozen part way along their arcs (spread, not random)
      if (still.flight) {
        const gold = new Packets(48);
        const sage = new Packets(48, PALETTE.sage);
        const small = new Packets(24, PALETTE.gold, 0.05);
        story.scene.add(gold.mesh, sage.mesh, small.mesh);
        const n = seats.length;
        if (still.flight === "votes") {
          for (let k = 0; k < 12; k++) {
            const seat = seats[(k * 7 + 3) % n]!;
            const opt = [0, 1, 0, 2, 0, 1, 0, 2, 1, 0, 1, 0][k]!;
            const [u, w2] = ProjectionScreen.barEnd(opt, [1, 0.67, 0.48][opt]!);
            const progress = 0.12 + ((k * 0.37) % 0.76);
            gold.send(seat.phone, onScreen(u, w2), -progress, 1, 1.2 + (k % 3) * 0.5);
          }
        } else if (still.flight === "upvotes") {
          for (let k = 0; k < 6; k++) {
            const seat = seats[(k * 11 + 5) % n]!;
            const progress = 0.15 + k * 0.09;
            small.send(seat.phone, hover, -progress, 1, 0.6);
          }
        } else {
          for (let k = 0; k < 16; k++) {
            const side = (k % 2) as 0 | 1;
            const crew = seats.map((s, i) => ({ s, i })).filter(({ i }) => team(i) === side);
            const seat = crew[(k * 5) % crew.length]!.s;
            const [u, w2] = ProjectionScreen.ropeEnd(side);
            const progress = 0.15 + ((k * 0.29) % 0.7);
            (side === 0 ? gold : sage).send(seat.phone, onScreen(u, w2), -progress, 1, 1 + (k % 3) * 0.4);
          }
        }
        for (const p of [gold, sage, small]) p.update(0);
      }
      if (still.pollOn) {
        const seat = nearest(seats, v(still.pollOn));
        const m = new Matrix4();
        story.hall.phoneScreens.getMatrixAt(seats.indexOf(seat), m);
        const screen = pollScreen();
        screen.applyMatrix4(m.multiply(new Matrix4().makeTranslation(0, 0, 0.0006)));
        story.scene.add(screen);
      }
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
    <div id="still" style={{ position: "relative", width: still.width, height: still.height, overflow: "hidden", background: PALETTE.bg, fontFamily: '"Schibsted Grotesk Variable", system-ui, sans-serif' }}>
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
const still = STILLS.find((s) => s.id === id);
createRoot(document.getElementById("root")!).render(still ? <Scene still={still} /> : <p style={{ color: "#fff" }}>no still named {id}</p>);
