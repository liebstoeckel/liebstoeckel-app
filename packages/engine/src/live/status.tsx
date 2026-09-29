import type { LiveState } from "./protocol";

const TEXT: Record<Exclude<LiveState["status"], "connected">, string> = {
  connecting: "Connecting",
  reconnecting: "Reconnecting",
  ended: "Talk ended",
  outdated: "Out of date, reload",
};

/** Whether a role sees this state: presenters see every problem with the live
 *  connection; the audience only what will not fix itself (a brief reconnect
 *  during a server restart should not flash on every phone in the room), and the
 *  `sending` hint, since it is about what that person just did. */
export function liveStatusVisible(state: LiveState | undefined, role: string | undefined): boolean {
  if (!state) return false;
  if (state.sending && state.status !== "ended" && state.status !== "outdated") return true;
  if (state.status === "connected") return false;
  if (role === "viewer") return state.status === "ended" || state.status === "outdated";
  return true;
}

/** The live connection's state as a small pill, when it is not simply connected. */
export function LiveStatusBadge({ state, role, className = "" }: { state?: LiveState; role?: string; className?: string }) {
  if (!state || !liveStatusVisible(state, role)) return null;
  const fatal = state.status === "ended" || state.status === "outdated";
  // Updates the server refused for coming too fast are resent after a short pause.
  const label = !fatal && state.sending ? "Sending" : state.status === "connected" ? null : TEXT[state.status];
  if (label === null) return null;
  return (
    <div
      role="status"
      title={state.message}
      className={`pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-bg/85 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-muted backdrop-blur ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${fatal ? "bg-muted" : "animate-pulse bg-accent"}`} />
      {state.status === "outdated" ? (
        <button type="button" className="uppercase underline-offset-4 hover:underline" onClick={() => location.reload()}>
          {TEXT.outdated}
        </button>
      ) : (
        label
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
