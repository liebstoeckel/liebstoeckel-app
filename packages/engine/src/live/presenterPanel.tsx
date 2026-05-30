import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { LayoutGroup } from "motion/react";
import type { ClientProps, PluginDef } from "@liebstoeckel/plugin-sdk";
import { useLive, usePluginProps, type LiveContextValue } from "./Plugin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entry = { id: string; def: PluginDef<any> };

/** Registered plugins that expose a presenter console, in registration order. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function presenterPlugins(registry: Record<string, PluginDef<any>>): Entry[] {
  return Object.entries(registry)
    .filter(([, def]) => def.client.presenter)
    .map(([id, def]) => ({ id, def }));
}

type Variant = "desktop" | "mobile";

// Notes container — matches the panels the presenter view used before tabs existed,
// so a deck with no presenter plugins looks byte-for-byte the same (ADR 0031).
const NOTES_CLASS: Record<Variant, string> = {
  desktop:
    "presenter-notes min-h-0 min-w-0 flex-1 overflow-auto rounded-2xl border border-border bg-surface/40 p-6 text-xl leading-relaxed text-text/90",
  mobile: "presenter-notes min-h-0 flex-1 overflow-auto px-5 py-4 text-2xl leading-relaxed text-text/90",
};

function NotesLabel() {
  return <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.3em] text-muted">Speaker notes</div>;
}

/** One tab button. Subscribes to its plugin's state so its `badge` is live even
 *  while another tab is showing. */
function PluginTab({
  ctx,
  entry,
  selected,
  variant,
  onSelect,
}: {
  ctx: LiveContextValue;
  entry: Entry;
  selected: boolean;
  variant: Variant;
  onSelect: () => void;
}) {
  const props = usePluginProps(ctx, entry.id, entry.def);
  const surface = entry.def.client.presenter!;
  const badge = surface.badge?.(props.snapshot);
  const show = badge !== undefined && badge !== 0 && badge !== "";
  return (
    <button onClick={onSelect} className={tabClass(variant, selected)}>
      {surface.icon != null && <span aria-hidden>{surface.icon as ReactNode}</span>}
      <span>{surface.label}</span>
      {show && (
        <span className="rounded-full bg-accent px-1.5 py-px text-[10px] font-semibold text-on-primary tabular-nums">{badge}</span>
      )}
    </button>
  );
}

function tabClass(variant: Variant, selected: boolean): string {
  const base = "flex shrink-0 items-center gap-2 rounded-lg border font-mono uppercase tracking-wider transition";
  const size = variant === "mobile" ? "px-3 py-2 text-[11px]" : "px-3 py-1.5 text-xs";
  const state = selected
    ? "border-primary bg-primary/10 text-primary"
    : variant === "mobile"
      ? "border-border text-muted active:border-text active:text-text"
      : "border-border text-muted hover:border-text hover:text-text";
  return `${base} ${size} ${state}`;
}

/** The selected plugin's console, mounted with live state. */
function Console({ ctx, entry, variant }: { ctx: LiveContextValue; entry: Entry; variant: Variant }) {
  const props = usePluginProps(ctx, entry.id, entry.def);
  const C = entry.def.client.presenter!.Console as ComponentType<ClientProps<unknown>>;
  // Mobile is edge-to-edge, so the bordered console insets itself; desktop sits in
  // the aside column and fills it.
  const box = variant === "mobile" ? "mx-4 mb-3 p-4" : "p-5";
  // Namespace the console's Motion layout tree so a plugin whose UI uses `layoutId`
  // (e.g. Q&A's ranked rows) doesn't share layout identity with the SAME slide
  // rendered live in the presenter's preview Thumb — which sits inside the
  // ScaledStage's `transform`. Without this, Motion would treat the two as one
  // shared element and try to morph one into the other across the scale boundary
  // (the ADR 0026 hazard). Hardening, distinct from the remount fix below.
  return (
    <div className={`min-h-0 min-w-0 flex-1 overflow-auto rounded-2xl border border-border bg-surface/40 ${box}`}>
      <LayoutGroup id={`presenter-console-${entry.id}`}>
        <C {...props} />
      </LayoutGroup>
    </div>
  );
}

/** The maximize ⤢ / restore ⤡ button + the "focused" affordance (ADR 0032). */
function FocusControl({ focused, onToggle }: { focused: boolean; onToggle: () => void }) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
      {focused && <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">focused · Esc</span>}
      <button
        onClick={onToggle}
        aria-label={focused ? "Restore layout" : "Maximize pane"}
        title={focused ? "Restore (Esc)" : "Maximize (z)"}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted transition hover:border-text hover:text-text"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {focused ? (
            <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M16 21v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
          ) : (
            <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          )}
        </svg>
      </button>
    </div>
  );
}

/** The presenter view's dominant content region: a tab strip switching between the
 *  speaker **Notes** (default) and one console per plugin that exposes a presenter
 *  surface (ADR 0031), plus a maximize toggle (ADR 0032). Identical structure on
 *  desktop and mobile (no third column). With no presenter plugins the strip is just
 *  the "Speaker notes" label (+ the maximize toggle when available). */
export function PresenterPanel({
  notes,
  variant,
  focused = false,
  onToggleFocus,
}: {
  notes: ReactNode;
  variant: Variant;
  focused?: boolean;
  onToggleFocus?: () => void;
}) {
  const ctx = useLive();
  const entries = useMemo(() => (ctx?.live ? presenterPlugins(ctx.plugins) : []), [ctx?.live, ctx?.plugins]);
  const [tab, setTab] = useState<string>("notes");
  const sel = entries.find((e) => e.id === tab);
  const showingNotes = tab === "notes" || !sel;
  const stripPad = variant === "mobile" ? "px-4 pt-2 pb-1" : "pb-0.5";

  return (
    <>
      <div className={`flex shrink-0 items-center gap-1.5 overflow-x-auto ${stripPad}`}>
        {entries.length === 0 ? (
          <NotesLabel />
        ) : (
          <>
            <button onClick={() => setTab("notes")} className={tabClass(variant, showingNotes)}>
              Notes
            </button>
            {ctx &&
              entries.map((e) => (
                <PluginTab key={e.id} ctx={ctx} entry={e} variant={variant} selected={!showingNotes && sel?.id === e.id} onSelect={() => setTab(e.id)} />
              ))}
          </>
        )}
        {onToggleFocus && <FocusControl focused={focused} onToggle={onToggleFocus} />}
      </div>
      {/* key by plugin id: switching tabs reuses this slot, but each plugin's state
          has a different shape — without a remount the console would render one frame
          with the PREVIOUS plugin's snapshot (e.g. a poll snapshot reaching the Q&A
          console) and throw. The key forces a fresh mount → correct initial snapshot. */}
      {showingNotes ? <div className={NOTES_CLASS[variant]}>{notes}</div> : ctx && sel && <Console key={sel.id} ctx={ctx} entry={sel} variant={variant} />}
    </>
  );
}
