/**
 * Bundle-verification, the real bundler-safety gate (replaces the old static
 * `BANNED_NPM_DEPS` denylist). An item is "bundler-safe" iff its source actually
 * bundles with the deck's `target:"browser"` + `minify` config.
 *
 * This catches the true failure class, e.g. a *default* import of a CJS-origin
 * package whose ESM entry has no default export (`import X from "@visx/text"`),
 * which fails loudly at build time, for ANY package, not a memorized list, and
 * stays correct as Bun's CJS/ESM interop evolves. See (internal ADR) / 0041.
 */

export interface BundleVerifyResult {
  success: boolean;
  logs: string[];
}

/**
 * Bundle the given source files (absolute paths) as browser entrypoints, mirroring
 * the deck build (`buildDeck.ts`). In-memory, no `outdir`. Bare deps resolve via
 * the nearest `node_modules`, so call with paths inside the repo/deck tree.
 */
export async function verifyBundles(absFiles: string[]): Promise<BundleVerifyResult> {
  try {
    const result = await Bun.build({
      entrypoints: absFiles,
      target: "browser",
      minify: true,
    });
    return { success: result.success, logs: result.logs.map((l) => String(l)) };
  } catch (e) {
    // Bun.build throws (AggregateError) on resolution/interop failures, e.g. a
    // default import of a package whose ESM entry has no default export. Treat a
    // thrown build error as a failed verification, surfacing the messages.
    const errs = (e as AggregateError)?.errors;
    return { success: false, logs: Array.isArray(errs) ? errs.map((x) => String(x)) : [String(e)] };
  }
}
