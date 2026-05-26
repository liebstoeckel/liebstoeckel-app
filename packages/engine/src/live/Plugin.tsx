import { createContext, useContext, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { AnimatePresence } from "motion/react";
import type * as Y from "yjs";
import { pluginState, type PluginDef, type Role, type ThemeTokens } from "@present-it/plugin-sdk";
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

/** Place a plugin in a slide. Renders the plugin's `Slide` when a server is
 *  connected, else its `fallback`. Subscribes to the shared state snapshot. */
export function Plugin({
  id,
  props = {},
  components = {},
}: {
  id: string;
  props?: Record<string, unknown>;
  components?: Record<string, ComponentType<Record<string, unknown>>>;
}) {
  const ctx = useContext(LiveCtx);
  const def = ctx?.plugins[id];
  const state = useMemo(
    () => (ctx && def ? pluginState(ctx.doc, id, def.state) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx?.doc, id, def],
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

  if (!ctx || !def || !state) return null;

  if (!ctx.live) {
    const Fb = def.client.fallback;
    return Fb ? <Fb snapshot={snap as never} props={props} /> : null;
  }

  const Slide = def.client.Slide;
  const slide = (key: string) => (
    <Slide
      key={key}
      doc={ctx.doc}
      state={state}
      snapshot={snap as never}
      role={ctx.role}
      live={ctx.live}
      participantId={ctx.participant}
      theme={ctx.theme}
      ui={mergeUi({}, components)}
      props={props}
    />
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
