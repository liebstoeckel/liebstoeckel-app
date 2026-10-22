// Flat callouts pinned to points in the 3D hall: a close-up of one person's
// phone, cards for the people and agents working on the deck, and blueprint
// labels with leader lines. The hall reports where its anchor points land on
// screen every frame; positions are written straight to the DOM, so following
// the camera costs no React renders. Callouts are kept inside the frame.

import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { Anchors } from "./scene/story";

const C = {
  bg: "#10140e",
  card: "#161b12",
  line: "rgba(224, 197, 128, 0.55)",
  gold: "#c9a24b",
  goldSoft: "#e0c580",
  text: "#e9e6d7",
  muted: "#9da28c",
  sage: "#9cae86",
  paper: "#f4f1e6",
  ink: "#10140e",
  code: "#d8c48e",
};
const SANS = '"Schibsted Grotesk Variable", system-ui, sans-serif';
const MONO = '"JetBrains Mono Variable", ui-monospace, monospace';
const W = 1280;
const H = 720;
const EDGE = 14;

/** Pinned next to an anchor (offset dx, dy), or at a fixed spot in the frame with a line to the anchor. */
type Callout = {
  id: string;
  kind: "pin" | "card" | "label";
  anchor: string;
  dx?: number;
  dy?: number;
  at?: { x: number; y: number };
  delay?: number;
  body: ReactNode;
};
type Dimension = { id: string; kind: "dim"; a: string; b: string; delay?: number; body: ReactNode };
type Item = Callout | Dimension;

// ---- building blocks ----

function Phone({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: 200,
        padding: "12px 14px 14px",
        borderRadius: 24,
        border: `1px solid ${C.line}`,
        background: C.card,
        boxShadow: `0 0 0 5px ${C.bg}`,
        fontFamily: SANS,
        color: C.text,
        display: "flex",
        flexDirection: "column",
        gap: 9,
      }}
    >
      <div style={{ alignSelf: "center", width: 44, height: 4, borderRadius: 9, background: "#2b3422" }} />
      {children}
    </div>
  );
}

function Status({ children, color = C.sage }: { children: ReactNode; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: C.muted }}>
      <span style={{ width: 7, height: 7, borderRadius: 9, background: color, flex: "none" }} />
      {children}
    </div>
  );
}

function Choice({ on, children }: { on?: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        padding: "8px 11px",
        borderRadius: 11,
        fontSize: 14,
        fontWeight: 600,
        border: `1px solid ${on ? C.gold : "rgba(201, 162, 75, 0.3)"}`,
        background: on ? C.gold : "rgba(201, 162, 75, 0.08)",
        color: on ? C.ink : C.text,
        display: "flex",
        justifyContent: "space-between",
      }}
    >
      {children}
      {on && <span>✓</span>}
    </div>
  );
}

/** A window: the browser editor, a code editor or a terminal. */
function Pane({ title, who, color, width, children }: { title: string; who: string; color: string; width: number; children: ReactNode }) {
  return (
    <div
      style={{
        width,
        borderRadius: 12,
        border: `1px solid ${C.line}`,
        background: "#0d110b",
        boxShadow: `0 0 0 5px ${C.bg}`,
        overflow: "hidden",
        fontFamily: MONO,
        fontSize: 12,
        lineHeight: 1.7,
        color: C.text,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "6px 12px", background: "#1a2114", color: C.muted, fontSize: 11 }}>
        <span>{title}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color }}>
          <span style={{ width: 7, height: 7, borderRadius: 9, background: color }} />
          {who}
        </span>
      </div>
      <div style={{ padding: "9px 12px 11px" }}>{children}</div>
    </div>
  );
}

function Line({ at, children }: { at: number; children: ReactNode }) {
  return (
    <div className="hs-line" style={{ animationDelay: `${at}s`, whiteSpace: "pre-wrap" }}>
      {children}
    </div>
  );
}
const str = (text: string) => <span style={{ color: C.code }}>{text}</span>;
const mute = (text: string) => <span style={{ color: C.muted }}>{text}</span>;

// ---- what each slide shows ----

function beats(): { items: Item[]; shade: string }[] {
  return [
    {
      shade: "linear-gradient(90deg, rgba(16,20,14,0.92) 0%, rgba(16,20,14,0.6) 38%, transparent 64%)",
      items: [
        {
          id: "join",
          kind: "pin",
          anchor: "phone",
          dx: 70,
          dy: -40,
          body: (
            <Phone>
              <Status>Joined</Status>
              <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>You're in.</div>
              <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.35 }}>Slide 1 of 9. Your screen follows the talk.</div>
            </Phone>
          ),
        },
      ],
    },
    {
      shade: "linear-gradient(0deg, rgba(16,20,14,0.9) 0%, rgba(16,20,14,0.5) 30%, transparent 52%)",
      items: [
        {
          id: "vote",
          kind: "pin",
          anchor: "phone",
          dx: 60,
          dy: -40,
          body: (
            <Phone>
              <Status>Slide 4 of 9</Status>
              <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>Where do we go next?</div>
              <Choice on>Lisbon</Choice>
              <Choice>Berlin</Choice>
              <Choice>A cabin</Choice>
            </Phone>
          ),
        },
      ],
    },
    {
      shade: "linear-gradient(90deg, rgba(16,20,14,0.9) 0%, rgba(16,20,14,0.5) 34%, transparent 58%)",
      items: [
        {
          id: "ask",
          kind: "pin",
          anchor: "phone",
          dx: -60,
          dy: 70,
          body: (
            <Phone>
              <Status>Questions</Status>
              <div style={{ fontSize: 13.5, lineHeight: 1.35, padding: "9px 11px", borderRadius: 11, border: `1px solid ${C.line}`, background: "rgba(255,255,255,0.03)" }}>
                Can I write my own plugin?
              </div>
              <Choice on>Send question</Choice>
            </Phone>
          ),
        },
      ],
    },
    {
      shade: "linear-gradient(90deg, rgba(16,20,14,0.95) 0%, rgba(16,20,14,0.7) 36%, transparent 60%)",
      items: [
        {
          id: "agent",
          kind: "card",
          anchor: "screen",
          at: { x: 96, y: 290 },
          delay: 0.4,
          body: (
            <Pane title="terminal: offsite-talk" who="Agent" color={C.paper} width={470}>
              <Line at={0.7}>
                <span style={{ color: C.goldSoft }}>&gt; </span>add a tug of war after the Q&amp;A: the left half of the room against the right half
              </Line>
              <Line at={1.5}>{mute("● Wrote ")}plugins/tug/client.tsx</Line>
              <Line at={1.9}>{mute("● Added ")}slides/05-tug.mdx</Line>
              <Line at={2.3}>
                <span style={{ color: C.sage }}>✓ </span>build --check: ok
              </Line>
            </Pane>
          ),
        },
      ],
    },
    {
      shade: "linear-gradient(90deg, rgba(16,20,14,0.95) 0%, rgba(16,20,14,0.7) 30%, transparent 50%)",
      items: [
        {
          id: "web",
          kind: "card",
          anchor: "edit:question",
          at: { x: 762, y: 548 },
          delay: 1.2,
          body: (
            <Pane title="deck editor, browser" who="Mara" color={C.sage} width={236}>
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.muted }}>Question</div>
              <div style={{ fontFamily: SANS, fontSize: 13, padding: "6px 9px", marginTop: 3, borderRadius: 8, border: `1px solid ${C.sage}` }}>Where should the offsite be?</div>
              <div style={{ fontFamily: SANS, fontSize: 11, color: C.sage, marginTop: 6 }}>Saved</div>
            </Pane>
          ),
        },
        {
          id: "dev",
          kind: "card",
          anchor: "edit:option:3",
          at: { x: 506, y: 548 },
          delay: 3.8,
          body: (
            <Pane title="02-poll.mdx, editor" who="Jonas" color={C.goldSoft} width={236}>
              <div>{mute("options: [")}</div>
              <div>
                {"  "}
                {str('"Lisbon"')}
                {mute(", ")}
                {str('"Berlin"')}
                {mute(",")}
              </div>
              <div style={{ background: "rgba(201,162,75,0.16)", margin: "0 -12px", padding: "0 12px" }}>
                {"  "}
                {str('"A cabin"')}
                {mute(", ")}
                <span style={{ color: C.paper }}>"Porto"</span>
              </div>
              <div>{mute("],")}</div>
            </Pane>
          ),
        },
        {
          id: "bot",
          kind: "card",
          anchor: "edit:note",
          at: { x: 1018, y: 548 },
          delay: 5.0,
          body: (
            <Pane title="terminal" who="Agent" color={C.paper} width={236}>
              <div>
                <span style={{ color: C.goldSoft }}>&gt; </span>add a 30 second timer to the poll
              </div>
              <div>{mute("● Edited ")}02-poll.mdx</div>
            </Pane>
          ),
        },
      ],
    },
    {
      shade: "linear-gradient(90deg, rgba(16,20,14,0.92) 0%, rgba(16,20,14,0.6) 36%, transparent 60%)",
      items: [
        { id: "dim", kind: "dim", a: "stageL", b: "stageR", body: <div>deck.html</div> },
        {
          id: "plant",
          kind: "label",
          anchor: "plant",
          dx: -30,
          dy: 40,
          body: (
            <>
              <div>Lovage</div>
              <div style={{ color: C.muted }}>German: Liebstöckel</div>
            </>
          ),
        },
      ],
    },
  ];
}

const CSS = `
@keyframes hs-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
.hs-item { animation: hs-in 700ms cubic-bezier(.16,1,.3,1) both }
.hs-shade { transition: background 900ms ease }
@keyframes hs-type { from { clip-path: inset(0 100% 0 0) } to { clip-path: inset(0 0 0 0) } }
.hs-line { animation: hs-type 420ms steps(18) both }
@media (prefers-reduced-motion: reduce) { .hs-item, .hs-line { animation: none } }
`;

type Nodes = { line?: SVGLineElement | null; dot?: SVGCircleElement | null; box?: HTMLDivElement | null; t1?: SVGLineElement | null; t2?: SVGLineElement | null };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function Overlay({ beat, still, register }: { beat: number; still: boolean; register: (fn: (a: Anchors) => void) => void }) {
  const cfg = beats()[beat] ?? beats()[0]!;
  const nodes = useRef(new Map<string, Nodes>());

  useLayoutEffect(() => {
    register((a) => {
      const set = (el: Element | null | undefined, attrs: Record<string, number>) => {
        for (const [k, v] of Object.entries(attrs)) el?.setAttribute(k, String(v));
      };
      for (const it of cfg.items) {
        const n = nodes.current.get(it.id);
        if (!n) continue;
        if (it.kind === "dim") {
          const p = a[it.a];
          const q = a[it.b];
          if (!p || !q) continue;
          set(n.line, { x1: p.x, y1: p.y + 26, x2: q.x, y2: q.y + 26 });
          set(n.t1, { x1: p.x, x2: p.x, y1: p.y + 16, y2: p.y + 36 });
          set(n.t2, { x1: q.x, x2: q.x, y1: q.y + 16, y2: q.y + 36 });
          if (n.box) n.box.style.transform = `translate(${(p.x + q.x) / 2}px, ${(p.y + q.y) / 2 + 40}px) translate(-50%, 0)`;
          continue;
        }
        const p = a[it.anchor];
        if (!p || !n.box) continue;
        const bw = n.box.offsetWidth;
        const bh = n.box.offsetHeight;
        let left: number;
        let top: number;
        if (it.at) {
          left = it.at.x;
          top = it.at.y;
        } else {
          const x2 = p.x + (it.dx ?? 0);
          const y2 = p.y + (it.dy ?? 0);
          left = (it.dx ?? 0) < 0 ? x2 - bw : x2;
          top = (it.dy ?? 0) < 0 ? y2 - bh : y2;
        }
        // keep the whole callout inside the frame
        left = clamp(left, EDGE, W - EDGE - bw);
        top = clamp(top, EDGE, H - EDGE - bh);
        n.box.style.transform = `translate(${left}px, ${top}px)`;
        // the leader line meets the box at its nearest edge point
        set(n.line, { x1: p.x, y1: p.y, x2: clamp(p.x, left, left + bw), y2: clamp(p.y, top, top + bh) });
        set(n.dot, { cx: p.x, cy: p.y });
        const show = p.on ? "visible" : "hidden";
        n.box.style.visibility = show;
        n.line?.setAttribute("visibility", show);
        n.dot?.setAttribute("visibility", show);
      }
    });
  }, [cfg, register]);

  const ref = (id: string, key: keyof Nodes) => (el: SVGLineElement | SVGCircleElement | HTMLDivElement | null) => {
    const n = nodes.current.get(id) ?? {};
    (n as Record<string, unknown>)[key] = el;
    nodes.current.set(id, n);
  };
  const delay = (it: Item) => (still ? undefined : `${it.delay ?? 1.7}s`);
  const cls = still ? undefined : "hs-item";

  return (
    <>
      <style>{CSS}</style>
      <div className="hs-shade" style={{ position: "absolute", inset: 0, background: cfg.shade }} />
      <div key={beat} style={{ position: "absolute", inset: 0 }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {cfg.items.map((it) =>
            it.kind === "dim" ? (
              <g key={it.id} stroke={C.goldSoft} strokeWidth="1" opacity="0.8" className={cls} style={{ animationDelay: delay(it) }}>
                <line ref={ref(it.id, "line")} strokeDasharray="5 4" />
                <line ref={ref(it.id, "t1")} />
                <line ref={ref(it.id, "t2")} />
              </g>
            ) : (
              <g key={it.id} className={cls} style={{ animationDelay: delay(it) }}>
                <line ref={ref(it.id, "line")} stroke={C.line} strokeWidth="1" />
                <circle ref={ref(it.id, "dot")} r="4.5" fill={C.bg} stroke={C.goldSoft} strokeWidth="1.5" />
              </g>
            ),
          )}
        </svg>
        {cfg.items.map((it) => (
          <div key={it.id} ref={ref(it.id, "box")} style={{ position: "absolute", left: 0, top: 0, willChange: "transform" }}>
            <div
              className={cls}
              style={{
                animationDelay: delay(it),
                ...(it.kind === "label" || it.kind === "dim"
                  ? {
                      fontFamily: MONO,
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: C.goldSoft,
                      padding: "6px 10px",
                      borderLeft: it.kind === "label" ? `1px solid ${C.line}` : undefined,
                      background: "rgba(16,20,14,0.82)",
                      whiteSpace: "nowrap",
                    }
                  : {}),
              }}
            >
              {it.body}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
