import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { pluginState, type ClientProps, type GlobalProps, type PluginDef } from "@liebstoeckel/plugin-sdk";
import { useLive, type LiveContextValue } from "./Plugin";
import { mergeUi } from "./ui";
import { globalPlugins } from "./globals";

/** A lightweight popover for a global plugin Panel — portaled to device scale and
 *  anchored just above the chrome rail (bottom-left), with a transparent outside-
 *  click catcher and NO backdrop blur/dim. Unlike the focus-stealing `BreakoutSheet`
 *  (used for full interactive breakouts like Q&A), a quick, frequent action such as
 *  reacting shouldn't blur the whole deck behind it (ADR 0023). */
function ChromePopover({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* transparent catcher: outside-tap closes, but the deck stays fully visible */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9998, background: "transparent" }} />
      <motion.div
        data-pi-panel
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        style={{
          position: "fixed",
          zIndex: 9999,
          left: "max(env(safe-area-inset-left), 1rem)",
          bottom: "calc(3.6rem + env(safe-area-inset-bottom))",
          maxWidth: "min(22rem, calc(100vw - 2rem))",
          padding: "1rem 1.15rem 1.15rem",
          borderRadius: "1rem",
          background: "var(--brand-surface, #11141b)",
          border: "1px solid var(--brand-border, #222734)",
          boxShadow: "0 18px 50px -18px rgba(0,0,0,0.7)",
        }}
      >
        {children}
      </motion.div>
    </>,
    document.body,
  );
}

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
          <ChromePopover onClose={panel.close}>
            <Panel {...gprops} />
          </ChromePopover>
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
