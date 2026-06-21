import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ChromeButton } from "@liebstoeckel/plugin-ui";
import { type ClientProps, type GlobalProps, type PluginDef } from "@liebstoeckel/plugin-sdk";
import { useLive, usePluginProps, type LiveContextValue } from "./Plugin";
import { BreakoutSheet } from "./breakout";
import { useCoarsePointer } from "../useCoarsePointer";
import { globalPlugins } from "./globals";

/** A row in the touch `⋮` menu (matches DeckChrome's MenuAction). */
export interface PluginMenuAction {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

interface PanelController {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

/** A lightweight popover for a global plugin Panel, portaled to device scale and
 *  anchored just above the chrome rail (bottom-left), with a transparent outside-
 *  click catcher and NO backdrop blur/dim. Unlike the focus-stealing `BreakoutSheet`
 *  (used for full interactive breakouts like Q&A), a quick, frequent action such as
 *  reacting shouldn't blur the whole deck behind it ((internal ADR)). */
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

/** One plugin's ambient overlay (e.g. reactions floaters), inside the shared
 *  `pointer-events:none` layer. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function OverlayItem({ ctx, id, def }: { ctx: LiveContextValue; id: string; def: PluginDef<any> }) {
  const props = usePluginProps(ctx, id, def);
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

/** A plugin's rail trigger: its custom `Control` if it has one, else a `ChromeButton`
 *  built from `icon` + `label`. Toggles the shared panel open-state. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RailTrigger({ ctx, id, def, panel }: { ctx: LiveContextValue; id: string; def: PluginDef<any>; panel: PanelController }) {
  const base = usePluginProps(ctx, id, def);
  const g = def.client.global!;
  const Control = g.Control as ComponentType<GlobalProps<unknown>> | undefined;
  if (Control) return <Control {...base} panel={panel} />;
  return (
    <ChromeButton onClick={panel.toggle} active={panel.open} title={g.label} ariaLabel={g.label}>
      {g.icon}
    </ChromeButton>
  );
}

/** A plugin's panel, hosted centrally so it survives the `⋮` sheet closing and so its
 *  open-state can be driven from either the rail or a menu row. A `"sheet"` panel opens
 *  full-viewport on touch (keyboard-friendly, (internal ADR)); otherwise a popover. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PanelHost({ ctx, id, def, open, onClose, coarse }: { ctx: LiveContextValue; id: string; def: PluginDef<any>; open: boolean; onClose: () => void; coarse: boolean }) {
  const base = usePluginProps(ctx, id, def);
  const Panel = def.client.global?.Panel as ComponentType<GlobalProps<unknown>> | undefined;
  const gprops: GlobalProps<unknown> = { ...base, panel: { open, toggle: onClose, close: onClose } };
  const sheet = def.client.global?.panelMode === "sheet" && coarse;
  return (
    <AnimatePresence>
      {open &&
        Panel &&
        (sheet ? (
          <BreakoutSheet label={def.client.global?.label ?? id} onClose={onClose}>
            <LayoutGroup id={`plugin-panel:${id}`}>
              <Panel {...gprops} />
            </LayoutGroup>
          </BreakoutSheet>
        ) : (
          <ChromePopover onClose={onClose}>
            <LayoutGroup id={`plugin-panel:${id}`}>
              <Panel {...gprops} />
            </LayoutGroup>
          </ChromePopover>
        ))}
    </AnimatePresence>
  );
}

/** Wires the global plugin controls into the chrome ((internal ADR)). Returns the rail
 *  triggers (pinned + custom on touch, all on desktop), the `⋮` menu rows for the rest
 *  (touch only, the rail can't overflow), and the centrally-hosted panels. One panel
 *  open at a time. */
export function usePluginChrome(): { rail: ReactNode; menuActions: PluginMenuAction[]; panels: ReactNode } {
  const ctx = useLive();
  const coarse = useCoarsePointer();
  const [openId, setOpenId] = useState<string | null>(null);
  if (!ctx?.live) return { rail: null, menuActions: [], panels: null };

  const entries = globalPlugins(ctx.plugins).filter((e) => e.def.client.global?.Panel || e.def.client.global?.Control);
  // desktop: everything inline. touch: pinned (or a custom Control) inline, the rest → ⋮.
  const inRail = (def: (typeof entries)[number]["def"]) => !coarse || !!def.client.global?.pinned || !!def.client.global?.Control;
  const ctrl = (id: string): PanelController => ({
    open: openId === id,
    toggle: () => setOpenId((v) => (v === id ? null : id)),
    close: () => setOpenId(null),
  });

  const rail = entries
    .filter((e) => inRail(e.def))
    .map(({ id, def }) => <RailTrigger key={id} ctx={ctx} id={id} def={def} panel={ctrl(id)} />);

  const menuActions: PluginMenuAction[] = entries
    .filter((e) => !inRail(e.def))
    .map(({ id, def }) => ({ key: `plugin:${id}`, label: def.client.global?.label ?? id, icon: def.client.global?.icon ?? null, onClick: () => setOpenId(id) }));

  const panels = entries.map(({ id, def }) => (
    <PanelHost key={id} ctx={ctx} id={id} def={def} open={openId === id} onClose={() => setOpenId(null)} coarse={coarse} />
  ));

  return { rail, menuActions, panels };
}
