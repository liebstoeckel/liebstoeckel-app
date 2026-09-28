import { defineCommand } from "citty";
import { join } from "node:path";
import { REGISTRY_ROOT } from "@liebstoeckel/registry";
import { validateItem, type RegistryIndex, type RegistryItem } from "@liebstoeckel/registry/schema";
import { CliError, reporting, usageError, wantsJson } from "./output";

/**
 * `liebstoeckel registry list|view`, agent-readable discovery over the bundled
 * default registry ((internal ADR)). Output is JSON when `--json` is passed OR when stdout
 * is not a TTY (so an agent piping the command always gets structured data), and a
 * compact human view on an interactive terminal.
 *
 * Third-party / namespaced registries ((internal ADR)) are not resolved here yet, this
 * reads the bundled `@liebstoeckel` registry directly.
 */

const readIndex = (): Promise<RegistryIndex> =>
  Bun.file(join(REGISTRY_ROOT, "registry.json")).json() as Promise<RegistryIndex>;

async function readItem(name: string): Promise<RegistryItem> {
  const f = Bun.file(join(REGISTRY_ROOT, "items", `${name}.json`));
  if (!(await f.exists())) {
    throw new CliError(`registry item "${name}" not found`, { code: "not_found", hint: "try `liebstoeckel registry list`" });
  }
  const item = (await f.json()) as RegistryItem;
  validateItem(item);
  return item;
}

/** A catalog row enriched with the headline agent-facing meta, so `list --json` gives
 *  the agent the whole catalog + data shapes in a single call (fewer round-trips). */
interface CatalogRow {
  name: string;
  type: string;
  description?: string;
  exports?: string;
  dataShape?: string;
}

async function catalog(): Promise<CatalogRow[]> {
  const index = await readIndex();
  return Promise.all(
    index.items.map(async (i) => {
      const item = await readItem(i.name);
      return {
        name: i.name,
        type: i.type.replace(/^registry:/, ""),
        description: i.description,
        exports: item.meta?.exports,
        dataShape: item.meta?.dataShape,
      };
    }),
  );
}

function printList(rows: CatalogRow[]): void {
  console.log(`\n${rows.length} registry items (\`liebstoeckel add <name>\` to scaffold):\n`);
  const w = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) {
    console.log(`  ${r.name.padEnd(w)}  ${r.type.padEnd(9)} ${r.dataShape ? `data: ${r.dataShape}` : r.description ?? ""}`);
  }
  console.log(`\n  view one: liebstoeckel registry view <name>\n`);
}

function printItem(item: RegistryItem): void {
  const m = item.meta ?? {};
  console.log(`\n${item.name}  (${item.type.replace(/^registry:/, "")})`);
  if (item.description) console.log(`  ${item.description}`);
  if (m.exports) console.log(`\n  exports:    ${m.exports}`);
  if (m.props) console.log(`  props:      ${m.props}`);
  if (m.dataShape) console.log(`  data:       ${m.dataShape}`);
  if (m.example) console.log(`  example:    ${m.example}`);
  if (item.dependencies?.length) console.log(`\n  npm deps:   ${item.dependencies.join(", ")}`);
  if (item.registryDependencies?.length) console.log(`  also adds:  ${item.registryDependencies.join(", ")}`);
  console.log(`\n  scaffold:   liebstoeckel add ${item.name}\n`);
}

const registryListCommand = defineCommand({
  meta: { name: "list", description: "list the chart/component registry" },
  args: { json: { type: "boolean", description: "machine-readable JSON (default when piped)" } },
  run({ args }) {
    const json = wantsJson(args.json);
    return reporting(json, async () => {
      const rows = await catalog();
      if (json) console.log(JSON.stringify(rows, null, 2));
      else printList(rows);
    });
  },
});

const registryViewCommand = defineCommand({
  meta: { name: "view", description: "show one registry item's details" },
  args: {
    name: { type: "positional", required: false, description: "registry item name", valueHint: "name" },
    json: { type: "boolean", description: "machine-readable JSON (default when piped)" },
  },
  run({ args }) {
    const json = wantsJson(args.json);
    return reporting(json, async () => {
      if (!args.name) throw usageError("no item given: liebstoeckel registry view <name>", "list them: liebstoeckel registry list");
      const item = await readItem(args.name);
      if (json) console.log(JSON.stringify(item, null, 2));
      else printItem(item);
    });
  },
});

/** `liebstoeckel registry list|view`, agent-readable discovery ((internal ADR)). */
export const registryCommand = defineCommand({
  meta: { name: "registry", description: "browse the chart/component registry (JSON for agents)" },
  subCommands: { list: registryListCommand, view: registryViewCommand },
  default: "list",
});
