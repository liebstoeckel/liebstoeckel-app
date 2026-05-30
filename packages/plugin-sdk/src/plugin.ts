import type { ComponentType, ReactNode } from "react";
import type * as Y from "yjs";
import type { Schema } from "./schema";
import type { PluginState } from "./state";
import type { ThemeTokens } from "./theme";

export type Role = "presenter" | "viewer";

/** Props passed to a plugin's client components. */
export interface ClientProps<T> {
  /** the shared Yjs doc */
  doc: Y.Doc;
  /** typed state accessor (snapshot / set / recordSet / subscribe) */
  state: PluginState<T>;
  /** current state snapshot — re-rendered on every change */
  snapshot: T;
  /** "presenter" | "viewer" */
  role: Role;
  /** is a live server connected? (false → standalone .html) */
  live: boolean;
  /** stable id for this browser session */
  participantId: string;
  /** resolved brand tokens (colors/fonts) for canvas/SVG use */
  theme: ThemeTokens;
  /** author-provided surface overrides (merged over defaults) */
  ui: Record<string, ComponentType<Record<string, unknown>>>;
  /** author config passed at placement, e.g. <Plugin id="poll" props={{ options }} /> */
  props: Record<string, unknown>;
  /** instance discriminator (ADR 0033); "" = the default slice. Lets one plugin *type*
   *  back many independent placements (e.g. two separate polls). */
  instance: string;
}

export type ClientComponent<T> = ComponentType<ClientProps<T>>;

/** Controls the open-state of a plugin's global `Panel` — the engine owns it the
 *  same way it owns the Help/QR overlays. A `Control` toggles its sibling `Panel`. */
export interface PanelController {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

/** Props for a plugin's `Control`/`Panel` global surfaces: the usual `ClientProps`
 *  plus the panel controller. (`Overlay` is ambient and gets plain `ClientProps`.) */
export interface GlobalProps<T> extends ClientProps<T> {
  panel: PanelController;
}

export type GlobalComponent<T> = ComponentType<GlobalProps<T>>;

/** Optional deck-wide surfaces, mounted once per deck by the engine (see ADR 0021).
 *  Live-gated: rendered only when a server is connected. */
export interface GlobalSurfaces<T> {
  /** full-deck, `pointer-events:none` float layer above the slide, below chrome */
  Overlay?: ClientComponent<T>;
  /** the panel's trigger label — used as the chrome button's `aria-label` and as its
   *  row text when it overflows into the touch `⋮` menu (ADR 0038). */
  label?: string;
  /** the trigger glyph (a stroke SVG to match the engine's chrome icons). */
  icon?: ReactNode;
  /** keep this control in the chrome rail on mobile instead of overflowing into the
   *  `⋮` menu — for quick, frequent actions like reactions (ADR 0038). Default false:
   *  on a coarse pointer the control becomes a `⋮` menu row so the rail can't overflow.
   *  Ignored on desktop, where the rail has room for everything. */
  pinned?: boolean;
  /** advanced: a fully custom trigger component (instead of `icon`+`label`). Rendered
   *  inline in the rail only — it does not participate in `⋮` overflow. */
  Control?: GlobalComponent<T>;
  /** a drawer/modal portaled outside the scaled stage, toggled by the control */
  Panel?: GlobalComponent<T>;
  /** how the `Panel` opens. `"popover"` (default) is a light, non-dimming bubble above the
   *  chrome rail — right for quick, frequent actions (reactions). `"sheet"` opens a
   *  full-viewport breakout on touch (keyboard-friendly) — right for panels with a text
   *  input (Q&A), where a bottom popover gets buried by the on-screen keyboard. On a
   *  fine-pointer (desktop) it stays a popover regardless. See ADR 0023 / 0037. */
  panelMode?: "popover" | "sheet";
}

/** A plugin's **presenter console** — one tab in the presenter view (ADR 0031). It
 *  may be a passive readout, an interactive moderator, or both: a plugin decides.
 *  Audience-affecting actions ("close voting", "pin question", "reveal results") are
 *  just role-gated writes to the plugin's own state, which its `Slide` reads — there
 *  is no separate broadcast channel. Mounted only when a server is connected. */
export interface PresenterSurface<T> {
  /** tab label in the presenter panel (e.g. "Q&A", "Poll") */
  label: string;
  /** optional tab glyph — emoji or node */
  icon?: ReactNode;
  /** optional attention badge derived from live state (unread questions, total
   *  votes, …), shown as a small pill on the tab so a presenter notices a tab that
   *  needs attention without switching to it. Return undefined/0 for none. */
  badge?: (snapshot: T) => number | string | undefined;
  /** optional per-instance title from live state (e.g. the poll's question), used to
   *  tell sibling instances apart in the presenter tabs (ADR 0033). Falls back to the
   *  placement `title`, then the instance id. */
  title?: (snapshot: T) => string | undefined;
  /** the console itself: full-size, presenter-private. Same `ClientProps` as
   *  `Slide` (doc, state, snapshot, role, live, …). */
  Console: ClientComponent<T>;
}

export interface PluginClient<T> {
  /** rendered in the deck (audience + presenter) */
  Slide: ClientComponent<T>;
  /** optional presenter console — a tab in the presenter view (ADR 0031) */
  presenter?: PresenterSurface<T>;
  /** shown when no server is connected (standalone .html + thumbnail capture);
   *  receives the current snapshot and the author `props` from `<Plugin props>`. */
  fallback?: ComponentType<{ snapshot: T; props: Record<string, unknown> }> | (() => ReactNode);
  /** named override surfaces an author may replace per slide */
  surfaces?: readonly string[];
  /** does the slide take user input? Controls the touch "tap to interact" breakout
   *  on small / coarse-pointer screens. Defaults to true; set false for display-only
   *  plugins so they don't show a misleading affordance. */
  interactive?: boolean;
  /** optional deck-wide surfaces (overlay / chrome control / panel), independent of
   *  the slide-anchored `<Plugin>` placement. See ADR 0021. */
  global?: GlobalSurfaces<T>;
}

/** Context handed to a plugin's optional server part. */
export interface PluginServerCtx<T> {
  doc: Y.Doc;
  state: PluginState<T>;
  session: { id: string };
  /** the instance this invocation is for ("" = default). A server plugin that supports
   *  multiple instances enumerates the rest from the doc index — `readPluginInstances` /
   *  `observePluginIndex` (ADR 0033 / 0034). */
  instance: string;
}

export interface PluginDef<T> {
  id: string;
  state: Schema<T>;
  /** optional: relay-plus logic. Returns an optional teardown fn. */
  server?: (ctx: PluginServerCtx<T>) => void | (() => void);
  client: PluginClient<T>;
}

/** Identity helper — carries types, lets tooling discover the shape. */
export function definePlugin<T>(def: PluginDef<T>): PluginDef<T> {
  return def;
}
