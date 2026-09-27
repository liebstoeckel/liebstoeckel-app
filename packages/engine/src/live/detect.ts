import type { Role } from "@liebstoeckel/plugin-sdk";

export interface LiveInfo {
  ws: string;
  session: string;
  role: Role;
  token: string;
  participant?: string;
  /** read-only follow-along link, for the in-deck QR */
  viewer?: string;
  /** days the host keeps what the audience writes after the session; absent = not kept */
  audienceInputKeptDays?: number;
}

/** Read the bootstrap the live server injects. Absent → standalone (.html). */
export function detectLive(): LiveInfo | null {
  const g = globalThis as { __LIEBSTOECKEL_LIVE__?: LiveInfo };
  return g.__LIEBSTOECKEL_LIVE__ ?? null;
}
