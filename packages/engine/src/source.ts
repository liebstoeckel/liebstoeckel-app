import { SOURCE_ATTR } from "./build/source-attr";

/** True when the loaded deck embeds its own recoverable source (the default build) —
 *  i.e. `liebstoeckel eject` would work on this file. Lets runtime UI offer an
 *  "edit this deck" affordance only when it'll actually succeed (a deck built
 *  `--no-inline-package` carries no source). No DOM (capture / SSR) → false. */
export function hasEmbeddedSource(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.querySelector(`script[${SOURCE_ATTR}]`);
}
