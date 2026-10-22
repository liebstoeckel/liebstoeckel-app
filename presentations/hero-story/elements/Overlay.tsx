// Flat callouts pinned to points in the 3D hall: a close-up of one person's
// phone, and blueprint labels with leader lines. The hall reports where its
// anchor points land on screen every frame; positions are written straight to
// the DOM, so following the camera costs no React renders.

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
  ink: "#10140e",
};
const SANS = '"Schibsted Grotesk Variable", system-ui, sans-serif';
const MONO = '"JetBrains Mono Variable", ui-monospace, monospace';

type Pinned = { id: string; kind: "phone" | "label"; anchor: string; dx: number; dy: number; body: ReactNode };
type Dimension = { id: string; kind: "dim"; a: string; b: string; body: ReactNode };
type Item = Pinned | Dimension;

// ---- the phone close-ups ----

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

function Status({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: C.muted }}>
      <span style={{ width: 7, height: 7, borderRadius: 9, background: C.sage }} />
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

const ICONS = [
  <path key="h" d="M12 20s-7-4.4-7-9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.4C19 15.6 12 20 12 20z" fill="currentColor" />,
  <path key="s" d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" fill="currentColor" />,
  <g key="l" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8 13.5a4.5 4.5 0 0 0 8 0M8.5 9.5l2 1M15.5 9.5l-2 1" />
  </g>,
  <g key="c" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="5.5" y="4" width="5" height="14" rx="2.5" transform="rotate(-18 8 11)" />
    <rect x="13.5" y="4" width="5" height="14" rx="2.5" transform="rotate(18 16 11)" />
  </g>,
];

const CODE: [string, string][][] = [
  [["#e0c580", "import"], ["#9da28c", " { "], ["#f4f1e6", "Plugin"], ["#9da28c", " } "], ["#e0c580", "from"], ["#d8c48e", ' "@liebstoeckel/engine"']],
  [],
  [["#9da28c", "<"], ["#f4f1e6", "Plugin"], ["#9cae86", " id"], ["#9da28c", "="], ["#d8c48e", '"poll"'], ["#9cae86", " props"], ["#9da28c", "={{"]],
  [["#9cae86", "  question"], ["#9da28c", ": "], ["#d8c48e", '"Where do we go next?"'], ["#9da28c", ","]],
  [["#9cae86", "  options"], ["#9da28c", ": ["], ["#d8c48e", '"Lisbon", "Berlin", "A cabin"'], ["#9da28c", "],"]],
  [["#9da28c", "}} />"]],
];

function CodeCard() {
  return (
    <div
      style={{
        width: 400,
        borderRadius: 12,
        border: `1px solid ${C.line}`,
        background: "#0d110b",
        boxShadow: `0 0 0 5px ${C.bg}`,
        fontFamily: MONO,
        fontSize: 12.5,
        lineHeight: 1.75,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 14px", background: "#1a2114", color: C.muted, fontSize: 11.5 }}>
        <span>slides/02-poll.mdx</span>
        <span style={{ color: C.sage }}>saved, live on 52 phones</span>
      </div>
      <div style={{ padding: "10px 14px 12px" }}>
        {CODE.map((line, i) => (
          <div key={i} className="hs-line" style={{ animationDelay: `${2.0 + i * 0.28}s`, whiteSpace: "pre", minHeight: "1.75em" }}>
            {line.map(([color, text], j) => (
              <span key={j} style={{ color }}>
                {text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function beats(): { items: Item[]; shade: string }[] {
  return [
    {
      shade: "linear-gradient(90deg, rgba(16,20,14,0.92) 0%, rgba(16,20,14,0.6) 38%, transparent 64%)",
      items: [
        {
          id: "join",
          kind: "phone",
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
          kind: "phone",
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
          kind: "phone",
          anchor: "phone",
          dx: -60,
          dy: 70,
          body: (
            <Phone>
              <Status>Questions</Status>
              <div
                style={{
                  fontSize: 13.5,
                  lineHeight: 1.35,
                  padding: "9px 11px",
                  borderRadius: 11,
                  border: `1px solid ${C.line}`,
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                Can I write my own plugin?
              </div>
              <Choice on>Send question</Choice>
            </Phone>
          ),
        },
      ],
    },
    {
      shade: "linear-gradient(180deg, rgba(16,20,14,0.94) 0%, rgba(16,20,14,0.6) 34%, transparent 54%)",
      items: [
        {
          id: "react",
          kind: "phone",
          anchor: "phone",
          dx: 110,
          dy: -60,
          body: (
            <Phone>
              <Status>Slide 8 of 9</Status>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {ICONS.map((icon, i) => (
                  <div
                    key={i}
                    style={{
                      height: 52,
                      borderRadius: 14,
                      display: "grid",
                      placeItems: "center",
                      color: i === 0 ? C.ink : C.goldSoft,
                      background: i === 0 ? C.gold : "rgba(201, 162, 75, 0.08)",
                      border: `1px solid ${i === 0 ? C.gold : "rgba(201, 162, 75, 0.3)"}`,
                    }}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24">
                      {icon}
                    </svg>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: C.muted }}>Hold to send a stream</div>
            </Phone>
          ),
        },
      ],
    },
    {
      shade: "linear-gradient(0deg, rgba(16,20,14,0.94) 0%, rgba(16,20,14,0.7) 34%, transparent 58%)",
      items: [
        {
          id: "file",
          kind: "phone",
          anchor: "laptop",
          dx: -140,
          dy: -190,
          body: <CodeCard />,
        },
      ],
    },
    {
      shade: "linear-gradient(90deg, rgba(16,20,14,0.92) 0%, rgba(16,20,14,0.6) 36%, transparent 60%)",
      items: [
        {
          id: "dim",
          kind: "dim",
          a: "stageL",
          b: "stageR",
          body: <div>deck.html, the whole talk in one file</div>,
        },
        {
          id: "plant",
          kind: "label",
          anchor: "plant",
          dx: -50,
          dy: -26,
          body: (
            <>
              <div>Levisticum officinale</div>
              <div style={{ color: C.muted }}>lovage, in German: Liebstöckel</div>
            </>
          ),
        },
      ],
    },
  ];
}

const CSS = `
@keyframes hs-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
.hs-beat { animation: hs-in 700ms cubic-bezier(.16,1,.3,1) 1.7s both }
.hs-shade { transition: background 900ms ease }
@keyframes hs-type { from { clip-path: inset(0 100% 0 0) } to { clip-path: inset(0 0 0 0) } }
.hs-line { animation: hs-type 420ms steps(18) both }
@media (prefers-reduced-motion: reduce) { .hs-beat, .hs-line { animation: none } }
`;

export function Overlay({ beat, still, register }: { beat: number; still: boolean; register: (fn: (a: Anchors) => void) => void }) {
  const cfg = beats()[beat] ?? beats()[0]!;
  const nodes = useRef(new Map<string, { line?: SVGLineElement | null; dot?: SVGCircleElement | null; box?: HTMLDivElement | null; t1?: SVGLineElement | null; t2?: SVGLineElement | null }>());

  useLayoutEffect(() => {
    register((a) => {
      for (const it of cfg.items) {
        const n = nodes.current.get(it.id);
        if (!n) continue;
        if (it.kind === "dim") {
          const p = a[it.a];
          const q = a[it.b];
          if (!p || !q) continue;
          n.line?.setAttribute("x1", String(p.x));
          n.line?.setAttribute("y1", String(p.y + 26));
          n.line?.setAttribute("x2", String(q.x));
          n.line?.setAttribute("y2", String(q.y + 26));
          for (const [t, s] of [[n.t1, p], [n.t2, q]] as const) {
            t?.setAttribute("x1", String(s.x));
            t?.setAttribute("x2", String(s.x));
            t?.setAttribute("y1", String(s.y + 16));
            t?.setAttribute("y2", String(s.y + 36));
          }
          if (n.box) n.box.style.transform = `translate(${(p.x + q.x) / 2}px, ${(p.y + q.y) / 2 + 40}px) translate(-50%, 0)`;
          continue;
        }
        const p = a[it.anchor];
        if (!p) continue;
        const x2 = p.x + it.dx;
        const y2 = p.y + it.dy;
        n.dot?.setAttribute("cx", String(p.x));
        n.dot?.setAttribute("cy", String(p.y));
        n.line?.setAttribute("x1", String(p.x));
        n.line?.setAttribute("y1", String(p.y));
        n.line?.setAttribute("x2", String(x2));
        n.line?.setAttribute("y2", String(y2));
        if (n.box) {
          const sx = it.dx < 0 ? "-100%" : "0";
          const sy = it.dy < 0 ? "-100%" : "0";
          n.box.style.transform = `translate(${x2}px, ${y2}px) translate(${sx}, ${sy})`;
          n.box.style.visibility = p.on ? "visible" : "hidden";
        }
      }
    });
  }, [cfg, register]);

  const ref = (id: string, key: "line" | "dot" | "box" | "t1" | "t2") => (el: SVGLineElement | SVGCircleElement | HTMLDivElement | null) => {
    const n = nodes.current.get(id) ?? {};
    (n as Record<string, unknown>)[key] = el;
    nodes.current.set(id, n);
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="hs-shade" style={{ position: "absolute", inset: 0, background: cfg.shade }} />
      <div key={beat} className={still ? "" : "hs-beat"} style={{ position: "absolute", inset: 0 }}>
        <svg width="1280" height="720" viewBox="0 0 1280 720" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {cfg.items.map((it) =>
            it.kind === "dim" ? (
              <g key={it.id} stroke={C.goldSoft} strokeWidth="1" opacity="0.8">
                <line ref={ref(it.id, "line")} strokeDasharray="5 4" />
                <line ref={ref(it.id, "t1")} />
                <line ref={ref(it.id, "t2")} />
              </g>
            ) : (
              <g key={it.id}>
                <line ref={ref(it.id, "line")} stroke={C.line} strokeWidth="1" />
                <circle ref={ref(it.id, "dot")} r="4.5" fill={C.bg} stroke={C.goldSoft} strokeWidth="1.5" />
              </g>
            ),
          )}
        </svg>
        {cfg.items.map((it) => (
          <div
            key={it.id}
            ref={ref(it.id, "box")}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              willChange: "transform",
              ...(it.kind === "phone"
                ? {}
                : {
                    fontFamily: MONO,
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: C.goldSoft,
                    padding: "6px 10px",
                    borderLeft: it.kind === "label" ? `1px solid ${C.line}` : undefined,
                    background: "rgba(16,20,14,0.82)",
                    whiteSpace: "nowrap",
                  }),
            }}
          >
            {it.body}
          </div>
        ))}
      </div>
    </>
  );
}
