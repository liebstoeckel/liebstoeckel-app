// A built deck's stand-in for `import.meta.hot` keeps every line where it was, so a
// build problem in a file that uses it names the line the author sees.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { esbuild } from "../esbuild-native.ts";
import { buildDeck, DeckBuildError } from "./build.ts";
import { MemoryFiles } from "./files.ts";
import { shimHot } from "./load.ts";

function tree(files: Record<string, string>): MemoryFiles {
  const m = new MemoryFiles();
  for (const [p, t] of Object.entries(files)) m.write(p, t);
  return m;
}

const HTML = '<!doctype html><html><body><script type="module" src="./main.ts"></script></body></html>';
const MAIN = 'export const root = (import.meta.hot.data.root ??= { n: 1 });\nimport.meta.hot.accept();\nconsole.log(import.meta.hot?.data.root.n);\n';

describe("the import.meta.hot stand-in in a built deck", () => {
  test("keeps the source's lines in place", () => {
    const out = shimHot(MAIN);
    expect(out.split("\n").slice(0, 3)).toEqual(MAIN.split("\n").slice(0, 3).map((l) => l.replaceAll("import.meta.hot", "__lstHot()")));
    expect(shimHot("export const x = 1;\n")).toBe("export const x = 1;\n");
  });

  test("a build problem in a file that uses it names its own line", async () => {
    const files = tree({ "/deck/index.html": HTML, "/deck/main.ts": `import "./missing.ts";\n${MAIN}` });
    const err = await buildDeck({ files, esbuild, html: "/deck/index.html" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DeckBuildError);
    expect((err as DeckBuildError).messages[0]).toMatchObject({ file: "/deck/main.ts", line: 1, column: 8 });
  });

  test("the built deck runs it as an inert object that keeps its data", async () => {
    const out = await buildDeck({ files: tree({ "/deck/index.html": HTML, "/deck/main.ts": MAIN }), esbuild, html: "/deck/index.html" });
    expect(out.js).not.toContain("import.meta.hot");
    const dir = mkdtempSync(join(tmpdir(), "lst-hot-"));
    try {
      writeFileSync(join(dir, "deck.mjs"), out.js);
      const mod = (await import(join(dir, "deck.mjs"))) as { root: { n: number } };
      expect(mod.root).toEqual({ n: 1 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
