import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { LayoutGroup } from "motion/react";
import { observePluginIndex, readPluginInstances, type ClientProps, type PluginDef } from "@liebstoeckel/plugin-sdk";
import { useLive, usePluginProps, type LiveContextValue } from "./Plugin";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Inst = { type: string; instance: string; title?: string; def: PluginDef<any> };

type Variant = "desktop" | "mobile";

const ikey = (i: Inst) => `${i.type} ${i.instance}`;

/** Live list of placed instances whose type exposes a presenter console, discovered from
 *  the doc index ((internal ADR)) and kept current as `<Plugin>`s mount across the session. */
function usePresenterInstances(ctx: LiveContextValue | null): Inst[] {
  const [list, setList] = useState<Inst[]>([]);
  useEffect(() => {
    if (!ctx?.live) {
      setList([]);
      return;
    }
    const read = () =>
      setList(
        readPluginInstances(ctx.doc)
          .map((e) => ({ type: e.type, instance: e.instance, title: e.title, def: ctx.plugins[e.type]! }))
          .filter((e) => e.def?.client.presenter),
      );
    read();
    return observePluginIndex(ctx.doc, read);
  }, [ctx?.live, ctx?.doc, ctx?.plugins]);
  return list;
}

// Notes container, matches the panel the presenter view used before tabs existed, so a
// deck with no presenter instances looks the same ((internal ADR)).
const NOTES_CLASS: Record<Variant, string> = {
  desktop:
    "presenter-notes min-h-0 min-w-0 flex-1 overflow-auto rounded-2xl border border-border bg-surface/40 p-6 text-xl leading-relaxed text-text/90",
  mobile: "presenter-notes min-h-0 flex-1 overflow-auto px-5 py-4 text-2xl leading-relaxed text-text/90",
};

function NotesLabel() {
  return <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.3em] text-muted">Speaker notes</div>;
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

function Badge({ value }: { value: number | string }) {
  return <span className="rounded-full bg-accent px-1.5 py-px text-[10px] font-semibold text-on-primary tabular-nums">{value}</span>;
}

/** One **per-type** strip tab ((internal ADR)/0035): one "Poll" tab regardless of how many poll
 *  instances exist. Its badge is the instance count when there are several, else the lone
 *  instance's own badge. Subscribes to the first instance for that live badge. */
function TypeTab({ ctx, group, selected, variant, onSelect }: { ctx: LiveContextValue; group: Inst[]; selected: boolean; variant: Variant; onSelect: () => void }) {
  const first = group[0]!;
  const props = usePluginProps(ctx, first.type, first.def, {}, first.instance);
  const surface = first.def.client.presenter!;
  const multi = group.length > 1;
  const badge = multi ? group.length : surface.badge?.(props.snapshot);
  const show = badge !== undefined && badge !== 0 && badge !== "";
  return (
    <button onClick={onSelect} className={tabClass(variant, selected)}>
      {surface.icon != null && <span aria-hidden>{surface.icon as ReactNode}</span>}
      <span>{surface.label}</span>
      {show && <Badge value={badge!} />}
    </button>
  );
}

/** The instance's live label: its title (e.g. the poll question), then placement title,
 *  then the instance id, then the type label as a last resort. */
function instLabel(inst: Inst, snapshot: unknown): string {
  const s = inst.def.client.presenter!;
  return s.title?.(snapshot as never) || inst.title || inst.instance || s.label;
}

/** Dropdown trigger, shows the selected instance's label on one truncated line. */
function InstanceTrigger({ ctx, inst, open, onToggle, variant }: { ctx: LiveContextValue; inst: Inst; open: boolean; onToggle: () => void; variant: Variant }) {
  const props = usePluginProps(ctx, inst.type, inst.def, {}, inst.instance);
  return (
    <button
      onClick={onToggle}
      aria-haspopup="listbox"
      aria-expanded={open}
      className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 ${variant === "mobile" ? "py-2.5 text-base" : "py-2 text-sm"} text-left transition ${
        open ? "border-primary text-text" : "border-border text-text/90 hover:border-text"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{instLabel(inst, props.snapshot)}</span>
      <svg className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

/** One row in the open instance menu, full label (wraps), check when selected, + badge. */
function InstanceMenuItem({ ctx, inst, selected, onPick }: { ctx: LiveContextValue; inst: Inst; selected: boolean; onPick: () => void }) {
  const props = usePluginProps(ctx, inst.type, inst.def, {}, inst.instance);
  const surface = inst.def.client.presenter!;
  const badge = surface.badge?.(props.snapshot);
  const show = badge !== undefined && badge !== 0 && badge !== "";
  return (
    <button
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition hover:bg-primary/10 ${selected ? "text-primary" : "text-text/90"}`}
    >
      <span className="w-3 shrink-0 pt-0.5">{selected ? "✓" : ""}</span>
      <span className="min-w-0 flex-1">{instLabel(inst, props.snapshot)}</span>
      {show && <span className="pt-0.5"><Badge value={badge!} /></span>}
    </button>
  );
}

/** Instance switcher for a multi-instance type ((internal ADR)): a compact dropdown in the
 *  console header. The trigger shows the current instance (truncated); the menu lists
 *  every instance with its full label (wrapping) so long poll questions never overflow. */
function InstanceDropdown({ ctx, group, selectedKey, onPick, variant }: { ctx: LiveContextValue; group: Inst[]; selectedKey: string; onPick: (key: string) => void; variant: Variant }) {
  const [open, setOpen] = useState(false);
  const sel = group.find((i) => ikey(i) === selectedKey) ?? group[0]!;
  return (
    <div className={`relative shrink-0 ${variant === "mobile" ? "px-4" : ""}`}>
      <InstanceTrigger ctx={ctx} inst={sel} open={open} onToggle={() => setOpen((o) => !o)} variant={variant} />
      {open && (
        <>
          <div className="fixed inset-0 z-20" aria-hidden onClick={() => setOpen(false)} />
          <div role="listbox" className={`absolute top-full z-30 mt-1 max-h-64 overflow-auto rounded-lg border border-border bg-surface shadow-2xl ${variant === "mobile" ? "left-4 right-4" : "left-0 right-0"}`}>
            {group.map((i) => (
              <InstanceMenuItem key={ikey(i)} ctx={ctx} inst={i} selected={ikey(i) === ikey(sel)} onPick={() => { onPick(ikey(i)); setOpen(false); }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The selected instance's console, mounted with its live state. */
function Console({ ctx, inst, variant }: { ctx: LiveContextValue; inst: Inst; variant: Variant }) {
  const props = usePluginProps(ctx, inst.type, inst.def, {}, inst.instance);
  const C = inst.def.client.presenter!.Console as ComponentType<ClientProps<unknown>>;
  // Mobile is edge-to-edge, so the bordered console insets itself; desktop fills the column.
  const box = variant === "mobile" ? "mx-4 mb-3 p-4" : "p-5";
  // Namespace the console's Motion layout tree so a plugin whose UI uses `layoutId`
  // (e.g. Q&A's ranked rows) doesn't share layout identity with the SAME slide rendered
  // live in the presenter's preview Thumb, which sits inside the ScaledStage's
  // `transform`. Without this, Motion treats the two as one shared element and morphs
  // across the scale boundary (the (internal ADR) hazard).
  return (
    <div className={`min-h-0 min-w-0 flex-1 overflow-auto rounded-2xl border border-border bg-surface/40 ${box}`}>
      <LayoutGroup id={`presenter-console-${ikey(inst)}`}>
        <C {...props} />
      </LayoutGroup>
    </div>
  );
}

/** The maximize ⤢ / restore ⤡ button + the "focused" affordance ((internal ADR)). */
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
 *  speaker **Notes** (default) and **one tab per plugin type** that exposes a presenter
 *  surface ((internal ADR)/0033). A type with several instances exposes them through a compact
 *  dropdown in the console header, not one tab each ((internal ADR)). Plus a maximize toggle ((internal ADR)).
 *  Identical structure desktop/mobile; with no instances the strip is just the notes label. */
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
  const instances = usePresenterInstances(ctx);
  // group by type, preserving first-seen order
  const groups = useMemo(() => {
    const m = new Map<string, Inst[]>();
    for (const i of instances) {
      const g = m.get(i.type);
      if (g) g.push(i);
      else m.set(i.type, [i]);
    }
    return [...m.values()];
  }, [instances]);

  const [tab, setTab] = useState<string>("notes"); // "notes" | `t:<type>`
  const [pick, setPick] = useState<Record<string, string>>({}); // type → chosen ikey

  const selectedGroup = groups.find((g) => `t:${g[0]!.type}` === tab) ?? null;
  const showingNotes = !selectedGroup;
  const selectedInst = selectedGroup ? selectedGroup.find((i) => ikey(i) === pick[selectedGroup[0]!.type]) ?? selectedGroup[0]! : null;
  const pickerFor = selectedGroup && selectedGroup.length > 1 ? selectedGroup : null;
  const stripPad = variant === "mobile" ? "px-4 pt-2 pb-1" : "pb-0.5";

  return (
    <>
      <div className={`flex shrink-0 items-center gap-1.5 overflow-x-auto ${stripPad}`}>
        {groups.length === 0 ? (
          <NotesLabel />
        ) : (
          <>
            <button onClick={() => setTab("notes")} className={tabClass(variant, showingNotes)}>
              Notes
            </button>
            {ctx &&
              groups.map((g) => (
                <TypeTab
                  key={g[0]!.type}
                  ctx={ctx}
                  group={g}
                  variant={variant}
                  selected={tab === `t:${g[0]!.type}`}
                  onSelect={() => setTab(`t:${g[0]!.type}`)}
                />
              ))}
          </>
        )}
        {/* focus toggle is desktop-only: the mobile panel is already full-bleed ((internal ADR)/0027) */}
        {onToggleFocus && variant === "desktop" && <FocusControl focused={focused} onToggle={onToggleFocus} />}
      </div>

      {/* instance switcher (dropdown) for the selected multi-instance type, keeps long
          poll questions out of the strip ((internal ADR)) */}
      {ctx && pickerFor && (
        <InstanceDropdown
          ctx={ctx}
          group={pickerFor}
          selectedKey={pick[pickerFor[0]!.type] ?? ikey(pickerFor[0]!)}
          onPick={(k) => setPick((p) => ({ ...p, [pickerFor![0]!.type]: k }))}
          variant={variant}
        />
      )}

      {/* key by selection: switching reuses this slot, but each instance's state may have a
          different shape, without a remount the console would render one frame with the
          previous instance's snapshot (e.g. a poll snapshot reaching the Q&A console) and
          throw. The key forces a fresh mount → correct initial snapshot. */}
      {showingNotes ? (
        <div className={NOTES_CLASS[variant]}>{notes}</div>
      ) : (
        ctx && selectedInst && <Console key={ikey(selectedInst)} ctx={ctx} inst={selectedInst} variant={variant} />
      )}
    </>
  );
}
