import { test, expect, describe } from "bun:test";
import { join } from "node:path";
import { REGISTRY_ROOT } from "./index.ts";
import { validateItem, type RegistryIndex, type RegistryItem } from "./schema.ts";

// The generated registry data is the agent-facing API (ADR 0045). These tests are the
// regression guard against `meta` drifting away from the source it documents.

const index = (await Bun.file(join(REGISTRY_ROOT, "registry.json")).json()) as RegistryIndex;
const items = await Promise.all(
  index.items.map((i) => Bun.file(join(REGISTRY_ROOT, "items", `${i.name}.json`)).json() as Promise<RegistryItem>),
);

describe("registry item agent-metadata (ADR 0045)", () => {
  test("registry.json is non-empty and every entry has an item file", () => {
    expect(index.items.length).toBeGreaterThan(0);
    expect(items.length).toBe(index.items.length);
  });

  test("every item validates against the contract", () => {
    for (const it of items) expect(() => validateItem(it)).not.toThrow();
  });

  test("every item carries meta.exports and a copy-paste example", () => {
    for (const it of items) {
      expect(it.meta, `${it.name} missing meta`).toBeDefined();
      expect(it.meta!.exports, `${it.name} missing meta.exports`).toBeTruthy();
      expect(it.meta!.example, `${it.name} missing meta.example`).toBeTruthy();
    }
  });

  test("every chart advertises a dataShape so an agent can wire data without reading source", () => {
    for (const it of items.filter((i) => i.type === "registry:chart")) {
      expect(it.meta!.dataShape, `${it.name} (chart) missing meta.dataShape`).toBeTruthy();
    }
  });

  test("meta.exports names a real exported symbol in the item's source file", async () => {
    for (const it of items) {
      const src = await Bun.file(join(REGISTRY_ROOT, it.files[0]!.path)).text();
      // first export listed (e.g. "BarChart", or "BrandAxisBottom, BrandAxisLeft")
      const first = it.meta!.exports!.split(",")[0]!.trim();
      expect(src, `${it.name}: source does not export ${first}`).toContain(`export function ${first}`);
    }
  });
});
