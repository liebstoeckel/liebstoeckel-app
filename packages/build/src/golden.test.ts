// Golden builds: every deck under presentations/ (and the release tests' fixture) builds to
// the same bytes twice, from a recorded snapshot of its inputs, and from the same
// tree mounted somewhere else, so the output depends on the deck and nothing about
// the machine or the checkout's location. One full build with every extra (plugin
// manifest, licenses, source package, stamp) is checked the same way. And the dev
// core serves every deck's modules and stylesheets byte for byte the same on native
// esbuild and on esbuild-wasm, which is what a browser runs it on.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import * as wasm from "esbuild-wasm/esm/browser.js";
import { buildDeck } from "./core/build.ts";
import { DevCore } from "./core/dev.ts";
import type { Esbuild } from "./core/esbuild.ts";
import { MemoryFiles, readText, recordingFiles, type Files } from "./core/files.ts";
import { htmlEntries } from "./core/html.ts";
import { dirname, join as vjoin } from "./core/path.ts";
import { bundleDeck } from "./deck.ts";
import { DiskFiles, projectRoot } from "./disk.ts";
import { esbuild } from "./esbuild-native.ts";
import { deckTree } from "./profile.ts";

const repo = resolve(import.meta.dir, "../../..");
const decks = [
  ...readdirSync(join(repo, "presentations"))
    .filter((d) => !d.startsWith(".") && !d.startsWith("_"))
    .map((d) => `presentations/${d}`),
  "packages/release-tests/fixture",
];

/** The same tree under another virtual root, as if the checkout lived elsewhere. */
function mounted(inner: Files, at: string): Files {
  const strip = (p: string) => (p === at ? "/" : p.startsWith(at + "/") ? p.slice(at.length) : null);
  return {
    stat: (p) => {
      const s = strip(p);
      if (s !== null) return inner.stat(s);
      return at.startsWith(p === "/" ? "/" : p + "/") ? "dir" : null;
    },
    read: (p) => {
      const s = strip(p);
      return s === null ? null : inner.read(s);
    },
    realpath: (p) => {
      const s = strip(p);
      if (s === null) return p;
      const r = inner.realpath(s);
      return r === "/" ? at : at + r;
    },
  };
}

describe("golden builds", () => {
  for (const deck of decks) {
    test(
      `${deck} builds to the same bytes every way`,
      async () => {
        const root = projectRoot(join(repo, deck));
        const disk = new DiskFiles(root);
        const html = disk.virtual(join(repo, deck, "index.html"))!;
        const first = await buildDeck({ files: disk, esbuild, html });
        const rec = recordingFiles(disk);
        const second = await buildDeck({ files: rec.files, esbuild, html });
        expect(second.html).toBe(first.html);
        const fromSnapshot = await buildDeck({ files: new MemoryFiles(JSON.parse(JSON.stringify(rec.snapshot()))), esbuild, html });
        expect(fromSnapshot.html).toBe(first.html);
        const elsewhere = await buildDeck({ files: mounted(disk, "/home/someone/checkouts/x"), esbuild, html: "/home/someone/checkouts/x" + html });
        expect(elsewhere.html).toBe(first.html);
      },
      120_000,
    );
  }

  test(
    "a full build with every extra is deterministic",
    async () => {
      const out = mkdtempSync(join(tmpdir(), "lst-golden-"));
      const prev = process.cwd();
      try {
        process.chdir(join(repo, "presentations/poll-demo"));
        const quiet = { info() {}, warn() {} };
        await bundleDeck({ outdir: out, outfile: "a.html", log: quiet });
        await bundleDeck({ outdir: out, outfile: "b.html", log: quiet });
        const a = readFileSync(join(out, "a.html"), "utf8");
        expect(readFileSync(join(out, "b.html"), "utf8")).toBe(a);
        for (const attr of ["data-liebstoeckel-plugins", "data-liebstoeckel-licenses", "data-liebstoeckel-source"]) expect(a).toContain(attr);
        expect(a).toMatch(/<meta name="generator" content="liebstoeckel engine [^"]+" \/>/);
      } finally {
        process.chdir(prev);
        rmSync(out, { recursive: true, force: true });
      }
    },
    120_000,
  );
});

let wasmReady: Promise<void> | null = null;

/** esbuild-wasm's browser build, in this process, as a browser worker runs it. (Its
 *  Node entry would start a separate `node`.) */
function initWasm(): Promise<void> {
  wasmReady ??= (async () => {
    const bytes = readFileSync(Bun.resolveSync("esbuild-wasm/esbuild.wasm", import.meta.dir));
    await wasm.initialize({ wasmModule: new WebAssembly.Module(bytes), worker: false });
  })();
  return wasmReady;
}

/** Every module the dev core serves for a deck, and every stylesheet, by path. */
async function devOutput(deck: string, eb: Esbuild): Promise<Record<string, string>> {
  const dir = join(repo, deck);
  const tree = deckTree(dir);
  const html = tree.disk.virtual(join(dir, "index.html"))!;
  const core = new DevCore({ esbuild: eb, files: tree.files, html, base: "", resolver: tree.resolver, deps: { imports: {}, css: [], candidates: [] } });
  const walked = await core.walk();
  expect(walked.failed).toEqual([]);
  const out: Record<string, string> = {};
  const queue = htmlEntries(readText(tree.files, html)!).scripts.map((src) => vjoin(dirname(html), src));
  while (queue.length) {
    const p = queue.shift()!;
    if (p in out) continue;
    out[p] = await core.code(p);
    queue.push(...(await core.module(p)).imports);
  }
  for (const css of walked.css) out[`${css}?css`] = String((await core.serve(`/@fs${encodeURI(css)}`, new URLSearchParams("css"))).body);
  return out;
}

describe("native esbuild and esbuild-wasm", () => {
  test("are the same version", () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(pkg.devDependencies["esbuild-wasm"]).toBe(pkg.dependencies.esbuild!);
    expect(wasm.version).toBe(esbuild.version);
  });

  for (const deck of decks) {
    test(
      `${deck}: the dev core serves the same modules and stylesheets on both`,
      async () => {
        await initWasm();
        const native = await devOutput(deck, esbuild);
        const inBrowser = await devOutput(deck, wasm as Esbuild);
        // The paths that differ first, so a failure names them.
        const differ = [...new Set([...Object.keys(native), ...Object.keys(inBrowser)])].filter((k) => native[k] !== inBrowser[k]).sort();
        expect(differ).toEqual([]);
        expect(Object.keys(native).length).toBeGreaterThan(1);
      },
      120_000,
    );
  }
});
