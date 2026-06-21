import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { definePlugin, type ClientProps, type GlobalProps, type PluginState } from "@liebstoeckel/plugin-sdk";
import { Card, Eyebrow } from "@liebstoeckel/plugin-ui";
import {
  reactionsSchema,
  EMOJI,
  MAX_ENTRIES,
  recent,
  expired,
  allowEmit,
  overCapIds,
  type ReactionsState,
  type Reaction,
} from "./logic";

const v = (name: string, fallback: string) => `var(--brand-${name}, ${fallback})`;

/** Deterministic per-id horizontal drift / scale so renders are stable. */
function jitter(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const r = (n: number) => ((Math.abs(h >> n) % 1000) / 1000) * 2 - 1; // -1..1
  return { drift: r(0) * 60, tilt: r(4) * 18, scale: 1 + r(8) * 0.25 };
}

/** A single emoji rising, drifting and fading with spring physics. */
function Floater({ r }: { r: Reaction }) {
  const j = jitter(r.id);
  return (
    <motion.span
      initial={{ opacity: 0, y: 0, scale: 0.4 }}
      animate={{ opacity: [0, 1, 1, 0], y: -260, x: j.drift, rotate: j.tilt, scale: j.scale }}
      exit={{ opacity: 0 }}
      // Linger: hold opaque for most of the rise and fade only in the last fifth,
      // so a burst is comfortably readable (WINDOW_MS prunes just after this ends).
      transition={{ duration: 5.2, ease: [0.16, 1, 0.3, 1], opacity: { times: [0, 0.06, 0.82, 1] } }}
      style={{ position: "absolute", bottom: 0, fontSize: "2.4rem", lineHeight: 1, willChange: "transform, opacity" }}
    >
      {r.emoji}
    </motion.span>
  );
}

/** The live floaters + the prune loop that keeps the doc bounded. Caller positions
 *  it (anchored bottom-center inside a card, or deck-wide in the global overlay). */
function FloatLayer({ snapshot, state }: { snapshot: ReactionsState; state: PluginState<ReactionsState> }) {
  const [, force] = useState(0); // re-tick `recent()` as the window slides
  const live = recent(snapshot, Date.now());
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const id of expired(snapshot, now)) state.recordDelete("reactions", id);
      for (const id of overCapIds(snapshot, MAX_ENTRIES)) state.recordDelete("reactions", id);
      force((n) => n + 1);
    };
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, [snapshot, state]);
  return (
    <AnimatePresence>
      {live.map((r) => (
        <Floater key={r.id} r={r} />
      ))}
    </AnimatePresence>
  );
}

/** A rate-limited emit, shared by the slide, the panel and any other surface. */
function useEmit(state: PluginState<ReactionsState>, participantId: string) {
  const lastEmit = useRef(0);
  return (emoji: string) => {
    const now = Date.now();
    if (!allowEmit(lastEmit.current, now)) return;
    lastEmit.current = now;
    state.recordSet("reactions", crypto.randomUUID(), { emoji, pid: participantId, ts: now });
  };
}

/** The springy row of emoji buttons. */
function EmojiPalette({ onEmit }: { onEmit: (emoji: string) => void }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", position: "relative" }}>
      {EMOJI.map((e) => (
        <motion.button
          key={e}
          onClick={() => onEmit(e)}
          whileTap={{ scale: 0.86 }}
          whileHover={{ scale: 1.08 }}
          transition={{ type: "spring", stiffness: 500, damping: 24 }}
          style={{
            appearance: "none",
            cursor: "pointer",
            width: "3.1rem",
            height: "3.1rem",
            fontSize: "1.5rem",
            lineHeight: 1,
            borderRadius: "0.7rem",
            border: `1px solid ${v("border", "#222734")}`,
            background: `color-mix(in srgb, ${v("surface", "#11141b")} 60%, transparent)`,
          }}
        >
          {e}
        </motion.button>
      ))}
    </div>
  );
}

/** In-deck slide: a palette over an in-card float layer (a showcase surface). */
function ReactionsSlide(p: ClientProps<ReactionsState>) {
  const { snapshot, state, participantId } = p;
  const emit = useEmit(state, participantId);
  return (
    <Card style={{ position: "relative", width: "100%", maxWidth: 420, overflow: "visible" }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", borderRadius: "1rem" }}>
        <div style={{ position: "absolute", left: "50%", bottom: "5.5rem", transform: "translateX(-50%)", display: "flex" }}>
          <FloatLayer snapshot={snapshot} state={state} />
        </div>
      </div>
      <Eyebrow>React</Eyebrow>
      <EmojiPalette onEmit={emit} />
    </Card>
  );
}

/** Global overlay: floaters rising deck-wide, anchored bottom-center. Rendered in
 *  the engine's non-interactive overlay layer, so it's available on every slide. */
function ReactionsOverlay({ snapshot, state }: ClientProps<ReactionsState>) {
  return (
    <div style={{ position: "absolute", left: "50%", bottom: "9%", transform: "translateX(-50%)", display: "flex" }}>
      <FloatLayer snapshot={snapshot} state={state} />
    </div>
  );
}

/** A line icon matching the engine's chrome/share/maximize SVGs (stroke, 24 grid), a
 *  smiley, since reactions are emoji feedback. Keeps the rail visually consistent. */
function ReactionsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
      <path d="M9 9.5h.01M15 9.5h.01" />
    </svg>
  );
}

/** Global panel: the palette, reachable from anywhere via the chrome control. */
function ReactionsPanel(p: GlobalProps<ReactionsState>) {
  const emit = useEmit(p.state, p.participantId);
  return (
    <>
      <Eyebrow>React</Eyebrow>
      <EmojiPalette onEmit={emit} />
    </>
  );
}

/** No live server → a static, disabled row of the palette with a hint. */
function ReactionsFallback() {
  return (
    <Card style={{ width: "100%", maxWidth: 420 }}>
      <Eyebrow>React · offline preview</Eyebrow>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {EMOJI.map((e) => (
          <div
            key={e}
            style={{
              width: "3.1rem",
              height: "3.1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.5rem",
              borderRadius: "0.7rem",
              border: `1px solid ${v("border", "#222734")}`,
              background: `color-mix(in srgb, ${v("surface", "#11141b")} 60%, transparent)`,
              opacity: 0.6,
            }}
          >
            {e}
          </div>
        ))}
      </div>
      <div style={{ marginTop: "1rem", color: v("muted", "#8b93a7"), fontFamily: v("font-mono", "monospace"), fontSize: "0.8rem" }}>
        Start the live server to react.
      </div>
    </Card>
  );
}

export default definePlugin<ReactionsState>({
  id: "reactions",
  state: reactionsSchema,
  client: {
    Slide: ReactionsSlide,
    fallback: ReactionsFallback,
    global: {
      Overlay: ReactionsOverlay,
      icon: <ReactionsIcon />,
      label: "Reactions",
      pinned: true, // quick, frequent → stays in the rail on mobile ((internal ADR))
      Panel: ReactionsPanel,
    },
  },
});
