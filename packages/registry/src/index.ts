import { fileURLToPath } from "node:url";

export * from "./schema.ts";

/**
 * Absolute path to this registry's root — the directory holding `registry.json`,
 * `items/`, and `files/`. The CLI reads the registry as a file tree from here (the
 * local/default transport, (internal ADR)); an npm/git carrier is read the same way once
 * installed to a temp dir.
 */
export const REGISTRY_ROOT = fileURLToPath(new URL("../", import.meta.url));
