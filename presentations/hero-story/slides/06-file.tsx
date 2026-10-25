import type { CSSProperties, ReactNode } from "react";
import { MONO } from "../elements/Overlay";
import { Text } from "./_Text";
import type { HallProps } from "../elements/HallBackdrop";

export const notes = "The whole room, pulled back: the talk is one HTML file, and the file turns back into the project it came from.";
export const backdropProps: HallProps = { scene: "file" };

// Between the two terminals, what they do to the files: the deck's 21 source files
// go into one deck.html, and eject brings the same 21 back. (21 is what ejecting
// this very deck writes.) Everything plays once, within five seconds, and rests on
// the finished picture, which is also what thumbnails and reduced motion show.
const COLS = 7;
const FILES = 21;
const GW = 14;
const GH = 18;
const GRID_W = COLS * GW + (COLS - 1) * 5;
const TOP = 10;
const MID = TOP + 33;
const CARD = { x: 234, w: 52, h: 66 };
const RIGHT = 392;

const cell = (i: number, x0: number) => ({ x: x0 + (i % COLS) * (GW + 5), y: TOP + Math.floor(i / COLS) * (GH + 6) });
const toCard = (c: { x: number; y: number }) => ({
  "--dx": `${CARD.x + CARD.w / 2 - (c.x + GW / 2)}px`,
  "--dy": `${MID - (c.y + GH / 2)}px`,
});

const CSS = `
@keyframes fl-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@keyframes fl-type { from { clip-path: inset(0 100% 0 0) } to { clip-path: inset(0 0 0 0) } }
@keyframes fl-draw { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }
@keyframes fl-bundle { from { opacity: 1; transform: none } 70% { opacity: 1 } to { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(.3) } }
@keyframes fl-eject { from { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(.3) } 30% { opacity: 1 } to { opacity: 1; transform: none } }
@keyframes fl-pop { from { opacity: 0; transform: scale(.6) } to { opacity: 1; transform: none } }
.fl-in { animation: fl-in 500ms cubic-bezier(.16,1,.3,1) both }
.fl-type { animation: fl-type 400ms steps(20) both }
.fl-draw { stroke-dasharray: 1; animation: fl-draw 600ms ease-out both }
.fl-bundle { opacity: 0; animation: fl-bundle 600ms cubic-bezier(.55,0,.75,.4) forwards }
.fl-eject { animation: fl-eject 600ms cubic-bezier(.2,.6,.3,1) both }
.fl-pop { transform-origin: center; animation: fl-pop 500ms cubic-bezier(.34,1.56,.64,1) both }
@media (prefers-reduced-motion: reduce) { .fl-in, .fl-type, .fl-draw, .fl-bundle, .fl-eject, .fl-pop { animation: none } }
`;

const at = (s: number): CSSProperties => ({ animationDelay: `${s}s` });

function Glyph({ x, y, className, style }: { x: number; y: number; className?: string; style?: CSSProperties }) {
  return (
    <svg
      width={GW}
      height={GH}
      viewBox={`0 0 ${GW} ${GH}`}
      className={className}
      style={{ position: "absolute", left: x, top: y, overflow: "visible", ...style }}
    >
      <path d="M.5 .5H9.5L13.5 4.5V17.5H.5Z M9.5 .5V4.5H13.5" fill="rgba(16,20,14,.9)" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function Label({ x, w, y, name, count, style }: { x: number; w: number; y: number; name: string; count: string; style?: CSSProperties }) {
  return (
    <div className="fl-in absolute text-center font-mono text-[13px] leading-[1.45]" style={{ left: x, top: y, width: w, ...style }}>
      <div className="text-accent">{name}</div>
      <div className="text-muted">{count}</div>
    </div>
  );
}

function Arrow({ x1, x2, label, delay }: { x1: number; x2: number; label: string; delay: number }) {
  return (
    <>
      <svg className="text-accent" style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={RIGHT + GRID_W} height={112}>
        <path d={`M${x1} ${MID}H${x2}`} pathLength={1} className="fl-draw" style={at(delay)} fill="none" stroke="currentColor" strokeWidth="1" />
        <path d={`M${x2 - 6} ${MID - 4}L${x2} ${MID}L${x2 - 6} ${MID + 4}`} className="fl-in" style={at(delay + 0.45)} fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
      <div className="fl-in absolute text-center font-mono text-[12px] text-muted" style={{ left: x1, width: x2 - x1, top: MID - 24, ...at(delay + 0.5) }}>
        {label}
      </div>
    </>
  );
}

function Term({ children, x, y, delay }: { children: ReactNode; x: number; y: number; delay: number }) {
  return (
    <div
      className="fl-in absolute flex flex-col gap-1.5 rounded-lg border border-border bg-surface px-4 py-3 font-mono text-[17px] text-text"
      style={{ left: x, top: y, ...at(delay) }}
    >
      {children}
    </div>
  );
}

const Cmd = ({ children, delay }: { children: ReactNode; delay: number }) => (
  <span className="fl-type whitespace-nowrap" style={at(delay)}>
    <span className="text-primary">$</span> {children}
  </span>
);
const Done = ({ children, delay }: { children: ReactNode; delay: number }) => (
  <span className="fl-type whitespace-nowrap text-muted" style={at(delay)}>
    <span className="text-primary">✓</span> {children}
  </span>
);

export default function File() {
  const files = Array.from({ length: FILES }, (_, i) => i);
  return (
    <>
      <style>{CSS}</style>
      <Text kicker="One file" title="One HTML file, works offline" x={96} y={56} width={480} />

      <Term x={96} y={252} delay={0.3}>
        <Cmd delay={0.5}>liebstoeckel build</Cmd>
        <Done delay={1.9}>built dist/deck.html</Done>
      </Term>

      <div className="absolute" style={{ left: 96, top: 362, width: RIGHT + GRID_W, height: 112 }}>
        {/* the source, and copies of it flying into the file */}
        <div className="fl-in text-muted" style={at(0.3)}>
          {files.map((i) => (
            <Glyph key={i} {...cell(i, 0)} />
          ))}
        </div>
        {files.map((i) => {
          const c = cell(i, 0);
          return <Glyph key={i} {...c} className="fl-bundle text-muted" style={{ ...toCard(c), ...at(1 + i * 0.02) } as CSSProperties} />;
        })}
        <Label x={0} w={GRID_W} y={TOP + 74} name="source" count="21 files" style={at(0.3)} />

        <Arrow x1={GRID_W + 14} x2={CARD.x - 12} label="build" delay={1} />

        <svg
          className="fl-pop absolute overflow-visible text-primary"
          style={{ left: CARD.x, top: MID - CARD.h / 2, ...at(1.7) }}
          width={CARD.w}
          height={CARD.h}
          viewBox={`0 0 ${CARD.w} ${CARD.h}`}
        >
          <path
            d={`M.75 .75H${CARD.w - 14}L${CARD.w - 0.75} 14V${CARD.h - 0.75}H.75Z M${CARD.w - 14} .75V14H${CARD.w - 0.75}`}
            fill="#262515"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <text x={CARD.w / 2} y={CARD.h / 2 + 9} textAnchor="middle" fill="currentColor" style={{ font: `500 13px ${MONO}` }}>
            {"</>"}
          </text>
        </svg>
        <Label x={CARD.x - 30} w={CARD.w + 60} y={TOP + 74} name="deck.html" count="1 file" style={at(1.9)} />

        <Arrow x1={CARD.x + CARD.w + 12} x2={RIGHT - 14} label="eject" delay={3.4} />

        {/* the same files, out of the file again */}
        {files.map((i) => {
          const c = cell(i, RIGHT);
          return <Glyph key={i} {...c} className="fl-eject text-muted" style={{ ...toCard(c), ...at(3.4 + i * 0.02) } as CSSProperties} />;
        })}
        <Label x={RIGHT} w={GRID_W} y={TOP + 74} name="deck-source" count="21 files" style={at(4.1)} />
      </div>

      <Term x={96 + RIGHT + GRID_W - 384} y={526} delay={2.6}>
        <Cmd delay={2.8}>liebstoeckel eject dist/deck.html</Cmd>
        <Done delay={4.1}>ejected 21 files → deck-source</Done>
      </Term>

      <p className="fl-in absolute font-mono text-[13px] text-muted" style={{ left: 96, top: 652, ...at(0.3) }}>
        Open source, MPL-2.0
      </p>
    </>
  );
}
