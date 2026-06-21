import { test, expect, describe } from "bun:test";
import { resolveScaffold, localTransport, stripCategory, sameOrigin, type RegistryTransport } from "./add";
import { validateItem, assertSafeTarget } from "@liebstoeckel/registry/schema";
import { REGISTRY_ROOT } from "@liebstoeckel/registry";

/** In-memory transport, keeps the resolver tests pure and network-free ((internal ADR)). */
function fakeTransport(
  items: Record<string, unknown>,
  files: Record<string, string>,
): RegistryTransport {
  return {
    id: "@test",
    async readItem(name) {
      if (!(name in items)) throw new Error(`not found: ${name}`);
      return items[name];
    },
    async readFile(path) {
      if (!(path in files)) throw new Error(`no file: ${path}`);
      return files[path]!;
    },
  };
}

describe("resolveScaffold", () => {
  test("resolves an item + its registryDependencies, deps-first and deduped", async () => {
    const items = {
      chart: {
        name: "chart", type: "registry:chart", version: "1.0.0",
        dependencies: ["@visx/scale"], registryDependencies: ["hook"],
        files: [{ path: "files/Chart.tsx", type: "registry:chart", target: "charts/Chart.tsx" }],
      },
      hook: {
        name: "hook", type: "registry:hook", version: "1.0.0",
        files: [{ path: "files/hook.ts", type: "registry:hook", target: "charts/hook.ts" }],
      },
    };
    const files = { "files/Chart.tsx": "chart-src", "files/hook.ts": "hook-src" };

    const plan = await resolveScaffold(fakeTransport(items, files), ["chart"]);
    expect(plan.items).toEqual(["hook", "chart"]); // dependency before dependent
    expect(plan.files.map((f) => f.target)).toEqual(["charts/hook.ts", "charts/Chart.tsx"]);
    expect(plan.files.find((f) => f.target === "charts/Chart.tsx")?.content).toBe("chart-src");
    expect(plan.npmDependencies).toEqual(["@visx/scale"]);
  });

  test("dedupes a registryDependency shared by two items", async () => {
    const mk = (name: string) => ({
      name, type: "registry:chart", version: "1.0.0", registryDependencies: ["shared"],
      files: [{ path: name, type: "registry:chart", target: `charts/${name}.tsx` }],
    });
    const items = {
      a: mk("a"),
      b: mk("b"),
      shared: { name: "shared", type: "registry:hook", version: "1.0.0", files: [{ path: "s", type: "registry:hook", target: "charts/s.ts" }] },
    };
    const plan = await resolveScaffold(fakeTransport(items, { a: "A", b: "B", s: "S" }), ["a", "b"]);
    expect(plan.items.filter((n) => n === "shared")).toHaveLength(1);
    expect(plan.files.filter((f) => f.target === "charts/s.ts")).toHaveLength(1);
  });

  test("allows @visx/axis as a dependency (bundler safety is verified by bundling, not a denylist)", async () => {
    const items = {
      withAxis: {
        name: "withAxis", type: "registry:chart", version: "1.0.0", dependencies: ["@visx/axis"],
        files: [{ path: "x", type: "registry:chart", target: "charts/x.tsx" }],
      },
    };
    const plan = await resolveScaffold(fakeTransport(items, { x: "x" }), ["withAxis"]);
    expect(plan.npmDependencies).toContain("@visx/axis");
  });
});

describe("stripCategory", () => {
  test("strips a singular category keyword before an item name", () => {
    expect(stripCategory(["chart", "bar-chart"])).toEqual(["bar-chart"]);
    expect(stripCategory(["hook", "use-brand-colors"])).toEqual(["use-brand-colors"]);
    expect(stripCategory(["chart", "bar-chart", "line-chart"])).toEqual(["bar-chart", "line-chart"]);
  });

  test("does NOT strip a plural/non-category first word (it's an item name)", () => {
    // "charts" is not a category, `add charts bar-chart` keeps both, so the resolver
    // reports the real "item charts not found" rather than silently dropping it.
    expect(stripCategory(["charts", "bar-chart"])).toEqual(["charts", "bar-chart"]);
  });

  test("leaves a lone item (or a lone category-looking word) untouched", () => {
    expect(stripCategory(["bar-chart"])).toEqual(["bar-chart"]);
    expect(stripCategory(["chart"])).toEqual(["chart"]); // no item after it → treat as the item
  });
});

describe("schema guards", () => {
  test("assertSafeTarget rejects path escapes", () => {
    expect(() => assertSafeTarget("../escape.ts")).toThrow();
    expect(() => assertSafeTarget("/abs/path.ts")).toThrow();
    expect(() => assertSafeTarget("charts/ok.tsx")).not.toThrow();
  });

  test("validateItem rejects bad types and unsafe targets", () => {
    expect(() => validateItem({ name: "x", type: "nope", version: "1", files: [{ path: "a", target: "b" }] })).toThrow(/invalid type/);
    expect(() =>
      validateItem({
        name: "x", type: "registry:chart", version: "1",
        files: [{ path: "a", type: "registry:chart", target: "../escape.ts" }],
      }),
    ).toThrow(/unsafe/);
  });
});

describe("bundled default registry", () => {
  test("hello-chart resolves end-to-end and pulls use-brand-colors", async () => {
    const plan = await resolveScaffold(localTransport(REGISTRY_ROOT), ["hello-chart"]);
    expect(plan.items).toEqual(expect.arrayContaining(["use-brand-colors", "hello-chart"]));
    expect(plan.files.map((f) => f.target)).toEqual(
      expect.arrayContaining(["charts/useBrandColors.ts", "charts/HelloChart.tsx"]),
    );
    expect(plan.npmDependencies).toContain("@visx/scale");
    for (const f of plan.files) expect(f.content.length).toBeGreaterThan(0);
  });
});

describe("sameOrigin (registry token-attach guard)", () => {
  const api = "https://api.liebstoeckel.app";
  test("attaches to the exact origin (trailing slash / path ignored)", () => {
    expect(sameOrigin("https://api.liebstoeckel.app/items/x.json", api)).toBe(true);
    expect(sameOrigin("https://api.liebstoeckel.app", api)).toBe(true);
  });
  test("rejects a sibling-suffix host", () => {
    expect(sameOrigin("https://api.liebstoeckel.app.attacker.com/", api)).toBe(false);
    expect(sameOrigin("https://api.liebstoeckel.appattacker.com/", api)).toBe(false);
  });
  test("rejects a userinfo-confusion host", () => {
    expect(sameOrigin("https://api.liebstoeckel.app@attacker.com/", api)).toBe(false);
  });
  test("rejects a scheme downgrade", () => {
    expect(sameOrigin("http://api.liebstoeckel.app/", api)).toBe(false);
  });
  test("fails closed on an unparseable URL", () => {
    expect(sameOrigin("not a url", api)).toBe(false);
  });
});
