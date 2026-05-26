import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

/** A brief, dismissable "rotate for a bigger view" toast shown on a portrait phone
 *  (coarse pointer). Portaled to <body> so it renders at device scale, not inside
 *  the scaled canvas. Auto-hides; tap to dismiss. */
export function PortraitHint() {
  const [portrait, setPortrait] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const coarse = matchMedia("(pointer: coarse)");
    const orient = matchMedia("(orientation: portrait)");
    const update = () => setPortrait(coarse.matches && orient.matches);
    update();
    coarse.addEventListener?.("change", update);
    orient.addEventListener?.("change", update);
    return () => {
      coarse.removeEventListener?.("change", update);
      orient.removeEventListener?.("change", update);
    };
  }, []);

  useEffect(() => {
    if (!portrait) return;
    const t = setTimeout(() => setDismissed(true), 6000);
    return () => clearTimeout(t);
  }, [portrait]);

  if (typeof document === "undefined") return null;
  const show = portrait && !dismissed;

  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.button
          onClick={() => setDismissed(true)}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          style={{
            position: "fixed",
            left: "50%",
            bottom: "calc(1.25rem + env(safe-area-inset-bottom))",
            transform: "translateX(-50%)",
            zIndex: 9998,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.55rem 0.95rem",
            borderRadius: "999px",
            border: "1px solid var(--brand-border, color-mix(in srgb, var(--brand-text, #e9e6d7) 14%, transparent))",
            background: "color-mix(in srgb, var(--brand-surface, #1a2014) 88%, transparent)",
            color: "var(--brand-muted, #9da28c)",
            fontFamily: "var(--brand-font-mono, monospace)",
            fontSize: "0.72rem",
            letterSpacing: "0.04em",
            backdropFilter: "blur(8px)",
            cursor: "pointer",
          }}
        >
          <span aria-hidden style={{ fontSize: "0.9rem" }}>⤾</span>
          Rotate for a bigger view
        </motion.button>
      )}
    </AnimatePresence>,
    document.body,
  );
}
