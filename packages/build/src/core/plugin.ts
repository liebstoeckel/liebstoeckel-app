// The esbuild plugin that puts esbuild on top of the Files seam: every resolve and
// load goes through the core, in the "vfs" namespace, so esbuild never touches a
// filesystem (there is none in the browser, and in the hosted profile every read
// has to pass the gate) and native and WASM esbuild see exactly the same inputs.
import type { Plugin } from "./esbuild.ts";
import { loadModule, type LoadContext } from "./load.ts";
import { MacroError } from "./macro.ts";
import { dirname, virtualDir } from "./path.ts";
import { CSS_RESOLVE, JS_RESOLVE, type ResolveOptions } from "./resolve.ts";
import { importMetaUrlError } from "./url-check.ts";

export const NS = "vfs";

export interface VfsPluginOptions {
  /** Map a bare specifier to an external URL instead of bundling it. */
  external?: (spec: string, importer: string) => string | null;
  /** Called for every module that was loaded (the module graph). */
  onLoaded?: (path: string) => void;
  /** Resolve conditions for JavaScript (default: the browser's). */
  js?: ResolveOptions;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Imports the build itself writes into a deck's modules: the MDX compiler's provider
 *  import and the JSX runtime. A deck installed by a package manager that links only its
 *  direct dependencies at the top (pnpm, a workspace) need not list them, so where the
 *  deck cannot resolve one it comes from the engine's own dependencies. */
const INJECTED = new Set(["@mdx-js/react", "react/jsx-runtime", "react/jsx-dev-runtime"]);

/** An injected import resolved from the engine's directory, or null. */
export function resolveInjected(resolver: LoadContext["resolver"], spec: string, fromDir: string, js: ResolveOptions = JS_RESOLVE) {
  if (!INJECTED.has(spec)) return null;
  const engine = resolver.resolve("@liebstoeckel/engine", fromDir, js);
  if (!engine || !("path" in engine)) return null;
  return resolver.resolve(spec, dirname(engine.path), js);
}

/** Resolve a specifier the way the core does for a given import kind. */
export function resolveFor(ctx: LoadContext, spec: string, fromDir: string, css: boolean, js: ResolveOptions = JS_RESOLVE) {
  let resolved = ctx.resolver.resolve(spec, fromDir, css ? CSS_RESOLVE : js);
  if (!resolved && !css) resolved = resolveInjected(ctx.resolver, spec, fromDir, js);
  // CSS url() and @import: "x" means "./x" first, then a package (as Bun and esbuild do).
  if (!resolved && css && !/^[./]/.test(spec)) resolved = ctx.resolver.resolve("./" + spec, fromDir, CSS_RESOLVE);
  if (!resolved && css) resolved = ctx.resolver.resolve(spec, fromDir, { ...js, conditions: CSS_RESOLVE.conditions });
  return resolved;
}

export function vfsPlugin(ctx: LoadContext, opts: VfsPluginOptions = {}): Plugin {
  return {
    name: "liebstoeckel",
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.path.startsWith("data:") || /^https?:\/\//.test(args.path)) return { path: args.path, external: true };
        // esbuild hands resolveDir back as a native path (`C:\slides` on Windows).
        const fromDir = args.resolveDir ? virtualDir(args.resolveDir) : args.importer ? dirname(args.importer) : "/";
        const css = args.kind === "import-rule" || args.kind === "url-token" || args.kind === "composes-from";
        const ext = opts.external?.(args.path, args.importer);
        if (ext) return { path: ext, external: true };
        let resolved;
        try {
          resolved = resolveFor(ctx, args.path, fromDir, css, opts.js);
        } catch (err) {
          return { errors: [{ text: message(err) }] };
        }
        if (!resolved) return { errors: [{ text: `Could not resolve "${args.path}"` }] };
        if ("empty" in resolved) return { path: args.path, namespace: "lst-empty" };
        return {
          path: resolved.path,
          namespace: NS,
          sideEffects: ctx.resolver.hasSideEffects(resolved.path) ? undefined : false,
        };
      });
      build.onLoad({ filter: /.*/, namespace: "lst-empty" }, () => ({ contents: "", loader: "js" }));
      build.onLoad({ filter: /.*/, namespace: NS }, async (args) => {
        let result;
        try {
          result = await loadModule(ctx, args.path);
        } catch (err) {
          // The location names the file (and, for the code step, the line), so the
          // text does not repeat it.
          const text = message(err).replace(new RegExp(`^${args.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:?\\s+`), "");
          const at = err instanceof MacroError && err.line ? { line: err.line, column: err.column ?? 0 } : {};
          return { errors: [{ text, location: { file: args.path, ...at } }] };
        }
        if (!result) return { errors: [{ text: `Could not read ${args.path}` }] };
        const urlError = await importMetaUrlError(ctx, build.esbuild, args.path, result);
        if (urlError) return { errors: [urlError] };
        opts.onLoaded?.(args.path);
        return { contents: result.contents, loader: result.loader, resolveDir: dirname(args.path) };
      });
    },
  };
}
