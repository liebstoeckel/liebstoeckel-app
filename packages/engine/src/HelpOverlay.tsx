import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";

type Shortcut = { keys: string[]; label: string };

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-[1.9rem] items-center justify-center rounded-md border border-border bg-bg px-2 py-1 font-mono text-sm text-text shadow-sm">
      {children}
    </kbd>
  );
}

export function HelpOverlay({
  open,
  onClose,
  showBrand,
}: {
  open: boolean;
  onClose: () => void;
  showBrand?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const shortcuts: Shortcut[] = [
    { keys: ["→", "Space"], label: "Next / reveal step" },
    { keys: ["←"], label: "Previous / hide step" },
    { keys: ["Home", "End"], label: "First / last slide" },
    { keys: ["0-9", "↵"], label: "Jump to slide" },
    { keys: ["O"], label: "Overview grid" },
    { keys: ["F"], label: "Fullscreen" },
    { keys: ["B"], label: "Blur screen" },
    { keys: ["Q"], label: "Show join QR" },
    { keys: ["P"], label: "Open presenter view" },
    ...(showBrand ? [{ keys: ["T"], label: "Switch brand" }] : []),
    { keys: ["?"], label: "Toggle this help" },
    { keys: ["Esc"], label: "Close" },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div
            className="absolute inset-0 bg-bg/70 backdrop-blur-md"
            onClick={onClose}
            onContextMenu={(e) => {
              e.preventDefault();
              onClose();
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="relative w-[440px] rounded-2xl border border-border bg-surface/90 p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]"
          >
            <div className="mb-5 flex items-baseline justify-between">
              <span className="font-heading text-2xl font-semibold text-text">Shortcuts</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted">keyboard</span>
            </div>
            <ul className="space-y-3">
              {shortcuts.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-4">
                  <span className="font-body text-lg text-text/85">{s.label}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {s.keys.map((k, i) => (
                      <span key={k} className="flex items-center gap-1.5">
                        {i > 0 && <span className="font-mono text-xs text-muted">/</span>}
                        <Kbd>{k}</Kbd>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 border-t border-border pt-4 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-muted">
              right-click anywhere to toggle
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
