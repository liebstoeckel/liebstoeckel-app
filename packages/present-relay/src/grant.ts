import { createHmac, timingSafeEqual } from "node:crypto";

// Signed control↔relay grants (ADR 0061). For hosted live presenting the control
// plane owns the session and authorizes relay actions by minting a short-lived,
// HMAC-signed grant over a shared secret; the relay verifies it **statelessly** — it
// never calls back to the control plane per connection. Same trust class as the
// static relay account token (auth.ts), but scoped to one session + role + expiry.

export interface Grant {
  /** the live session this grant is scoped to (the relay's session id / audience slug). */
  session: string;
  /** the role/action this grant confers — e.g. "presenter" | "runner" | "audience"
   *  for a peer connection, or "create" to mint a session. Interpreted by the relay. */
  role: string;
  /** optional capability scopes, reserved for finer-grained authorization. */
  scopes?: string[];
  /** expiry, unix epoch milliseconds. */
  exp: number;
}

const b64url = (b: Buffer): string => b.toString("base64url");
const sign = (data: string, secret: string): Buffer => createHmac("sha256", secret).update(data).digest();

/** Mint a signed grant: `<base64url(payload)>.<base64url(hmacSHA256)>`. */
export function mintGrant(grant: Grant, secret: string): string {
  const payload = b64url(Buffer.from(JSON.stringify(grant), "utf8"));
  return `${payload}.${b64url(sign(payload, secret))}`;
}

/**
 * Verify and decode a grant. Returns the payload, or null if it is malformed,
 * tampered, signed with the wrong secret, or expired (`exp <= now`, unix ms). The
 * signature compare is constant-time. Fails closed on any error.
 */
export function verifyGrant(token: string | null | undefined, secret: string, now: number): Grant | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  let expected: string;
  try {
    expected = b64url(sign(payload, secret));
  } catch {
    return null;
  }
  const a = Buffer.from(mac, "utf8");
  const b = Buffer.from(expected, "utf8");
  // Length mismatch short-circuits (the mac's length isn't the secret); equal-length
  // inputs are compared without early-out.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let grant: Grant;
  try {
    grant = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Grant;
  } catch {
    return null;
  }
  if (!grant || typeof grant.session !== "string" || typeof grant.role !== "string") return null;
  if (typeof grant.exp !== "number" || grant.exp <= now) return null;
  return grant;
}
