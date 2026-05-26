import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { StageScaleContext } from "../Stage";
import { breakoutEligible } from "../mobile";

/** Set false to suppress the touch breakout for plugins in a subtree (e.g. the
 *  presenter's non-interactive slide preview). */
export const BreakoutAllowedContext = createContext(true);

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return coarse;
}

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
          border: "1px solid var(--brand-accent, #62e8ff)",
          boxShadow: "0 0 26px -4px var(--brand-accent, #62e8ff)",
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
          background: "var(--brand-accent, #62e8ff)",
          color: "var(--brand-on-primary, #08090c)",
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

/** A full-size bottom sheet portaled OUTSIDE the scaled stage, so the plugin's real
 *  controls render at device scale with proper tap targets. Same Yjs state. */
export function BreakoutSheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
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
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        background: "color-mix(in srgb, var(--brand-bg, #08090c) 60%, transparent)",
        backdropFilter: "blur(6px)",
      }}
    >
      <motion.div
        data-pi-breakout
        onClick={(e) => e.stopPropagation()}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 36 }}
        style={{
          maxHeight: "88vh",
          overflow: "auto",
          padding: "1.5rem 1.25rem calc(1.5rem + env(safe-area-inset-bottom))",
          borderTopLeftRadius: "1.4rem",
          borderTopRightRadius: "1.4rem",
          background: "var(--brand-surface, #11141b)",
          borderTop: "1px solid var(--brand-border, color-mix(in srgb, var(--brand-text, #fff) 14%, transparent))",
          boxShadow: "0 -24px 60px -20px rgba(0,0,0,0.7)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <span
            style={{
              fontFamily: "var(--brand-font-mono, monospace)",
              fontSize: "0.7rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--brand-muted, #8b93a7)",
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
              color: "var(--brand-muted, #8b93a7)",
              fontSize: "1.2rem",
              lineHeight: 1,
              padding: "0.25rem 0.5rem",
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>,
    document.body,
  );
}
