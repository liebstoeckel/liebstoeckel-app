// The hosted profile's stylesheet rule, over the Files seam. Tailwind resolves
// @import/@source/@reference itself and would load JavaScript for @plugin and
// @config, so a deck's (or a package's) stylesheet is read before Tailwind sees it:
// no directive that loads code, and nothing from the network or from outside the
// stylesheet's own scope (the deck, or the package it ships in).
import type { Files } from "./files.ts";
import { dirname, join } from "./path.ts";

const REMOTE = /^(https?:)?\/\//i;

const within = (path: string, root: string) => path === root || path.startsWith(root + "/");

/** Why a stylesheet cannot be used, or null. `file` and `scope` are virtual paths. */
export function cssProblem(files: Files, css: string, file: string, scope: string): string | null {
  // Comments could hide a directive from a naive reader but not from Tailwind.
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const code = /@(plugin|config)\b/.exec(text);
  if (code) return `uses @${code[1]}, which loads code at build time`;
  for (const m of text.matchAll(/@(import|source|reference)\s+(?:url\(\s*)?["']([^"']+)["']/g)) {
    const target = m[2]!;
    if (REMOTE.test(target)) return `loads ${target} from the network (@${m[1]})`;
    if (target.startsWith(".") || target.startsWith("/")) {
      const p = target.startsWith("/") ? target : join(dirname(file), target);
      if (!within(files.realpath(p), files.realpath(scope))) return `reaches outside the deck (@${m[1]} ${target})`;
    }
  }
  return null;
}
