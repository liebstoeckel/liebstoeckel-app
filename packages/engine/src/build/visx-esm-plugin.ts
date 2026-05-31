import type { BunPlugin } from "bun";
import { dirname } from "node:path";

/**
 * Redirect deep visx CJS imports (`@visx/<pkg>/lib/...`) to the ESM mirror
 * (`@visx/<pkg>/esm/...`).
 *
 * Why: visx's ESM builds default-import their own CJS `lib/` files — e.g.
 * `@visx/grid` does `import Line from "@visx/shape/lib/shapes/Line"`. Those CJS
 * files are correctly marked (`exports.__esModule = true; exports.default = …`),
 * and Bun's *runtime* honors that. But `Bun.build` does NOT honor `__esModule`
 * for CJS default imports (oven-sh/bun#12463 — confirmed unfixed through the
 * 1.4.0 canary): the default import resolves to the module *namespace object*
 * instead of the component. It bundles cleanly and then crashes at render with
 * "Element type is invalid … got: object".
 *
 * This bites the chart registry hard: scaffolded charts are owned source that
 * users/agents extend, pulling in arbitrary visx packages (grid, heatmap,
 * hierarchy, legend, tooltip, …), any of which may use this pattern. Auditing or
 * avoiding packages doesn't scale. The ESM mirror exports real defaults, so
 * redirecting `lib/` → `esm/` sidesteps the broken interop for the whole visx
 * surface in one place. The fallback keeps original resolution if no ESM mirror
 * exists, so the plugin can never make a build fail.
 *
 * Remove once oven-sh/bun#12463 is fixed.
 */
const visxEsmInterop: BunPlugin = {
  name: "visx-esm-interop",
  setup(build) {
    build.onResolve({ filter: /^@visx\/[^/]+\/lib\// }, (args) => {
      const esm = args.path.replace("/lib/", "/esm/");
      const from = args.importer ? dirname(args.importer) : process.cwd();
      try {
        return { path: Bun.resolveSync(esm, from) };
      } catch {
        return undefined; // no ESM mirror → fall back to default resolution
      }
    });
  },
};

export default visxEsmInterop;
