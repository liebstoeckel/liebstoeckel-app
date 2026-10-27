// The hosted profile's rules over the Files seam, defined once for every host: the
// native one (the preview and the assistant's check on a server) and a browser
// worker. Three rules on top of the local profile:
//
// - every read goes through the gate: the deck, the trusted trees and the deck's
//   unpacked packages, nothing else;
// - a deck's (or a package's) stylesheet is checked before anything reads it: no
//   directive that loads code, nothing from the network or outside its own scope;
// - the deck's own package.json cannot redirect imports (`exports`, `imports`,
//   `browser`); only packages may.
//
// On a server the gate is a security boundary. In a browser it keeps the same
// rules and the same errors as the server's build, so a deck that builds in the
// editor builds on the server too; it is not what protects anything there, since a
// browser host holds no files beyond the ones it was given.
import { cssProblem } from "./css-gate.ts";
import { gatedFiles, type Files } from "./files.ts";
import type { ResolverOptions } from "./resolve.ts";

export interface HostedTreeSettings {
  /** The deck's folder (virtual path); its subfolders are its files. */
  deckRoot: string;
  /** Trusted trees (virtual paths): the framework packages and node_modules. */
  trustedRoots: string[];
  /** Where the deck's third-party packages are unpacked (virtual path). */
  packagesRoot?: string;
}

/** The Files and resolver settings of the hosted profile over a tree. */
export function hostedTree(files: Files, settings: HostedTreeSettings): { files: Files; resolver: ResolverOptions } {
  const { deckRoot, packagesRoot } = settings;
  const gated = gatedFiles(files, {
    deckRoot,
    trustedRoots: settings.trustedRoots,
    packagesRoot,
    cssProblem: (css, file, scope) => cssProblem(files, css, file, scope),
  });
  // The deck's own package.json (and any under it outside node_modules) cannot redirect.
  const inDeck = (dir: string) => (dir === deckRoot || dir.startsWith(deckRoot + "/")) && !dir.includes("/node_modules/") && !(packagesRoot && dir.startsWith(packagesRoot + "/"));
  return { files: gated, resolver: { redirects: (dir) => !inDeck(dir) } };
}
