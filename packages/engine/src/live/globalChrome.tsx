import { useEffect, useMemo, useState, type ComponentType } from "react";
import { AnimatePresence } from "motion/react";
import { pluginState, type ClientProps, type GlobalProps, type PluginDef } from "@liebstoeckel/plugin-sdk";
import { useLive, type LiveContextValue } from "./Plugin";
import { mergeUi } from "./ui";
import { globalPlugins } from "./globals";
import { BreakoutSheet } from "./breakout";

/** Subscribe to a plugin's slice of the shared doc — same pattern as `<Plugin>`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useGlobalProps(ctx: LiveContextValue, id: string, def: PluginDef<any>): ClientProps<unknown> {
  const state = useMemo(() => pluginState(ctx.doc, id, def.state), [ctx.doc, id, def]);
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
    props: {},
  };
}

/** One plugin's ambient overlay (e.g. reactions floaters), inside the shared
 *  `pointer-events:none` layer. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function OverlayItem({ ctx, id, def }: { ctx: LiveContextValue; id: string; def: PluginDef<any> }) {
  const props = useGlobalProps(ctx, id, def);
  const Overlay = def.client.global?.Overlay as ComponentType<ClientProps<unknown>> | undefined;
  return Overlay ? <Overlay {...props} /> : null;
}

/** Deck-wide overlay layer. Mounted as a child of `[data-deck-root]` so its
 *  contents are positioned over the slide; non-interactive by default. */
export function PluginOverlays() {
  const ctx = useLive();
  if (!ctx?.live) return null;
  const entries = globalPlugins(ctx.plugins).filter((e) => e.def.client.global?.Overlay);
  if (entries.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {entries.map(({ id, def }) => (
        <OverlayItem key={id} ctx={ctx} id={id} def={def} />
      ))}
    </div>
  );
}

/** One plugin's chrome control (rendered inline in the rail) plus its panel
 *  (portaled outside the scaled stage via `BreakoutSheet`). Owns its open-state. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ControlItem({ ctx, id, def }: { ctx: LiveContextValue; id: string; def: PluginDef<any> }) {
  const base = useGlobalProps(ctx, id, def);
  const [open, setOpen] = useState(false);
  const Control = def.client.global?.Control as ComponentType<GlobalProps<unknown>> | undefined;
  const Panel = def.client.global?.Panel as ComponentType<GlobalProps<unknown>> | undefined;
  const panel = { open, toggle: () => setOpen((v) => !v), close: () => setOpen(false) };
  const gprops: GlobalProps<unknown> = { ...base, panel };
  return (
    <>
      {Control && <Control {...gprops} />}
      <AnimatePresence>
        {open && Panel && (
          <BreakoutSheet label={id} onClose={panel.close}>
            <Panel {...gprops} />
          </BreakoutSheet>
        )}
      </AnimatePresence>
    </>
  );
}

/** The plugin half of the chrome rail: one `Control` per registered plugin that
 *  exposes one, in registration order. Rendered next to the help button. */
export function PluginControls() {
  const ctx = useLive();
  if (!ctx?.live) return null;
  const entries = globalPlugins(ctx.plugins).filter((e) => e.def.client.global?.Control);
  if (entries.length === 0) return null;
  return (
    <>
      {entries.map(({ id, def }) => (
        <ControlItem key={id} ctx={ctx} id={id} def={def} />
      ))}
    </>
  );
}
