// Readiness that turns false the moment shutdown starts, so no new traffic is
// routed to a pod that is flushing and handing over.

export interface Readiness {
  ready(): boolean;
  markReady(): void;
  markShuttingDown(): void;
  /** A `/readyz` response. */
  response(): Response;
}

export function createReadiness(): Readiness {
  let state: "starting" | "ready" | "stopping" = "starting";
  return {
    ready: () => state === "ready",
    markReady: () => {
      if (state === "starting") state = "ready";
    },
    markShuttingDown: () => {
      state = "stopping";
    },
    response: () => new Response(state, { status: state === "ready" ? 200 : 503 }),
  };
}
