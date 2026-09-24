import type { LiveState } from "./protocol";

const TEXT: Record<Exclude<LiveState["status"], "connected">, string> = {
  connecting: "Connecting",
  reconnecting: "Reconnecting",
  ended: "Talk ended",
  outdated: "Out of date, reload",
};

/** Whether a role sees this state: presenters see every problem with the live
 *  connection; the audience only what will not fix itself (a brief reconnect
 *  during a server restart should not flash on every phone in the room). */
export function liveStatusVisible(state: LiveState | undefined, role: string | undefined): boolean {
  if (!state || state.status === "connected") return false;
  if (role === "viewer") return state.status === "ended" || state.status === "outdated";
  return true;
}

/** The live connection's state as a small pill, when it is not simply connected. */
export function LiveStatusBadge({ state, role, className = "" }: { state?: LiveState; role?: string; className?: string }) {
  if (!state || !liveStatusVisible(state, role) || state.status === "connected") return null;
  const fatal = state.status === "ended" || state.status === "outdated";
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
        TEXT[state.status]
      )}
    </div>
  );
}
