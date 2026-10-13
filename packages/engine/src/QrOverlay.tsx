import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useDialogFocus } from "./focus";
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

/** `sub` is printed under the QR in mono (the link itself); `note` is a line of plain
 *  text instead, for a QR whose link must not be readable off the screen. */
export type QrItem = { url?: string; label: string; sub?: string; note?: string };

/** A labelled QR + the URL (or a note) underneath. Renders nothing without a url. */
function QrCard({
  url,
  label,
  sub,
  note,
  enabled,
  size,
}: {
  url?: string;
  label: string;
  sub?: string;
  note?: string;
  enabled: boolean;
  size: number;
}) {
  const src = useQrDataUrl(url, enabled);
  const reduceMotion = useReducedMotion();
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
          initial={reduceMotion ? false : { scale: 0.92 }}
          animate={{ scale: 1 }}
          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 220, damping: 20 }}
        />
      )}
      {sub && <div className="max-w-[18rem] break-all text-center font-mono text-[11px] text-muted">{sub}</div>}
      {note && <div className="max-w-[18rem] text-center text-sm text-muted">{note}</div>}
    </div>
  );
}

/** The one QR-share surface: a full-screen, blurred, dismissable overlay (Esc /
 *  backdrop tap / ✕) showing one or more labelled QRs. A single QR renders big
 *  (the audience "scan to follow along"); several render as a row (presenter share).
 *  `QrOverlay` and `PresenterShare` are thin wrappers so behaviour can't drift. */
export function QrShare({
  open,
  items,
  title,
  footer,
  onClose,
}: {
  open: boolean;
  items: QrItem[];
  title?: string;
  /** extra controls under the QRs; clicks there do not close the overlay */
  footer?: ReactNode;
  onClose: () => void;
}) {
  useEscToClose(open, onClose);
  const visible = items.filter((i) => i.url);
  const big = visible.length <= 1;
  const box = useRef<HTMLDivElement>(null);
  useDialogFocus(open && visible.length > 0, box);
  return (
    <AnimatePresence>
      {open && visible.length > 0 && (
        <motion.div
          ref={box}
          data-pi-chrome
          role="dialog"
          aria-modal="true"
          aria-label={title ?? visible[0]?.label ?? "QR code"}
          tabIndex={-1}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-10 overflow-y-auto p-6 outline-none backdrop-blur-2xl"
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
              <QrCard key={it.label} url={it.url} label={it.label} sub={it.sub} note={it.note} enabled={open} size={big ? 300 : 240} />
            ))}
          </div>
          {footer && (
            <div className="flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {footer}
            </div>
          )}
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

/** What the presenter share screen shows: the audience link always, the presenter link
 *  (which controls the talk) only once revealed. Pure, so the "nothing that grants
 *  control until asked" rule is testable without a DOM. */
export function presenterShareItems(viewerUrl: string | undefined, presenterUrl: string | undefined, revealed: boolean): QrItem[] {
  const items: QrItem[] = [{ url: viewerUrl, label: "Follow along", sub: viewerUrl }];
  // No link text under this QR: it is a grant, and a QR is harder to copy off a screen.
  if (revealed && presenterUrl) items.push({ url: presenterUrl, label: "Drive from your phone", note: "Anyone who scans this can control the talk." });
  return items;
}

/** Presenter: the audience "Follow along" link, and behind an explicit button the
 *  "Drive from your phone" link (presenter; scanning joins as a second driver). The
 *  presenter link is never on screen until asked for, and hides again when the overlay
 *  closes, so opening the share screen on a projected or shared screen gives nobody
 *  control. Q / header button in the presenter view. (DESIGN §QR & handoff.) */
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
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!open) setRevealed(false);
  }, [open]);
  const button =
    "min-h-11 rounded-full border border-border px-5 text-sm text-text transition hover:border-accent hover:text-accent active:text-accent";
  const footer = presenterUrl ? (
    revealed ? (
      <button type="button" className={button} onClick={() => setRevealed(false)}>
        Hide the presenter code
      </button>
    ) : (
      <>
        <button type="button" className={button} onClick={() => setRevealed(true)}>
          Drive from your phone
        </button>
        <div className="max-w-[22rem] text-center text-xs text-muted">
          Shows a code that controls this talk. Make sure this screen is not projected or shared.
        </div>
      </>
    )
  ) : null;
  return (
    <QrShare
      open={open}
      onClose={onClose}
      title="share this session"
      items={presenterShareItems(viewerUrl, presenterUrl, revealed)}
      footer={footer}
    />
  );
}
