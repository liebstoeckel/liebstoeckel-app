import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Role } from "@liebstoeckel/plugin-sdk";

type Shortcut = { keys: string[]; label: string; presenterOnly?: boolean };

/** Guide for recovering + editing a built deck (linked from the eject footer). */
const EDIT_DOCS_URL = "https://docs.liebstoeckel.app/guides/editing-a-built-deck/";

function Kbd({ children, dim }: { children: string; dim?: boolean }) {
  return (
    <kbd
      className={`inline-flex min-w-[1.9rem] items-center justify-center rounded-md border px-2 py-1 font-mono text-sm shadow-sm ${
        dim ? "border-border/50 bg-bg/40 text-muted" : "border-border bg-bg text-text"
      }`}
    >
      {children}
    </kbd>
  );
}

export function HelpOverlay({
  open,
  onClose,
  showBrand,
  role,
  ejectable,
}: {
  open: boolean;
  onClose: () => void;
  showBrand?: boolean;
  /** live role; undefined = standalone (everything enabled) */
  role?: Role;
  /** this `.html` carries its own recoverable source → show the "edit this deck" hint */
  ejectable?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isViewer = role === "viewer";

  const shortcuts: Shortcut[] = [
    { keys: ["→", "Space"], label: "Next / reveal step", presenterOnly: true },
    { keys: ["←"], label: "Previous / hide step", presenterOnly: true },
    { keys: ["Home", "End"], label: "First / last slide", presenterOnly: true },
    { keys: ["0-9", "↵"], label: "Jump to slide", presenterOnly: true },
    { keys: ["O"], label: "Overview grid", presenterOnly: true },
    { keys: ["F"], label: "Fullscreen" },
    { keys: ["B"], label: "Blur screen" },
    { keys: ["Q"], label: "Show join QR" },
    { keys: ["P"], label: "Open presenter view", presenterOnly: true },
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
              {role ? (
                <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent">
                  ● live · {role}
                </span>
              ) : (
                <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted">keyboard</span>
              )}
            </div>
            {isViewer && (
              <p className="mb-4 font-body text-sm text-muted">
                You're following as a <span className="text-text">viewer</span>, the presenter drives
                navigation. You can still interact (e.g. vote).
              </p>
            )}
            <ul className="space-y-3">
              {shortcuts.map((s) => {
                const disabled = isViewer && s.presenterOnly;
                return (
                  <li
                    key={s.label}
                    className={`flex items-center justify-between gap-4 ${disabled ? "opacity-40" : ""}`}
                    title={disabled ? "Presenter only" : undefined}
                  >
                    <span className="font-body text-lg text-text/85">
                      {s.label}
                      {disabled && <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-muted">presenter</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {s.keys.map((k, i) => (
                        <span key={k} className="flex items-center gap-1.5">
                          {i > 0 && <span className="font-mono text-xs text-muted">/</span>}
                          <Kbd dim={disabled}>{k}</Kbd>
                        </span>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
            {ejectable && (
              <div className="mt-6 border-t border-border pt-4">
                <p className="font-body text-sm text-text/80">
                  This deck embeds its own source, recover it with{" "}
                  <code className="rounded bg-bg/60 px-1.5 py-0.5 font-mono text-[13px] text-text">
                    liebstoeckel eject
                  </code>{" "}
                  to edit it by hand or with an agent.{" "}
                  <a
                    href={EDIT_DOCS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                  >
                    Learn how →
                  </a>
                </p>
              </div>
            )}
            <div className="mt-6 border-t border-border pt-4 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-muted">
              right-click anywhere to toggle
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
