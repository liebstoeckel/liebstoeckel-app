import { useEffect, useState } from "react";
import type { LiveState } from "./protocol";
import { msgs, type LiveMessages } from "./messages";

/** What the status pill says, by key into the live messages. */
export type StatusLabel = "connecting" | "reconnecting" | "sending" | "offline" | "ended" | "full" | "outdated";

/** How long a viewer's connection may be down before the pill says so: a server
 *  restart or a pod move reconnects within a few seconds, and that should not flash
 *  on every phone in the room. */
export const VIEWER_DOWN_GRACE_MS = 5000;

/**
 * What the status pill shows, or null for nothing. Presenters see every problem with
 * the live connection. The audience sees what will not fix itself (ended, full, out of
 * date), what is about what they just did (`sending`), the device being offline (so a
 * vote is not taken as counted), and a reconnect only once it has lasted a while
 * (`longDown`). `online` is the device's own word on the network.
 */
export function liveStatusLabel(
  state: LiveState | undefined,
  role: string | undefined,
  opts: { online?: boolean; longDown?: boolean } = {},
): StatusLabel | null {
  if (!state) return null;
  const s = state.status;
  if (s === "ended" || s === "outdated" || s === "full") return s;
  if (opts.online === false) return "offline";
  if (state.sending) return "sending";
  if (s === "connected") return null;
  if (role === "viewer" && !opts.longDown) return null;
  return s;
}

/** The pill's text for a label. */
function labelText(m: LiveMessages, label: StatusLabel): string {
  switch (label) {
    case "connecting":
      return m.connecting;
    case "reconnecting":
      return m.reconnecting;
    case "sending":
      return m.sending;
    case "offline":
      return m.offline;
    case "ended":
      return m.endedPill;
    case "full":
      return m.fullTitle;
    case "outdated":
      return m.outdated;
  }
}

/** Whether the connection has been down (connecting or reconnecting) for longer than
 *  `graceMs`, re-checked as time passes. */
function useLongDown(state: LiveState | undefined, graceMs: number): boolean {
  const down = state?.status === "connecting" || state?.status === "reconnecting";
  const [long, setLong] = useState(false);
  useEffect(() => {
    setLong(false);
    if (!down) return;
    const t = setTimeout(() => setLong(true), graceMs);
    return () => clearTimeout(t);
  }, [down, graceMs]);
  return long;
}

/** The live connection's state as a small pill, when it is not simply connected. */
export function LiveStatusBadge({
  state,
  role,
  online,
  className = "",
}: {
  state?: LiveState;
  role?: string;
  /** the device's own word on the network (false: offline) */
  online?: boolean;
  className?: string;
}) {
  const longDown = useLongDown(state, VIEWER_DOWN_GRACE_MS);
  const label = liveStatusLabel(state, role, { online, longDown });
  if (!state || !label) return null;
  const m = msgs();
  const fatal = label === "ended" || label === "outdated" || label === "full";
  // The offline line is a sentence people read; the rest are short state words.
  const sentence = label === "offline";
  return (
    <div
      role="status"
      title={label === "outdated" ? state.message : undefined}
      data-live-status={label}
      className={`pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-bg/85 px-3 py-1.5 backdrop-blur ${
        sentence ? "max-w-[min(26rem,calc(100vw-1.5rem))] text-xs leading-snug text-text" : "font-mono text-[11px] uppercase tracking-[0.2em] text-muted"
      } ${className}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${fatal ? "bg-muted" : sentence ? "bg-accent" : "animate-pulse bg-accent"}`} />
      {label === "outdated" ? (
        <button type="button" className="uppercase underline-offset-4 hover:underline" onClick={() => location.reload()}>
          {m.outdated}
        </button>
      ) : (
        labelText(m, label)
      )}
    </div>
  );
}

/** The presenter's words for audience input being refused, or null when it is not. */
export function refusingText(state: LiveState | undefined): string | null {
  if (!state?.refusing || state.status !== "connected") return null;
  return state.refusing === "busy"
    ? "Audience input is paused: the live server is busy. Votes and questions arrive again in a moment."
    : "Audience input is paused: this session is full, so new votes and questions are not arriving. Close the poll or the Q&A so the audience knows.";
}

/** A presenter-only banner while the server refuses audience input. It belongs on the
 *  presenter's own screen, never on the projected deck. */
export function AudienceRefusingNotice({ state, className = "" }: { state?: LiveState; className?: string }) {
  const text = refusingText(state);
  return (
    <div role="status" aria-live="polite" className={className}>
      {text && (
        <div className="flex items-center gap-3 border-b border-accent/40 bg-accent/10 px-4 py-2 text-sm text-text lg:px-8">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-accent" />
          {text}
        </div>
      )}
    </div>
  );
}

/**
 * A viewer's full-screen card for a state that ends the live view: the session is full
 * (with "Try again", which reloads the page and asks for a place again), or the talk
 * has ended (with "Back to the slides", which puts the card away; the slides and what
 * the plugins show stay as the talk left them, and nothing more can be sent).
 */
export function ViewerStateCard({ state, onDismiss }: { state: "full" | "ended"; onDismiss?: () => void }) {
  const m = msgs();
  const full = state === "full";
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="pi-state-title"
      aria-describedby="pi-state-body"
      data-pi-chrome
      data-pi-no-nav
      data-live-card={state}
      className="absolute inset-0 z-50 flex items-center justify-center bg-bg/95 p-6 backdrop-blur-xl"
    >
      <div className="flex w-full max-w-md flex-col items-start gap-4">
        <span aria-hidden className={`h-2 w-2 rounded-full ${full ? "bg-accent" : "bg-muted"}`} />
        <h2 id="pi-state-title" className="text-2xl font-semibold leading-tight text-text sm:text-3xl">
          {full ? m.fullTitle : m.endedTitle}
        </h2>
        <p id="pi-state-body" className="text-base leading-relaxed text-muted">
          {full ? m.fullBody : m.endedBody}
        </p>
        <button
          type="button"
          autoFocus
          onClick={() => (full ? location.reload() : onDismiss?.())}
          className="mt-2 min-h-11 rounded-full border border-border px-5 py-2 text-sm text-text transition hover:border-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {full ? m.tryAgain : m.endedBack}
        </button>
      </div>
    </div>
  );
}
