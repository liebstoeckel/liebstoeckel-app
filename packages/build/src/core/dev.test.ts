// The dev core's stylesheet lane: change() answers with the module messages before
// any stylesheet work, the next edit does not wait for a stylesheet still being
// generated, and a stylesheet is regenerated only when one of its files changed or
// Tailwind's output did.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { esbuild as native } from "../esbuild-native.ts";
import { deckTree } from "../profile.ts";
import { DevCore, type DevMessage } from "./dev.ts";
import type { Esbuild } from "./esbuild.ts";

const TMP = resolve(import.meta.dir, "../../.test-tmp");
mkdirSync(TMP, { recursive: true });
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const SLIDE = (body: string) => `export default function Slide() {\n  return <div className="p-4">${body}</div>;\n}\n`;

/** A tiny deck on disk inside the repository, so Tailwind and React resolve. */
function deck(): string {
  const dir = mkdtempSync(join(TMP, "lane-"));
  dirs.push(dir);
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "lane", private: true, type: "module" }),
    "index.html": '<!doctype html><html><head><link rel="stylesheet" href="./styles.css"></head><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>',
    "main.tsx": 'import Slide from "./slide.tsx";\nexport const slides = [Slide];\nimport.meta.hot.accept();\n',
    "slide.tsx": SLIDE("Hello"),
    "styles.css": '@import "tailwindcss";\n.deck { color: red; }\n',
  };
  for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text);
  return dir;
}

interface Rig {
  dir: string;
  core: DevCore;
  styles: DevMessage[][];
  /** esbuild passes over a stylesheet so far */
  cssBuilds(): number;
  /** hold every stylesheet pass until `release` */
  hold(): void;
  release(): void;
  started(): number;
  edit(rel: string, text: string): string;
}

async function rig(): Promise<Rig> {
  const dir = deck();
  const tree = deckTree(dir);
  const html = tree.disk.virtual(join(dir, "index.html"))!;
  let builds = 0;
  let started = 0;
  let gate: Promise<void> | null = null;
  let open: () => void = () => {};
  const esbuild: Esbuild = {
    ...native,
    async build(options) {
      const css = (options.entryPoints as string[]).some((e) => e.endsWith(".css"));
      if (css) {
        started++;
        if (gate) await gate;
      }
      const result = await native.build(options as Parameters<typeof native.build>[0]);
      if (css) builds++;
      return result as never;
    },
  } as Esbuild;
  const styles: DevMessage[][] = [];
  const core = new DevCore({ esbuild, files: tree.files, html, base: "", resolver: tree.resolver, deps: { imports: {}, css: [], candidates: [] }, onStyles: (m) => styles.push(m) });
  await core.ready();
  // What a page does on load: the entry, the slide and the stylesheet.
  const main = tree.disk.virtual(join(dir, "main.tsx"))!;
  const slide = tree.disk.virtual(join(dir, "slide.tsx"))!;
  const css = tree.disk.virtual(join(dir, "styles.css"))!;
  core.url(main);
  core.url(slide);
  const q = (s: string) => new URLSearchParams(s);
  expect((await core.serve(`/@fs${encodeURI(main)}`, q("v=0"))).status).toBe(200);
  expect((await core.serve(`/@fs${encodeURI(slide)}`, q("v=0"))).status).toBe(200);
  core.cssUrl(css);
  expect((await core.serve(`/@fs${encodeURI(css)}`, q("css"))).status).toBe(200);
  return {
    dir,
    core,
    styles,
    cssBuilds: () => builds,
    started: () => started,
    hold() {
      gate = new Promise((r) => (open = r));
    },
    release() {
      gate = null;
      open();
    },
    edit(rel, text) {
      writeFileSync(join(dir, rel), text);
      return tree.disk.virtual(join(dir, rel))!;
    },
  };
}

const types = (ms: DevMessage[]) => ms.map((m) => m.type);
const cssText = (batches: DevMessage[][]) =>
  batches
    .flat()
    .filter((m): m is Extract<DevMessage, { type: "css" }> => m.type === "css")
    .map((m) => m.text)
    .join("\n");

describe("the stylesheet lane", () => {
  let r: Rig;
  beforeEach(async () => {
    r = await rig();
  });

  test("change() answers with the module update before the stylesheet is generated", async () => {
    const before = r.cssBuilds();
    r.hold();
    const messages = await r.core.change([r.edit("slide.tsx", SLIDE('<span className="underline">Hello</span>'))]);
    expect(types(messages)).toEqual(["update"]);
    expect(r.core.stylesPending).toBe(true);
    expect(r.cssBuilds()).toBe(before);
    expect(r.styles).toEqual([]);
    r.release();
    await r.core.settled();
    expect(r.cssBuilds()).toBe(before + 1);
    expect(cssText(r.styles)).toContain(".underline");
    // The `ok` for the edit came after the stylesheet, from the lane.
    expect(r.styles.flat().map((m) => m.type)).toEqual(["ok", "css"]);
  });

  test("the next edit does not wait for a stylesheet still being generated", async () => {
    r.hold();
    await r.core.change([r.edit("slide.tsx", SLIDE('<span className="underline">Hello</span>'))]);
    // Let the lane start its pass and stop at the held esbuild call.
    for (let i = 0; i < 50 && r.started() === 0; i++) await Bun.sleep(5);
    const startedBefore = r.started();
    expect(startedBefore).toBeGreaterThan(0);
    const next = await r.core.change([r.edit("slide.tsx", SLIDE('<span className="underline">Hello again</span>'))]);
    expect(types(next)).toEqual(["update"]);
    r.release();
    await r.core.settled();
    expect(cssText(r.styles)).toContain(".underline");
  });

  test("a text edit with no new utility runs no stylesheet pass and answers ok at once", async () => {
    const before = r.cssBuilds();
    const messages = await r.core.change([r.edit("slide.tsx", SLIDE("Hello, a few new words here"))]);
    expect(r.core.stylesPending).toBe(false);
    await r.core.settled();
    expect(types(messages)).toEqual(["ok", "update"]);
    expect(r.cssBuilds()).toBe(before);
    expect(r.styles).toEqual([]);
  });

  test("a new utility runs one, and only once", async () => {
    const before = r.cssBuilds();
    await r.core.change([r.edit("slide.tsx", SLIDE('<b className="grid-cols-7">Hello</b>'))]);
    await r.core.settled();
    expect(r.cssBuilds()).toBe(before + 1);
    expect(cssText(r.styles)).toContain(".grid-cols-7");
    // The same utility again, in another sentence: nothing new for Tailwind.
    await r.core.change([r.edit("slide.tsx", SLIDE('<b className="grid-cols-7">Hello there</b>'))]);
    await r.core.settled();
    expect(r.cssBuilds()).toBe(before + 1);
  });

  test("an edited stylesheet is regenerated", async () => {
    const before = r.cssBuilds();
    const messages = await r.core.change([r.edit("styles.css", '@import "tailwindcss";\n.deck { color: blue; }\n')]);
    expect(messages).toEqual([]);
    await r.core.settled();
    expect(r.cssBuilds()).toBe(before + 1);
    expect(cssText(r.styles)).toContain("blue");
  });

  test("a broken stylesheet is reported by the lane, and a module edit in the same change never says ok first", async () => {
    const messages = await r.core.change([
      r.edit("slide.tsx", SLIDE("Hello, still fine")),
      r.edit("styles.css", '@import "tailwindcss";\n@import "./missing.css";\n'),
    ]);
    expect(types(messages)).toEqual(["update"]);
    await r.core.settled();
    const statuses = r.styles.flat().filter((m) => m.type === "ok" || m.type === "error");
    expect(statuses.map((m) => m.type)).toEqual(["error"]);
    expect(JSON.stringify(statuses[0])).toContain("missing.css");
    // Fixing it clears it.
    await r.core.change([r.edit("styles.css", '@import "tailwindcss";\n.deck { color: green; }\n')]);
    await r.core.settled();
    expect(types(r.styles.at(-1)!)).toEqual(["ok", "css"]);
  });

  test("a broken module reports at once, before the lane", async () => {
    const messages = await r.core.change([r.edit("slide.tsx", "export default function Slide() {\n  return <div>\n}\n")]);
    expect(types(messages)).toEqual(["error"]);
    await r.core.settled();
    expect(r.styles).toEqual([]);
  });
});
