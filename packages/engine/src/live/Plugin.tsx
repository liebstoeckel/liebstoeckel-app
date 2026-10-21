import { createContext, useContext, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, LayoutGroup, useIsPresent } from "motion/react";
import type * as Y from "yjs";
import {
  instanceStateKey,
  pluginState,
  registerPluginInstance,
  type ClientProps,
  type PluginDef,
  type Refusal,
  type Role,
  type SyncGate,
  type ThemeTokens,
} from "@liebstoeckel/plugin-sdk";
import { mergeUi } from "./ui";
import { GlowTap, BreakoutSheet, useBreakoutEligible } from "./breakout";
import { usePhoneView, pluginLabel } from "./phoneView";
import { pluginPlacement } from "../mobile";
import { PluginBoundary } from "./PluginBoundary";
import { devWarn } from "../devLog";
import type { AudienceCount, LiveState } from "./protocol";

/** Where the audience count comes from: the current value, and a way to hear changes. */
export interface AudienceSource {
  get(): AudienceCount | undefined;
  subscribe(cb: () => void): () => void;
}

export interface LiveContextValue {
  live: boolean;
  role: Role;
  participant: string;
  doc: Y.Doc;
  theme: ThemeTokens;
  /** read-only follow-along link, for the in-deck QR (live only) */
  viewerUrl?: string;
  /** days the host keeps what the audience writes after the session (live only) */
  audienceInputKeptDays?: number;
  /** the live connection's state (live only) */
  connection?: LiveState;
  /** live only: false while the device says it is offline (`navigator.onLine`), which it
   *  knows before the connection notices */
  online?: boolean;
  /** presenters, live only: how many are connected, as the server last said. Read it
   *  with `useAudienceCount`, which re-renders only the components that show it. */
  audience?: AudienceSource;
  /** this viewer's refused writes by doc root (live only) */
  refusals?: ReadonlyMap<string, Refusal>;
  /** live only: whether the session state has arrived yet (absent means it has) */
  synced?: boolean;
  /** live only: holds plugin state writes back until the session state has arrived */
  gate?: SyncGate;
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
 *  presenter console, so every surface reads the same live state identically. */
export function usePluginProps(
  ctx: LiveContextValue,
  id: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  def: PluginDef<any>,
  props: Record<string, unknown> = {},
  instance = "",
): ClientProps<unknown> {
  const state = useMemo(
    () => pluginState(ctx.doc, id, def.state, instance, ctx.gate),
    [ctx.doc, id, def, instance, ctx.gate],
  );
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
    audienceInputKeptDays: ctx.audienceInputKeptDays,
    theme: ctx.theme,
    ui: mergeUi({}, {}),
    props,
    instance,
    refusal: ctx.refusals?.get(instanceStateKey(id, instance)),
    synced: ctx.synced ?? true,
    connected: connectedOf(ctx),
  };
}

/** Whether this client's writes are reaching the live server now (see `ClientProps.connected`).
 *  After the talk has ended nothing more is written (the plugins take no input), and what
 *  was sent before arrived, so a plugin keeps saying so ("Vote received") rather than
 *  claiming it is still sending. */
export function connectedOf(ctx: Pick<LiveContextValue, "connection" | "online">): boolean {
  const c = ctx.connection;
  if (c?.status === "ended") return true;
  if (ctx.online === false) return false;
  return !c || (c.status === "connected" && !c.sending);
}

/** Swallow an input event (a plugin of an ended talk). */
function stopInput(e: { stopPropagation(): void; preventDefault(): void }) {
  e.stopPropagation();
  e.preventDefault();
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
  /** instance discriminator; omit for the default slice. Two placements with
   *  the same (id, instance) share state, that's how you intentionally mirror one. */
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
    () => (ctx && def ? pluginState(ctx.doc, id, def.state, instance, ctx.gate) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx?.doc, id, def, instance, ctx?.gate],
  );
  const [snap, setSnap] = useState<unknown>(() => state?.snapshot());
  const [open, setOpen] = useState(false);
  // hooks run unconditionally (before any early return)
  const interactive = def?.client.interactive !== false;
  const eligible = useBreakoutEligible(interactive);
  // The phone-first view (a viewer on a portrait phone): the plugin leaves the slide and
  // fills the screen below a small slide preview. Not for a slide on its way out.
  const phone = usePhoneView();
  const present = useIsPresent();
  const placement = pluginPlacement({ eligible, phoneView: !!phone && !!ctx?.live && !!def, leaving: !present });
  const phoneFirst = placement === "phone" && !!phone;
  const register = phone?.register;
  useEffect(() => {
    if (phoneFirst && register) return register();
  }, [phoneFirst, register]);

  useEffect(() => {
    if (!state) return;
    setSnap(state.snapshot());
    return state.subscribe(setSnap);
  }, [state]);

  // Register this instance so the presenter console / server can discover it.
  useEffect(() => {
    if (ctx?.live && def) registerPluginInstance(ctx.doc, id, instance, { title });
  }, [ctx?.live, ctx?.doc, def, id, instance, title]);

  // Inside a <Present> but the id isn't in its `plugins={[…]}` — a very common authoring
  // slip. Without this the component silently renders nothing (no fallback, no error),
  // leaving a baffling blank slide. Warn so the mistake explains itself.
  useEffect(() => {
    if (ctx && !def) {
      devWarn(
        `[liebstoeckel] <Plugin id="${id}"> is not registered. Add its plugin to ` +
          `<Present plugins={[…]}> or it renders nothing.`,
      );
    }
  }, [ctx, def, id]);

  if (!ctx || !def || !state) return null;

  if (!ctx.live) {
    const Fb = def.client.fallback;
    return Fb ? <Fb snapshot={snap as never} props={props} /> : null;
  }

  const Slide = def.client.Slide;
  // Isolate each surface's Motion layout tree: a plugin's `layoutId` (e.g. Q&A's ranked
  // rows) is also rendered by other live surfaces of the same plugin, the global panel,
  // the presenter console, the mobile breakout. Sharing one `layoutId` across them makes
  // Motion morph one into another (rows "disappear" from the slide). A per-surface
  // LayoutGroup namespaces the ids so intra-surface animation still works but they never
  // collide across surfaces.
  // After the talk has ended a viewer's plugins stay readable (the results as they were)
  // but take no more input: nothing sent now would reach anyone.
  const ended = ctx.role === "viewer" && ctx.connection?.status === "ended";
  const slide = (key: string) => (
    <LayoutGroup key={key} id={`plugin:${id}:${instance}:${key}`}>
      <div
        inert={ended}
        data-pi-plugin-ended={ended || undefined}
        // `inert` stops a person; a click dispatched from script still reaches the
        // plugin. Stopping input here as well keeps an ended talk's state as it was.
        onClickCapture={ended ? stopInput : undefined}
        onPointerDownCapture={ended ? stopInput : undefined}
        onKeyDownCapture={ended ? stopInput : undefined}
        onSubmitCapture={ended ? stopInput : undefined}
        style={{ display: "contents" }}
      >
      <PluginBoundary resetKey={snap}>
        <Slide
          doc={ctx.doc}
          state={state}
          snapshot={snap as never}
          role={ctx.role}
          live={ctx.live}
          participantId={ctx.participant}
          audienceInputKeptDays={ctx.audienceInputKeptDays}
          theme={ctx.theme}
          ui={mergeUi({}, components)}
          props={props}
          instance={instance}
          refusal={ctx.refusals?.get(instanceStateKey(id, instance))}
          synced={ctx.synced ?? true}
          connected={connectedOf(ctx)}
        />
      </PluginBoundary>
      </div>
    </LayoutGroup>
  );

  const label = pluginLabel(def, id);

  // Phone-first: the real plugin renders once, at device scale, in the deck's panel
  // below the slide; the slide keeps only a marker where it sits. Rendering the plugin
  // in the slide as well would run its effects twice (a Q&A ask box would race its own
  // copy for a refused question).
  if (phoneFirst) {
    return (
      <>
        <PhonePlaceholder label={label} />
        {phone.target &&
          createPortal(
            <section aria-label={label} data-pi-phone-plugin={id}>
              {slide("phone")}
            </section>,
            phone.target,
          )}
      </>
    );
  }

  // Desktop / fine pointer: inline, as today.
  if (placement === "inline") return slide("inline");

  // Touch + shrunk stage: a tappable glowing preview (non-interactive) that opens
  // the same plugin full-size in a sheet outside the scaled canvas.
  return (
    <>
      <GlowTap label={label} onOpen={() => setOpen(true)}>
        {slide("preview")}
      </GlowTap>
      <AnimatePresence>{open && <BreakoutSheet label={label} onClose={() => setOpen(false)}>{slide("sheet")}</BreakoutSheet>}</AnimatePresence>
    </>
  );
}

/** Where a plugin sits on the slide while it is shown below it (the phone-first view):
 *  a quiet outline with its name and an arrow down, in slide pixels. */
function PhonePlaceholder({ label }: { label: string }) {
  return (
    <div
      aria-hidden
      data-pi-phone-placeholder
      style={{
        width: "100%",
        maxWidth: 460,
        minHeight: 320,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.2rem",
        borderRadius: "1.1rem",
        border: "3px dashed color-mix(in srgb, var(--brand-accent, #e0c580) 70%, transparent)",
        background: "color-mix(in srgb, var(--brand-surface, #1a2014) 50%, transparent)",
        color: "var(--brand-accent, #e0c580)",
        fontFamily: "var(--brand-font-mono, monospace)",
        fontSize: "3.2rem",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {label}
      <span style={{ fontSize: "4rem" }}>↓</span>
    </div>
  );
}
