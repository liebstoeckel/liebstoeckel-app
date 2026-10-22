// Motion that costs extra draw calls or per-frame work sits behind a switch.
// "auto" turns it on where it is cheap: a mouse or trackpad, at least four
// cores, and no request for reduced motion. `?life=on` or `?life=off` in the
// address overrides it, for checking either way on any device.

export type Switch = "auto" | "on" | "off";

/** The audience's idle life: every head its own object, turning now and then. */
export const AUDIENCE_LIFE: Switch = "auto";

export function audienceLife(): boolean {
  let s: Switch = AUDIENCE_LIFE;
  try {
    const q = new URLSearchParams(location.search).get("life");
    if (q === "on" || q === "off") s = q;
  } catch {
    // no location (a capture surface): keep the default
  }
  if (s !== "auto") return s === "on";
  const cores = navigator.hardwareConcurrency ?? 2;
  return matchMedia("(pointer: fine)").matches && cores >= 4 && !matchMedia("(prefers-reduced-motion: reduce)").matches;
}
