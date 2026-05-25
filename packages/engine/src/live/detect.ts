import type { Role } from "@present-it/plugin-sdk";

export interface LiveInfo {
  ws: string;
  session: string;
  role: Role;
  token: string;
  participant?: string;
  /** read-only follow-along link, for the in-deck QR */
  viewer?: string;
}

/** Read the bootstrap the live server injects. Absent → standalone (.html). */
export function detectLive(): LiveInfo | null {
  const g = globalThis as { __PRESENT_IT_LIVE__?: LiveInfo };
  return g.__PRESENT_IT_LIVE__ ?? null;
}
