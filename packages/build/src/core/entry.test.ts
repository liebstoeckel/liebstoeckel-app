// `@liebstoeckel/build/core` is for hosts that are neither Bun nor Node (a browser
// worker). Bundling the entry for the browser, its dependencies included, fails on
// any Node builtin or `bun` import anywhere in its graph; the bundle must not
// reach for Bun's globals either.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as esbuild from "esbuild";

const PKG = resolve(import.meta.dir, "../..");

test("the core entry is exported and bundles for the browser with no Bun or Node API", async () => {
  const pkg = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")) as { exports: Record<string, string> };
  expect(pkg.exports["./core"]).toBe("./src/core/index.ts");
  const result = await esbuild.build({
    entryPoints: [join(PKG, pkg.exports["./core"]!)],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    // A worker has no DOM: packages' worker builds where they have one.
    conditions: ["worker"],
    logLevel: "silent",
  });
  expect(result.errors).toEqual([]);
  const js = result.outputFiles[0]!.text;
  // Booleans, so a failure does not print the whole bundle.
  expect(/\bDevCore\b/.test(js)).toBe(true);
  expect(js.match(/\bBun\.\w+/g)).toBeNull();
  expect(js.match(/\brequire\(["'](node:)?(fs|path|os|child_process|url|module)["']\)/g)).toBeNull();
}, 60_000);
