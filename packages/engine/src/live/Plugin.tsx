import { createContext, useContext, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup } from "motion/react";
import type * as Y from "yjs";
import { pluginState, registerPluginInstance, type ClientProps, type PluginDef, type Role, type ThemeTokens } from "@liebstoeckel/plugin-sdk";
import { mergeUi } from "./ui";
import { GlowTap, BreakoutSheet, useBreakoutEligible } from "./breakout";

export interface LiveContextValue {
  live: boolean;
  role: Role;
  participant: string;
  doc: Y.Doc;
  theme: ThemeTokens;
  /** read-only follow-along link, for the in-deck QR (live only) */
  viewerUrl?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: Record<string, PluginDef<any>>;
}

const LiveCtx = createContext<LiveContextValue | null>(null);
export const useLive = (): LiveContextValue | null => useContext(LiveCtx);

export function LiveProvider({ value, children }: { value: LiveContextValue; children: ReactNode }) {
  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>;
}

/** Subscribe to a plugin's slice of the shared doc and assemble its `ClientProps`.
 *  The single piece of plumbing behind `<Plugin>`, the global surfaces, and the
 *  presenter console — so every surface reads the same live state identically. */
export function usePluginProps(
  ctx: LiveContextValue,
  id: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  def: PluginDef<any>,
  props: Record<string, unknown> = {},
  instance = "",
): ClientProps<unknown> {
  const state = useMemo(() => pluginState(ctx.doc, id, def.state, instance), [ctx.doc, id, def, instance]);
  const [snap, setSnap] = useState<unknown>(() => state.snapshot());
  useEffect(() => {
    setSnap(state.snapshot());
    return state.subscribe(setSnap);
  }, [state]);
  return {
    doc: ctx.doc,
    state,
    snapshot: snap,
    role: ctx.role,
    live: ctx.live,
    participantId: ctx.participant,
    theme: ctx.theme,
    ui: mergeUi({}, {}),
    props,
    instance,
  };
}

/** Place a plugin in a slide. Renders the plugin's `Slide` when a server is
 *  connected, else its `fallback`. Subscribes to the shared state snapshot. */
export function Plugin({
  id,
  instance = "",
  title,
  props = {},
  components = {},
}: {
  id: string;
  /** instance discriminator (ADR 0033); omit for the default slice. Two placements with
   *  the same (id, instance) share state — that's how you intentionally mirror one. */
  instance?: string;
  /** optional human label for this instance, used in the presenter tabs to tell
   *  sibling instances apart (a plugin's `presenter.title(snapshot)` takes precedence). */
  title?: string;
  props?: Record<string, unknown>;
  components?: Record<string, ComponentType<Record<string, unknown>>>;
}) {
  const ctx = useContext(LiveCtx);
  const def = ctx?.plugins[id];
  const state = useMemo(
    () => (ctx && def ? pluginState(ctx.doc, id, def.state, instance) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx?.doc, id, def, instance],
  );
  const [snap, setSnap] = useState<unknown>(() => state?.snapshot());
  const [open, setOpen] = useState(false);
  // hooks run unconditionally (before any early return)
  const interactive = def?.client.interactive !== false;
  const eligible = useBreakoutEligible(interactive);

  useEffect(() => {
    if (!state) return;
    setSnap(state.snapshot());
    return state.subscribe(setSnap);
  }, [state]);

  // Register this instance so the presenter console / server can discover it (ADR 0033).
  useEffect(() => {
    if (ctx?.live && def) registerPluginInstance(ctx.doc, id, instance, { title });
  }, [ctx?.live, ctx?.doc, def, id, instance, title]);

  if (!ctx || !def || !state) return null;

  if (!ctx.live) {
    const Fb = def.client.fallback;
    return Fb ? <Fb snapshot={snap as never} props={props} /> : null;
  }

  const Slide = def.client.Slide;
  // Isolate each surface's Motion layout tree: a plugin's `layoutId` (e.g. Q&A's ranked
  // rows) is also rendered by other live surfaces of the same plugin — the global panel,
  // the presenter console, the mobile breakout. Sharing one `layoutId` across them makes
  // Motion morph one into another (rows "disappear" from the slide). A per-surface
  // LayoutGroup namespaces the ids so intra-surface animation still works but they never
  // collide across surfaces (the ADR 0026 hazard, generalised).
  const slide = (key: string) => (
    <LayoutGroup key={key} id={`plugin:${id}:${instance}:${key}`}>
      <Slide
        doc={ctx.doc}
        state={state}
        snapshot={snap as never}
        role={ctx.role}
        live={ctx.live}
        participantId={ctx.participant}
        theme={ctx.theme}
        ui={mergeUi({}, components)}
        props={props}
        instance={instance}
      />
    </LayoutGroup>
  );

  // Desktop / fine pointer: inline, as today.
  if (!eligible) return slide("inline");

  // Touch + shrunk stage: a tappable glowing preview (non-interactive) that opens
  // the same plugin full-size in a sheet outside the scaled canvas.
  return (
    <>
      <GlowTap label={id} onOpen={() => setOpen(true)}>
        {slide("preview")}
      </GlowTap>
      <AnimatePresence>{open && <BreakoutSheet label={id} onClose={() => setOpen(false)}>{slide("sheet")}</BreakoutSheet>}</AnimatePresence>
    </>
  );
}
