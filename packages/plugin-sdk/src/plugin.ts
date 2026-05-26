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
}

export type ClientComponent<T> = ComponentType<ClientProps<T>>;

export interface PluginClient<T> {
  /** rendered in the deck (audience + presenter) */
  Slide: ClientComponent<T>;
  /** optional presenter-only panel */
  Presenter?: ClientComponent<T>;
  /** shown when no server is connected (standalone .html + thumbnail capture);
   *  receives the current snapshot and the author `props` from `<Plugin props>`. */
  fallback?: ComponentType<{ snapshot: T; props: Record<string, unknown> }> | (() => ReactNode);
  /** named override surfaces an author may replace per slide */
  surfaces?: readonly string[];
}

/** Context handed to a plugin's optional server part. */
export interface PluginServerCtx<T> {
  doc: Y.Doc;
  state: PluginState<T>;
  session: { id: string };
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
