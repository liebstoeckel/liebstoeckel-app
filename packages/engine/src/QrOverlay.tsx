import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import QRCode from "qrcode";

/** Full-screen QR of the read-only follow-along link, over a blurred slide.
 *  Toggled with the Q key in a live session. */
export function QrOverlay({ open, url, onClose }: { open: boolean; url?: string; onClose: () => void }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (open && url) {
      QRCode.toDataURL(url, { margin: 1, width: 420, color: { dark: "#0b0c10", light: "#ffffff" } })
        .then(setSrc)
        .catch(() => setSrc(""));
    }
  }, [open, url]);

  return (
    <AnimatePresence>
      {open && url && (
        <motion.div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-2xl"
          style={{ background: "color-mix(in srgb, var(--brand-bg) 72%, transparent)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="mb-7 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
            <span className="h-px w-8 bg-accent" />
            scan to follow along
          </div>
          {src && (
            <motion.img
              src={src}
              alt="follow-along QR"
              width={300}
              height={300}
              className="rounded-3xl border border-border shadow-2xl"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 20 }}
            />
          )}
          <div className="mt-7 font-mono text-sm text-muted">{url}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
