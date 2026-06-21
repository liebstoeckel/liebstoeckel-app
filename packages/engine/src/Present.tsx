import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { useTheme } from "@liebstoeckel/plugin-ui";
import { themeToCss, type Theme } from "@liebstoeckel/theme";
import { registerPluginInstance, type PluginDef } from "@liebstoeckel/plugin-sdk";
import { Deck, type DeckProps } from "./Deck";
import { PresenterView } from "./PresenterView";
import { CaptureView } from "./CaptureView";
import { PrintView } from "./PrintView";
import { LiveProvider, type LiveContextValue } from "./live/Plugin";
import { detectLive } from "./live/detect";
import { connectLive } from "./live/connect";
import { getParticipantId } from "./live/participant";
import { captureRequest, printRequest } from "./build/capture-protocol";

/** Concatenate deck-defined brand themes into one CSS string of `[data-brand]`
 *  blocks (empty when none). Pure, unit-testable without a DOM. */
export function brandThemesCss(themes?: Theme[]): string {
  return (themes ?? []).map(themeToCss).join("\n");
}

/** Whether to render the presenter confidence monitor: the `#presenter` hash asks
 *  for it, but a live **viewer** must never reach it (it exposes speaker notes and
 *  the plugin presenter consoles). Standalone (`role === undefined`) keeps the
 *  hash-gate as the presenter mechanism ((internal ADR)/0070). Pure, DOM-free. */
export function presenterViewRequested(hash: string, role?: string): boolean {
  return hash.includes("presenter") && role !== "viewer";
}

// Single entry point for a presentation. Detects a live server (the bootstrap the
// server injects), connects the shared Yjs doc, and provides plugin context. Falls
// back to the standalone deck (BroadcastChannel presenter view via the P key).
export function Present(props: DeckProps) {
  // Build-time thumbnail capture short-circuits everything else: no live connect,
  // no nav, no presenter, just a motionless slide for the headless screenshotter.
  // Gate the live connection on it (hooks still run unconditionally).
  const [capture] = useState(() => captureRequest());
  const [print] = useState(() => printRequest());
  const info = useMemo(() => (capture || print ? null : detectLive()), [capture, print]);
  const participant = useMemo(() => getParticipantId(), []);
  const theme = useTheme();
  const registry = useMemo(
    () =>
      Object.fromEntries((props.plugins ?? []).map((p) => [p.id, p])) as Record<
        string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        PluginDef<any>
      >,
    [props.plugins],
  );
  const conn = useMemo(() => (info ? connectLive(info, participant) : null), [info, participant]);
  const doc = useMemo(() => conn?.doc ?? new Y.Doc(), [conn]);

  // A plugin with global surfaces + a presenter console (e.g. Q&A) can be used without an
  // on-slide placement, so register its default instance in the doc index, otherwise the
  // presenter console, which discovers instances from placements ((internal ADR)), wouldn't find
  // it. Runs in both the Deck and the presenter window, so it doesn't depend on a viewer
  // being connected. ((internal ADR))
  useEffect(() => {
    if (!info) return;
    for (const [id, def] of Object.entries(registry)) {
      if (def.client.presenter && def.client.global) registerPluginInstance(doc, id, "");
    }
  }, [info, registry, doc]);

  const value: LiveContextValue = {
    live: !!info,
    role: info?.role ?? "presenter",
    participant,
    doc,
    theme,
    viewerUrl: info?.viewer,
    plugins: registry,
  };

  // The presenter confidence monitor is selected by the #presenter hash, but in a
  // live session a *viewer* must never reach it (it leaks speaker notes + presenter
  // consoles). Standalone (no live role) keeps the hash-gate ((internal ADR)/0070).
  const [isPresenterWindow] = useState(
    () => typeof location !== "undefined" && presenterViewRequested(location.hash, info?.role),
  );

  // Deck-defined brands → an injected `[data-brand]` stylesheet (so a deck can ship
  // its own brand without editing the theme package). Rendered in every view.
  const css = brandThemesCss(props.brandThemes);
  const brandStyle = css ? <style data-brand-themes>{css}</style> : null;

  if (capture)
    return (
      <>
        {brandStyle}
        <CaptureView {...props} />
      </>
    );

  if (print)
    return (
      <>
        {brandStyle}
        <PrintView {...props} />
      </>
    );

  // The confidence monitor (#presenter) works standalone (BroadcastChannel) and
  // live (shared Yjs doc), it reads the same controller as the audience Deck.
  const view = isPresenterWindow ? <PresenterView {...props} /> : <Deck {...props} />;
  return (
    <LiveProvider value={value}>
      {brandStyle}
      {view}
    </LiveProvider>
  );
}
