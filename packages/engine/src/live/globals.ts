import type { PluginDef } from "@liebstoeckel/plugin-sdk";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Registry = Record<string, PluginDef<any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GlobalEntry = { id: string; def: PluginDef<any> };

/** The registered plugins that expose a deck-wide `client.global` namespace, in
 *  registration order (the order the deck listed them in `plugins={[…]}`). The
 *  engine mounts one set of global surfaces per entry. See (internal ADR). */
export function globalPlugins(registry: Registry): GlobalEntry[] {
  return Object.entries(registry)
    .filter(([, def]) => def.client.global)
    .map(([id, def]) => ({ id, def }));
}
