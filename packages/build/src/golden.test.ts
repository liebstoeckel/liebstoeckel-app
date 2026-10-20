// Golden builds: every deck under presentations/ (and the e2e fixture) builds to
// the same bytes twice, from a recorded snapshot of its inputs, and from the same
// tree mounted somewhere else, so the output depends on the deck and nothing about
// the machine or the checkout's location. One full build with every extra (plugin
// manifest, licenses, source package, stamp) is checked the same way.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildDeck } from "./core/build.ts";
import { MemoryFiles, recordingFiles, type Files } from "./core/files.ts";
import { bundleDeck } from "./deck.ts";
import { DiskFiles, projectRoot } from "./disk.ts";
import { esbuild } from "./esbuild-native.ts";

const repo = resolve(import.meta.dir, "../../..");
const decks = [
  ...readdirSync(join(repo, "presentations"))
    .filter((d) => !d.startsWith(".") && !d.startsWith("_"))
    .map((d) => `presentations/${d}`),
  "packages/e2e/fixture",
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
