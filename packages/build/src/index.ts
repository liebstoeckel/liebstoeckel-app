// @liebstoeckel/build: the build core every deck build and dev server runs on.
// `bundleDeck` writes one self-contained .html, `checkDeck` answers "does it
// build?", `collectDeckLicenses` reports the bundle's third-party packages. The
// dev server lives at `@liebstoeckel/build/dev`.
export {
  bundleDeck,
  checkDeck,
  collectDeckLicenses,
  buildPluginManifest,
  buildServerBundle,
  DeckBuildError,
  DEFAULT_SELF_NOTICE,
  type BundleOptions,
  type BundleResult,
  type BuildMessage,
  type DeckDiagnostic,
  type Generator,
} from "./deck.ts";
export { LOCAL, bunfigProblems, isScaffoldBunPlugin, BUN_PLUGIN_WAY_OUT, type Profile, type HostedSettings, type ToolingProblem } from "./profile.ts";
export { stampGenerator, bundledEngineVersion, deckPluginWarnings } from "./stamp.ts";
export { stripDevMode } from "./core/html.ts";
