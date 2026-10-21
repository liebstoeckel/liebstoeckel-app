import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence } from "motion/react";
import { usePluginChrome } from "./live/globalChrome";
import { BreakoutSheet } from "./live/breakout";
import { useCoarsePointer } from "./useCoarsePointer";
import { toggleFullscreen } from "./delivery";
import { msgs } from "./live/messages";
import { legalItems, type LegalLinks } from "./live/legal";

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
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
    </svg>
  ),
  enterFs: (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
    </svg>
  ),
  exitFs: (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4v3a2 2 0 0 1-2 2H4M15 4v3a2 2 0 0 0 2 2h3M9 20v-3a2 2 0 0 0-2-2H4M15 20v-3a2 2 0 0 1 2-2h3" />
    </svg>
  ),
  grid: (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  share: (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      <path d="M14 3h7v7M3 14h4v4M10 14h0M14 10h0" />
    </svg>
  ),
  theme: (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a9 9 0 1 0 0 18 2.5 2.5 0 0 0 0-5h-1a2 2 0 0 1 0-4h3a4 4 0 0 0 4-4 5 5 0 0 0-9-3Z" />
    </svg>
  ),
  notes: (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="14" rx="1.5" />
      <path d="M7 9h10M7 13h6" />
    </svg>
  ),
  external: (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  ),
} as const;

interface MenuAction {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

/** A menu row that leads off the deck: a link opening a new tab. */
export interface MenuLink {
  key: string;
  label: string;
  href: string;
}

const rowStyle = {
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
  textDecoration: "none",
} as const;

function MenuRow({ action, onDone }: { action: MenuAction; onDone: () => void }) {
  return (
    <button
      onClick={() => {
        action.onClick();
        onDone();
      }}
      style={rowStyle}
    >
      <span aria-hidden style={{ color: "var(--brand-muted, #9da28c)", display: "flex" }}>{action.icon}</span>
      {action.label}
    </button>
  );
}

/** The menu's last rows: links that open a new tab (the legal links), set apart from
 *  the deck's actions by a heading and marked as leading elsewhere. */
export function MenuLinks({ heading, links, newTab }: { heading: string; links: MenuLink[]; newTab: string }) {
  if (links.length === 0) return null;
  return (
    <nav aria-label={heading} data-pi-legal style={{ display: "flex", flexDirection: "column", marginTop: "0.6rem" }}>
      <div
        style={{
          padding: "0.9rem 0.5rem 0.35rem",
          borderTop: "1px solid color-mix(in srgb, var(--brand-text, #e9e6d7) 16%, transparent)",
          color: "var(--brand-muted, #9da28c)",
          fontFamily: "var(--brand-font-mono, monospace)",
          fontSize: "0.72rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        {heading}
      </div>
      {links.map((l) => (
        <a key={l.key} href={l.href} target="_blank" rel="noopener noreferrer" style={{ ...rowStyle, justifyContent: "space-between", fontSize: "1rem" }}>
          {l.label}
          <span style={{ color: "var(--brand-muted, #9da28c)", display: "flex" }}>
            {ICON.external}
            <span className="sr-only">{newTab}</span>
          </span>
        </a>
      ))}
    </nav>
  );
}

/** Touch action menu: a `⋮` button opening a sheet of tappable deck actions, with any
 *  links (the host's legal links) as its last rows. */
function DeckMenu({ actions, links }: { actions: MenuAction[]; links: MenuLink[] }) {
  const [open, setOpen] = useState(false);
  const m = msgs();
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={m.menu}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted/70 transition hover:border-text hover:text-text"
      >
        {ICON.more}
      </button>
      <AnimatePresence>
        {open && (
          <BreakoutSheet label={m.menu} onClose={() => setOpen(false)}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {actions.map((a) => (
                <MenuRow key={a.key} action={a} onDone={() => setOpen(false)} />
              ))}
              <MenuLinks heading={m.legal} links={links} newTab={m.opensInNewTab} />
            </div>
          </BreakoutSheet>
        )}
      </AnimatePresence>
    </>
  );
}

/** The legal links a deck page offers in its menu: for the audience, never in the
 *  presenter's deck window (the room sees it; the presenter view has them instead). */
export function legalMenuLinks(legal: LegalLinks | null | undefined, role: string | undefined, m = msgs()): MenuLink[] {
  if (!legal || role === "presenter") return [];
  return legalItems(legal, m);
}

/** Deck chrome rendered at DEVICE scale, pinned to the real viewport, outside the
 *  scaled 1280×720 canvas, so the buttons stay tappable on a phone. Carries the
 *  progress bar, the slide counter, the help/menu affordance, and any plugin-
 *  registered global controls. On a coarse pointer the rail is upsized
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
  legal,
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
  /** the host's legal links, from the live bootstrap */
  legal?: LegalLinks | null;
}) {
  const coarse = useCoarsePointer();
  const m = msgs();
  const links = legalMenuLinks(legal, role, m);
  const fs = useIsFullscreen();
  const inset = "max(env(safe-area-inset-left), 1rem)";
  // plugin global controls: pinned ones sit in the rail; the rest overflow into the ⋮
  // menu on touch so the rail can't run off-screen. Panels are hosted here.
  const { rail: pluginRail, menuActions: pluginMenu, panels: pluginPanels } = usePluginChrome();

  // Switch this window to the presenter view, the touch counterpart to
  // the desktop `P` pop-out. `Present` selects the view by the #presenter hash at
  // mount, so set the hash and reload.
  const openPresenterView = () => {
    if (typeof location === "undefined") return;
    location.hash = "presenter";
    location.reload();
  };

  // Note: no "Cycle theme" here, brand cycling stays the desktop `t` shortcut
  // (a niche preview/showcase affordance), not a touch action.
  const actions: MenuAction[] = [
    {
      key: "fullscreen",
      label: fs ? m.exitFullscreen : m.fullscreen,
      icon: fs ? ICON.exitFs : ICON.enterFs,
      onClick: () => void toggleFullscreen(document.documentElement),
    },
    ...(canDrive ? [{ key: "overview", label: m.overview, icon: ICON.grid, onClick: onOverview }] : []),
    // Presenter view (notes-first confidence monitor), drivers only, never viewers.
    ...(canDrive ? [{ key: "presenter", label: m.presenterView, icon: ICON.notes, onClick: openPresenterView }] : []),
    ...(isLive && viewerUrl ? [{ key: "share", label: m.shareQr, icon: ICON.share, onClick: onQr }] : []),
    ...pluginMenu, // overflowed (unpinned) plugin controls, touch only
  ];

  return (
    <>
      {/* progress + counter pinned to the viewport bottom. Both are visual only; the
          polite live region below announces the position to screen readers once
          per slide change instead of reading "01 / 04" as numbers. */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Slide {index + 1} of {count}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-[3px] bg-border/40">
        <div
          className="h-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${((index + 1) / count) * 100}%` }}
        />
      </div>
      <div
        aria-hidden
        data-testid="slide-counter"
        className="pointer-events-none absolute z-30 font-mono text-sm tracking-wide text-muted"
        style={{ bottom: "calc(0.9rem + env(safe-area-inset-bottom))", right: "max(env(safe-area-inset-right), 1.25rem)" }}
      >
        {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
      </div>

      {/* chrome rail: help (desktop) or ⋮ menu (touch) + plugin global controls */}
      <div
        data-pi-chrome
        className="absolute z-30 flex items-center gap-2"
        style={{
          bottom: "calc(0.75rem + env(safe-area-inset-bottom))",
          left: inset,
          transform: coarse ? "scale(1.6)" : "none",
          transformOrigin: "bottom left",
        }}
      >
        {coarse ? (
          <DeckMenu actions={actions} links={links} />
        ) : (
          <button
            onClick={onHelp}
            aria-label={links.length ? m.infoAndShortcuts : isLive ? `Keyboard shortcuts (${role})` : "Keyboard shortcuts"}
            aria-haspopup="dialog"
            title={links.length ? `${m.infoAndShortcuts} (?)` : isLive ? `${role} · shortcuts (? or right-click)` : "Shortcuts (? or right-click)"}
            className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${
              isLive
                ? "border-accent/50 text-accent opacity-80 hover:opacity-100"
                : "border-border text-muted/50 opacity-60 hover:border-text hover:text-text hover:opacity-100"
            }`}
          >
            {!isLive ? (
              <span className="font-mono text-xs">?</span>
            ) : role === "viewer" ? (
              <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="13" rx="1.5" />
                <path d="M12 17v3M8.5 20h7" />
              </svg>
            )}
          </button>
        )}
        {pluginRail}
      </div>
      {pluginPanels}
    </>
  );
}
