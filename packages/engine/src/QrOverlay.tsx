import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import QRCode from "qrcode";

/** Generate a QR data-URL for `url` while `enabled` (no work when closed). */
function useQrDataUrl(url: string | undefined, enabled: boolean): string {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (enabled && url) {
      QRCode.toDataURL(url, { margin: 1, width: 420, color: { dark: "#0b0c10", light: "#ffffff" } })
        .then(setSrc)
        .catch(() => setSrc(""));
    }
  }, [enabled, url]);
  return src;
}

/** A labelled QR + the URL underneath. Renders nothing without a url. */
function QrCard({ url, label, sub, enabled, size = 240 }: { url?: string; label: string; sub: string; enabled: boolean; size?: number }) {
  const src = useQrDataUrl(url, enabled);
  if (!url) return null;
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="font-mono text-xs uppercase tracking-[0.3em] text-accent">{label}</div>
      {src && (
        <motion.img
          src={src}
          alt={label}
          width={size}
          height={size}
          className="rounded-2xl border border-border shadow-2xl"
          initial={{ scale: 0.92 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 20 }}
        />
      )}
      <div className="max-w-[18rem] break-all text-center font-mono text-[11px] text-muted">{sub}</div>
    </div>
  );
}

/** Full-screen QR of the read-only follow-along link, over a blurred slide.
 *  Toggled with the Q key in a live session (the audience Deck). */
export function QrOverlay({ open, url, onClose }: { open: boolean; url?: string; onClose: () => void }) {
  const src = useQrDataUrl(url, open);
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

/** Presenter-only share: BOTH links side by side — the read-only viewer link
 *  ("follow along") and the presenter link ("drive from your phone": scanning it
 *  joins as a second driver — the sync layer allows multiple presenters). Toggled
 *  with Q / the header button in the presenter view. (DESIGN §QR & handoff.) */
export function PresenterShare({
  open,
  viewerUrl,
  presenterUrl,
  onClose,
}: {
  open: boolean;
  viewerUrl?: string;
  presenterUrl?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-10 backdrop-blur-2xl"
          style={{ background: "color-mix(in srgb, var(--brand-bg) 80%, transparent)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
            <span className="h-px w-8 bg-accent" />
            share this session
            <span className="h-px w-8 bg-accent" />
          </div>
          <div className="flex flex-wrap items-start justify-center gap-14" onClick={(e) => e.stopPropagation()}>
            <QrCard url={viewerUrl} label="Follow along" sub={viewerUrl ?? ""} enabled={open} />
            <QrCard url={presenterUrl} label="Drive from your phone" sub={presenterUrl ?? ""} enabled={open} />
          </div>
          <div className="font-mono text-xs text-muted">Q or Esc to close</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
