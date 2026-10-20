// @liebstoeckel/build/dev: the deck dev server (unbundled modules, prebuilt
// dependencies, hot reload with React Fast Refresh, the error overlay).
export { createDeckDev, type DeckDev, type DeckDevOptions, type WsData } from "./server.ts";
export { prebuildDeps, type Prebuilt } from "./deps.ts";
