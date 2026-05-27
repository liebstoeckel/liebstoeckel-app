import { liebstoeckel } from "./liebstoeckel";
import { acme } from "./acme";
import { sunset } from "./sunset";
import { nocturne } from "./nocturne";

/** All brands shipped in this repo; `gen.ts` emits CSS for each.
 *  `liebstoeckel` is the house brand (and scaffolding default). */
export const brands = [liebstoeckel, acme, sunset, nocturne];
export { liebstoeckel, acme, sunset, nocturne };
