import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence } from "motion/react";
import { PluginControls } from "./live/globalChrome";
import { BreakoutSheet } from "./live/breakout";
import { useCoarsePointer } from "./useCoarsePointer";
import { toggleFullscreen } from "./delivery";

function useIsFullscreen(): boolean {
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const h = () => setFs(typeof document !== "undefined" && !!document.fullscreenElement);
    h();
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);
  return fs;
}

const ICON = {
  more: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
    </svg>
  ),
  enterFs: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
    </svg>
  ),
  exitFs: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4v3a2 2 0 0 1-2 2H4M15 4v3a2 2 0 0 0 2 2h3M9 20v-3a2 2 0 0 0-2-2H4M15 20v-3a2 2 0 0 1 2-2h3" />
    </svg>
  ),
  grid: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  share: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      <path d="M14 3h7v7M3 14h4v4M10 14h0M14 10h0" />
    </svg>
  ),
  theme: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a9 9 0 1 0 0 18 2.5 2.5 0 0 0 0-5h-1a2 2 0 0 1 0-4h3a4 4 0 0 0 4-4 5 5 0 0 0-9-3Z" />
    </svg>
  ),
} as const;

interface MenuAction {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

function MenuRow({ action, onDone }: { action: MenuAction; onDone: () => void }) {
  return (
    <button
      onClick={() => {
        action.onClick();
        onDone();
      }}
      style={{
        appearance: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "0.9rem",
        width: "100%",
        padding: "0.95rem 0.5rem",
        border: "none",
        borderTop: "1px solid color-mix(in srgb, var(--brand-text, #e9e6d7) 8%, transparent)",
        background: "transparent",
        color: "var(--brand-text, #e9e6d7)",
        fontFamily: "var(--brand-font-body, sans-serif)",
        fontSize: "1.05rem",
        textAlign: "left",
      }}
    >
      <span style={{ color: "var(--brand-muted, #9da28c)", display: "flex" }}>{action.icon}</span>
      {action.label}
    </button>
  );
}

/** Touch action menu: a `⋮` button opening a sheet of tappable deck actions. */
function DeckMenu({ actions }: { actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Menu"
        className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted/70 transition hover:border-text hover:text-text"
      >
        {ICON.more}
      </button>
      <AnimatePresence>
        {open && (
          <BreakoutSheet label="Menu" onClose={() => setOpen(false)}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {actions.map((a) => (
                <MenuRow key={a.key} action={a} onDone={() => setOpen(false)} />
              ))}
            </div>
          </BreakoutSheet>
        )}
      </AnimatePresence>
    </>
  );
}

/** Deck chrome rendered at DEVICE scale, pinned to the real viewport — outside the
 *  scaled 1280×720 canvas — so the buttons stay tappable on a phone. Carries the
 *  progress bar, the slide counter, the help/menu affordance, and any plugin-
 *  registered global controls (ADR 0021). On a coarse pointer the rail is upsized
 *  and the keyboard-shortcut help is swapped for a tappable `⋮` action menu. */
export function DeckChrome({
  index,
  count,
  isLive,
  role,
  canDrive,
  viewerUrl,
  onHelp,
  onOverview,
  onQr,
}: {
  index: number;
  count: number;
  isLive: boolean;
  role: string | undefined;
  canDrive: boolean;
  viewerUrl: string | undefined;
  onHelp: () => void;
  onOverview: () => void;
  onQr: () => void;
}) {
  const coarse = useCoarsePointer();
  const fs = useIsFullscreen();
  const inset = "max(env(safe-area-inset-left), 1rem)";

  // Note: no "Cycle theme" here — brand cycling stays the desktop `t` shortcut
  // (a niche preview/showcase affordance), not a touch action.
  const actions: MenuAction[] = [
    {
      key: "fullscreen",
      label: fs ? "Exit fullscreen" : "Fullscreen",
      icon: fs ? ICON.exitFs : ICON.enterFs,
      onClick: () => void toggleFullscreen(document.documentElement),
    },
    ...(canDrive ? [{ key: "overview", label: "Overview", icon: ICON.grid, onClick: onOverview }] : []),
    ...(isLive && viewerUrl ? [{ key: "share", label: "Share / QR", icon: ICON.share, onClick: onQr }] : []),
  ];

  return (
    <>
      {/* progress + counter pinned to the viewport bottom */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-[3px] bg-border/40">
        <div
          className="h-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${((index + 1) / count) * 100}%` }}
        />
      </div>
      <div
        className="pointer-events-none absolute z-30 font-mono text-sm tracking-wide text-muted"
        style={{ bottom: "calc(0.9rem + env(safe-area-inset-bottom))", right: "max(env(safe-area-inset-right), 1.25rem)" }}
      >
        {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
      </div>

      {/* chrome rail: help (desktop) or ⋮ menu (touch) + plugin global controls */}
      <div
        className="absolute z-30 flex items-center gap-2"
        style={{
          bottom: "calc(0.75rem + env(safe-area-inset-bottom))",
          left: inset,
          transform: coarse ? "scale(1.6)" : "none",
          transformOrigin: "bottom left",
        }}
      >
        {coarse ? (
          <DeckMenu actions={actions} />
        ) : (
          <button
            onClick={onHelp}
            title={isLive ? `${role} · shortcuts (? or right-click)` : "Shortcuts (? or right-click)"}
            className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${
              isLive
                ? "border-accent/50 text-accent opacity-80 hover:opacity-100"
                : "border-border text-muted/50 opacity-60 hover:border-text hover:text-text hover:opacity-100"
            }`}
          >
            {!isLive ? (
              <span className="font-mono text-xs">?</span>
            ) : role === "viewer" ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="13" rx="1.5" />
                <path d="M12 17v3M8.5 20h7" />
              </svg>
            )}
          </button>
        )}
        <PluginControls />
      </div>
    </>
  );
}
