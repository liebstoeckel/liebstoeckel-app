import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { StageScaleContext } from "../Stage";
import { useCoarsePointer } from "../useCoarsePointer";
import { breakoutEligible } from "../mobile";

/** Set false to suppress the touch breakout for plugins in a subtree (e.g. the
 *  presenter's non-interactive slide preview). */
export const BreakoutAllowedContext = createContext(true);

/** Whether a plugin should offer tap-to-expand instead of inline interaction. */
export function useBreakoutEligible(interactive: boolean): boolean {
  const scale = useContext(StageScaleContext);
  const allowed = useContext(BreakoutAllowedContext);
  const coarse = useCoarsePointer();
  return breakoutEligible({ allowed, coarse, scale, interactive });
}

/** A pulsing brand-accent ring + "tap to interact" pill around a (non-interactive)
 *  plugin preview. Tapping anywhere opens the full-size breakout. */
export function GlowTap({ label, onOpen, children }: { label: string; onOpen: () => void; children: ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${label} — tap to interact`}
      data-pi-no-nav
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{ position: "relative", cursor: "pointer", borderRadius: "1.1rem", display: "inline-block", maxWidth: "100%" }}
    >
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          inset: "-3px",
          borderRadius: "1.2rem",
          border: "1px solid var(--brand-accent, #e0c580)",
          boxShadow: "0 0 26px -4px var(--brand-accent, #e0c580)",
          pointerEvents: "none",
        }}
        animate={{ opacity: [0.45, 1, 0.45] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <div style={{ pointerEvents: "none" }}>{children}</div>
      <span
        style={{
          position: "absolute",
          bottom: "-0.7rem",
          left: "50%",
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
          padding: "0.25rem 0.7rem",
          borderRadius: "999px",
          background: "var(--brand-accent, #e0c580)",
          color: "var(--brand-on-primary, #10140e)",
          fontFamily: "var(--brand-font-mono, monospace)",
          fontSize: "0.7rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 600,
          pointerEvents: "none",
        }}
      >
        tap to interact ↗
      </span>
    </div>
  );
}

/** True on a short viewport (landscape phone / small window) — switch the breakout
 *  from a full-width bottom sheet to a centered, height-capped card so its content
 *  doesn't overflow off the bottom. */
function useShortViewport(): boolean {
  const [short, setShort] = useState(false);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia("(max-height: 600px)");
    const update = () => setShort(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return short;
}

/** Track the **visual viewport** — the region NOT covered by the on-screen keyboard.
 *  On mobile the keyboard overlays the layout viewport (`100vh`/`inset:0` don't shrink),
 *  so a bottom-anchored sheet ends up behind it. Pinning to `visualViewport` keeps the
 *  sheet in the visible area. Returns null when unsupported (desktop / SSR) → caller
 *  falls back to full-viewport. */
function useVisualViewport(): { height: number; offsetTop: number } | null {
  const [vp, setVp] = useState<{ height: number; offsetTop: number } | null>(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : undefined;
    if (!vv) return;
    const update = () => setVp({ height: vv.height, offsetTop: vv.offsetTop });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return vp;
}

/** A full-size breakout portaled OUTSIDE the scaled stage, so the plugin's real
 *  controls render at device scale with proper tap targets. Same Yjs state. A
 *  bottom sheet on tall viewports; a centered, scrollable card on short/landscape
 *  ones so the content never runs off-screen. */
export function BreakoutSheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const short = useShortViewport();
  const vp = useVisualViewport();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        // pin to the visual viewport so the on-screen keyboard can't bury the sheet
        // (it overlays the layout viewport; `inset:0` would sit behind it). (internal ADR).
        position: "fixed",
        left: 0,
        right: 0,
        top: vp ? vp.offsetTop : 0,
        height: vp ? vp.height : "100%",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        justifyContent: short ? "center" : "flex-end",
        alignItems: "center",
        padding: short ? "max(env(safe-area-inset-top), 0.75rem) 0.75rem" : 0,
        background: "color-mix(in srgb, var(--brand-bg, #10140e) 60%, transparent)",
        backdropFilter: "blur(6px)",
      }}
    >
      <motion.div
        data-pi-breakout
        onClick={(e) => e.stopPropagation()}
        initial={{ y: short ? 24 : "100%", opacity: short ? 0 : 1 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: short ? 24 : "100%", opacity: short ? 0 : 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 36 }}
        style={{
          width: "100%",
          maxWidth: short ? "560px" : "720px",
          marginInline: "auto",
          maxHeight: short ? "100%" : "min(88vh, 100%)",
          overflow: "auto",
          padding: short
            ? "0 1.1rem 1.1rem"
            : "0 1.25rem calc(1.5rem + env(safe-area-inset-bottom))",
          borderRadius: short ? "1.2rem" : "1.4rem 1.4rem 0 0",
          background: "var(--brand-surface, #1a2014)",
          border: short
            ? "1px solid var(--brand-border, color-mix(in srgb, var(--brand-text, #e9e6d7) 14%, transparent))"
            : "none",
          borderTop: "1px solid var(--brand-border, color-mix(in srgb, var(--brand-text, #e9e6d7) 14%, transparent))",
          boxShadow: "0 -24px 60px -20px rgba(0,0,0,0.7)",
        }}
      >
        {/* sticky header so the close button stays reachable while the body scrolls */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1.1rem 0 0.9rem",
            marginBottom: "0.4rem",
            background: "var(--brand-surface, #1a2014)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--brand-font-mono, monospace)",
              fontSize: "0.7rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--brand-muted, #9da28c)",
            }}
          >
            {label}
          </span>
          <button
            onClick={onClose}
            aria-label="close"
            style={{
              appearance: "none",
              cursor: "pointer",
              border: "none",
              background: "transparent",
              color: "var(--brand-muted, #9da28c)",
              fontSize: "1.2rem",
              lineHeight: 1,
              padding: "0.25rem 0.5rem",
            }}
          >
            ✕
          </button>
        </div>
        {/* shrink the plugin's content a touch on short viewports so it fits with
            less scrolling (zoom reflows, unlike transform) */}
        <div style={short ? ({ zoom: 0.85 } as CSSProperties) : undefined}>{children}</div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
