import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { definePlugin, type ClientProps } from "@present-it/plugin-sdk";
import { Card, Eyebrow } from "@present-it/plugin-ui";
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
      animate={{ opacity: [0, 1, 1, 0], y: -180, x: j.drift, rotate: j.tilt, scale: j.scale }}
      exit={{ opacity: 0 }}
      transition={{ duration: 3.6, ease: [0.16, 1, 0.3, 1], opacity: { times: [0, 0.12, 0.7, 1] } }}
      style={{ position: "absolute", bottom: 0, fontSize: "2rem", lineHeight: 1, willChange: "transform, opacity" }}
    >
      {r.emoji}
    </motion.span>
  );
}

/** In-deck UI: a row of emoji buttons + a non-blocking float layer above the deck. */
function ReactionsSlide(p: ClientProps<ReactionsState>) {
  const { snapshot, state, participantId } = p;
  const lastEmit = useRef(0);
  const [, force] = useState(0); // re-tick `recent()` as the window slides
  const live = recent(snapshot, Date.now());

  const emit = (emoji: string) => {
    const now = Date.now();
    if (!allowEmit(lastEmit.current, now)) return;
    lastEmit.current = now;
    state.recordSet("reactions", crypto.randomUUID(), { emoji, pid: participantId, ts: now });
  };

  // Prune expired + over-cap entries so the doc stays small; also re-render so
  // floaters that exit the window unmount via AnimatePresence.
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
    <Card style={{ position: "relative", minWidth: 360, overflow: "visible" }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", borderRadius: "1rem" }}>
        <div style={{ position: "absolute", left: "50%", bottom: "5.5rem", transform: "translateX(-50%)", display: "flex" }}>
          <AnimatePresence>
            {live.map((r) => (
              <Floater key={r.id} r={r} />
            ))}
          </AnimatePresence>
        </div>
      </div>
      <Eyebrow>React</Eyebrow>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", position: "relative" }}>
        {EMOJI.map((e) => (
          <motion.button
            key={e}
            onClick={() => emit(e)}
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
    </Card>
  );
}

/** No live server → a static, disabled row of the palette with a hint. */
function ReactionsFallback() {
  return (
    <Card style={{ minWidth: 360 }}>
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
  },
});
