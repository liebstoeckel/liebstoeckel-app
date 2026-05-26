import { useMemo, useState } from "react";
import * as Y from "yjs";
import { useTheme } from "@present-it/plugin-ui";
import type { PluginDef } from "@present-it/plugin-sdk";
import { Deck, type DeckProps } from "./Deck";
import { PresenterView } from "./PresenterView";
import { CaptureView } from "./CaptureView";
import { LiveProvider, type LiveContextValue } from "./live/Plugin";
import { detectLive } from "./live/detect";
import { connectLive } from "./live/connect";
import { getParticipantId } from "./live/participant";
import { captureRequest } from "./build/capture-protocol";

// Single entry point for a presentation. Detects a live server (the bootstrap the
// server injects), connects the shared Yjs doc, and provides plugin context. Falls
// back to the standalone deck (BroadcastChannel presenter view via the P key).
export function Present(props: DeckProps) {
  // Build-time thumbnail capture short-circuits everything else: no live connect,
  // no nav, no presenter — just a motionless slide for the headless screenshotter.
  // Gate the live connection on it (hooks still run unconditionally).
  const [capture] = useState(() => captureRequest());
  const info = useMemo(() => (capture ? null : detectLive()), [capture]);
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

  const value: LiveContextValue = {
    live: !!info,
    role: info?.role ?? "presenter",
    participant,
    doc,
    theme,
    viewerUrl: info?.viewer,
    plugins: registry,
  };

  const [isPresenterWindow] = useState(
    () => typeof location !== "undefined" && location.hash.includes("presenter"),
  );

  if (capture) return <CaptureView {...props} />;

  // The confidence monitor (#presenter) works standalone (BroadcastChannel) and
  // live (shared Yjs doc) — it reads the same controller as the audience Deck.
  const view = isPresenterWindow ? <PresenterView {...props} /> : <Deck {...props} />;
  return <LiveProvider value={value}>{view}</LiveProvider>;
}
