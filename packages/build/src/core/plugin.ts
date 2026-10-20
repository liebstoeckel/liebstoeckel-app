// The esbuild plugin that puts esbuild on top of the Files seam: every resolve and
// load goes through the core, in the "vfs" namespace, so esbuild never touches a
// filesystem (there is none in the browser, and in the hosted profile every read
// has to pass the gate) and native and WASM esbuild see exactly the same inputs.
import type { Plugin } from "./esbuild.ts";
import { loadModule, type LoadContext } from "./load.ts";
import { dirname, virtualDir } from "./path.ts";
import { CSS_RESOLVE, JS_RESOLVE, type ResolveOptions } from "./resolve.ts";

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

/** Resolve a specifier the way the core does for a given import kind. */
export function resolveFor(ctx: LoadContext, spec: string, fromDir: string, css: boolean, js: ResolveOptions = JS_RESOLVE) {
  let resolved = ctx.resolver.resolve(spec, fromDir, css ? CSS_RESOLVE : js);
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
          return { errors: [{ text: message(err), location: { file: args.path } }] };
        }
        if (!result) return { errors: [{ text: `Could not read ${args.path}` }] };
        opts.onLoaded?.(args.path);
        return { contents: result.contents, loader: result.loader, resolveDir: dirname(args.path) };
      });
    },
  };
}
