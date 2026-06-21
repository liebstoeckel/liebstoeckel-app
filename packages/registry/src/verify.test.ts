import { test, expect, describe } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { REGISTRY_ROOT, type RegistryItem, type RegistryIndex } from "./index.ts";
import { verifyBundles } from "./verify.ts";

async function itemFiles(name: string): Promise<string[]> {
  const item = (await Bun.file(join(REGISTRY_ROOT, "items", `${name}.json`)).json()) as RegistryItem;
  return item.files.map((f) => join(REGISTRY_ROOT, f.path));
}

// Whether a set of files bundles, resilient to a TRANSIENT Bun.build hiccup under
// heavy concurrent load (memory/CPU pressure during the full suite). The property
// is deterministic, so a real failure fails both attempts, only an infra hiccup
// is absorbed; genuine bundle breakage is still caught.
async function bundlesOk(files: string[]): Promise<boolean> {
  let r = await verifyBundles(files);
  if (!r.success) {
    const first = r.logs.join("\n");
    r = await verifyBundles(files);
    if (!r.success) console.error(first || r.logs.join("\n"));
  }
  return r.success;
}

// Bundling is CPU-heavy; the default 5s timeout is too tight under load.
const BUILD_TIMEOUT = 60_000;

describe("registry bundle-safety (the gate that replaced BANNED_NPM_DEPS)", () => {
  test(
    "every item in registry.json bundles browser+minify",
    async () => {
      const index = (await Bun.file(join(REGISTRY_ROOT, "registry.json")).json()) as RegistryIndex;
      const files: string[] = [];
      for (const it of index.items) files.push(...(await itemFiles(it.name)));
      expect(await bundlesOk(files)).toBe(true);
    },
    BUILD_TIMEOUT,
  );

  test(
    "named imports of @visx/axis + @visx/text DO bundle (the ban was stale)",
    async () => {
      const dir = mkdtempSync(join(REGISTRY_ROOT, ".verify-"));
      try {
        const ok = join(dir, "Ok.tsx");
        writeFileSync(
          ok,
          `import { AxisBottom } from "@visx/axis";\nimport { Text } from "@visx/text";\nexport const X = { AxisBottom, Text };\n`,
        );
        expect(await bundlesOk([ok])).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    BUILD_TIMEOUT,
  );

  test(
    "the real hazard, a default import of @visx/text, is caught at build",
    async () => {
      const dir = mkdtempSync(join(REGISTRY_ROOT, ".verify-"));
      try {
        const bad = join(dir, "Bad.tsx");
        writeFileSync(bad, `import Text from "@visx/text";\nexport const X = Text;\n`);
        // Negative case: deterministically fails (a default import with no default
        // export), so no retry, assert it's caught with a clear message.
        const r = await verifyBundles([bad]);
        expect(r.success).toBe(false);
        expect(r.logs.join("\n")).toMatch(/default/i);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    BUILD_TIMEOUT,
  );
});
