import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Does this token name a deck the CLI should act on? — a `.html` path, or any
 *  existing path. Used by the `liebstoeckel <deck>` → `live` shorthand and by
 *  `licenses` (which accepts a built `.html` or a source dir). */
export const looksLikeDeck = (s: string | undefined): boolean =>
  !!s && (/\.html?$/i.test(s) || existsSync(resolve(s)));
