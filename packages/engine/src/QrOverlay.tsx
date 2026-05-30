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

/** Close on Escape while `open`. */
function useEscToClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

export type QrItem = { url?: string; label: string; sub?: string };

/** A labelled QR + the URL underneath. Renders nothing without a url. */
function QrCard({ url, label, sub, enabled, size }: { url?: string; label: string; sub?: string; enabled: boolean; size: number }) {
  const src = useQrDataUrl(url, enabled);
  if (!url) return null;
  return (
    <div className="flex flex-col items-center gap-4">
      {label && <div className="font-mono text-xs uppercase tracking-[0.3em] text-accent">{label}</div>}
      {src && (
        <motion.img
          src={src}
          alt={label || "QR code"}
          width={size}
          height={size}
          className="rounded-2xl border border-border shadow-2xl"
          initial={{ scale: 0.92 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 20 }}
        />
      )}
      {sub && <div className="max-w-[18rem] break-all text-center font-mono text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

/** The one QR-share surface: a full-screen, blurred, dismissable overlay (Esc /
 *  backdrop tap / ✕) showing one or more labelled QRs. A single QR renders big
 *  (the audience "scan to follow along"); several render as a row (presenter share).
 *  `QrOverlay` and `PresenterShare` are thin wrappers so behaviour can't drift. */
export function QrShare({ open, items, title, onClose }: { open: boolean; items: QrItem[]; title?: string; onClose: () => void }) {
  useEscToClose(open, onClose);
  const visible = items.filter((i) => i.url);
  const big = visible.length <= 1;
  return (
    <AnimatePresence>
      {open && visible.length > 0 && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-10 overflow-y-auto p-6 backdrop-blur-2xl"
          style={{ background: "color-mix(in srgb, var(--brand-bg) 80%, transparent)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <button
            onClick={onClose}
            aria-label="Close"
            className="fixed right-4 flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted transition hover:border-text hover:text-text"
            style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
          >
            ✕
          </button>
          {title && (
            <div className="flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
              <span className="h-px w-8 bg-accent" />
              {title}
              <span className="h-px w-8 bg-accent" />
            </div>
          )}
          <div className="flex flex-wrap items-start justify-center gap-14" onClick={(e) => e.stopPropagation()}>
            {visible.map((it) => (
              <QrCard key={it.label} url={it.url} label={it.label} sub={it.sub} enabled={open} size={big ? 300 : 240} />
            ))}
          </div>
          <div className="font-mono text-xs text-muted">tap outside, ✕, or press Q / Esc to close</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Audience: a single big "follow along" QR (the read-only link). Toggled with Q in
 *  the Deck during a live session. */
export function QrOverlay({ open, url, onClose }: { open: boolean; url?: string; onClose: () => void }) {
  return <QrShare open={open} onClose={onClose} items={[{ url, label: "Scan to follow along", sub: url }]} />;
}

/** Presenter: BOTH links — "Follow along" (read-only viewer) and "Drive from your
 *  phone" (presenter; scanning joins as a second driver). Q / header button in the
 *  presenter view. (DESIGN §QR & handoff.) */
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
  return (
    <QrShare
      open={open}
      onClose={onClose}
      title="share this session"
      items={[
        { url: viewerUrl, label: "Follow along", sub: viewerUrl },
        { url: presenterUrl, label: "Drive from your phone", sub: presenterUrl },
      ]}
    />
  );
}
