import { timingSafeEqual } from "node:crypto";

/** Constant-time string compare. Length mismatch short-circuits (the length of a
 *  token isn't the secret); equal-length inputs are compared without early-out. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** The matching account token, or null. Compares against every configured token
 *  (no early return) so timing doesn't reveal which one matched. */
export function matchAccount(tokens: readonly string[], presented: string | null | undefined): string | null {
  if (!presented) return null;
  let found: string | null = null;
  for (const t of tokens) {
    if (safeEqual(t, presented)) found = t;
  }
  return found;
}

/** Extract a `Authorization: Bearer <token>` value, or null. */
export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  const m = h?.match(/^Bearer\s+(.+)$/i);
  return m ? m[1]!.trim() : null;
}
