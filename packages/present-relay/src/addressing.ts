// Per-pod public addressing for the relay StatefulSet (ADR 0071 §3 / ticket 0016).
// Each relay pod owns a live session's Yjs Hub in memory, so the control plane pins a
// session to one pod and hands audiences a per-pod host (`liebstoeckel-relayNNN…`). A
// StatefulSet shares a single pod template, so a pod can't be handed a static per-pod
// PRESENT_RELAY_PUBLIC_URL — instead it derives its OWN base from its ordinal (via the
// downward-API POD_NAME) plus a host template. Pure + unit-tested; no I/O.

/** Extract the StatefulSet ordinal from a pod name (`liebstoeckel-relay-7` → 7). */
export function podOrdinal(podName: string | undefined): number | null {
  if (!podName) return null;
  const m = podName.match(/-(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Zero-pad an ordinal to the relay's NNN host convention (7 → "007"); never truncates. */
export function ordinalTag(ordinal: number, width = 3): string {
  return String(ordinal).padStart(width, "0");
}

/**
 * Derive a relay pod's own public base URL from its pod name + a host template.
 * `liebstoeckel-relay-7` + `https://liebstoeckel-relayNNN.int.limond.de`
 *   → `https://liebstoeckel-relay007.int.limond.de` (trailing slashes trimmed).
 * Returns undefined when it can't (no pod name / no `NNN` template / unparseable
 * ordinal) so the caller falls back to an explicit PRESENT_RELAY_PUBLIC_URL or the
 * request-derived origin.
 */
export function relayPublicBaseFromPod(
  podName: string | undefined,
  template: string | undefined,
): string | undefined {
  const ord = podOrdinal(podName);
  if (ord === null || !template || !template.includes("NNN")) return undefined;
  return template.replace(/NNN/g, ordinalTag(ord)).replace(/\/+$/, "");
}
