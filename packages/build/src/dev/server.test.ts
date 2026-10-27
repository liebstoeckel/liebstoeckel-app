// The dev server over its change channel: an edit that brings a new Tailwind utility
// sends the stylesheet before the module update (the page never shows the element
// unstyled), and an edit with no new utility sends the update with no stylesheet.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Server } from "bun";
import { deckTree } from "../profile.ts";
import { createDeckDev, type DeckDev, type WsData } from "./server.ts";

const TMP = resolve(import.meta.dir, "../../.test-tmp");
const SLIDE = (body: string) => `export default function Slide() {\n  return <div className="p-4">${body}</div>;\n}\n`;

let dir: string;
let dev: DeckDev;
let server: Server<WsData>;
let ws: WebSocket;
const received: Array<{ type: string; id?: string }> = [];

beforeAll(async () => {
  mkdirSync(TMP, { recursive: true });
  dir = mkdtempSync(join(TMP, "server-"));
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "server-deck", private: true, type: "module" }),
    "index.html": '<!doctype html><html><head><link rel="stylesheet" href="./styles.css"></head><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>',
    "main.tsx": 'import Slide from "./slide.tsx";\nexport const slides = [Slide];\nimport.meta.hot.accept();\n',
    "slide.tsx": SLIDE("Hello"),
    "styles.css": '@import "tailwindcss";\n',
  };
  for (const [rel, text] of Object.entries(files)) writeFileSync(join(dir, rel), text);
  dev = await createDeckDev({ deckDir: dir, watch: false, cacheDir: join(dir, ".cache") });
  await dev.ready;
  server = Bun.serve<WsData>({ port: 0, fetch: async (req, srv) => (await dev.fetch(req, srv)) ?? new Response("not found", { status: 404 }), websocket: dev.websocket });
  const base = `http://localhost:${server.port}`;
  // What a page does on load: the page, its entry, the slide and the stylesheet.
  const v = (rel: string) => encodeURI(deckTree(dir).disk.virtual(join(dir, rel))!);
  expect((await fetch(`${base}/`)).status).toBe(200);
  for (const url of [`/@fs${v("main.tsx")}?v=0`, `/@fs${v("slide.tsx")}?v=0`, `/@fs${v("styles.css")}?css`]) expect((await fetch(base + url)).status).toBe(200);
  ws = new WebSocket(`ws://localhost:${server.port}/@lst/hmr`);
  ws.onmessage = (e) => received.push(JSON.parse(String(e.data)));
  await new Promise((r) => (ws.onopen = r));
}, 120_000);

afterAll(() => {
  ws?.close();
  dev?.close();
  server?.stop(true);
  if (dir) rmSync(dir, { recursive: true, force: true });
});

async function edit(text: string) {
  received.length = 0;
  writeFileSync(join(dir, "slide.tsx"), text);
  await dev.notify([join(dir, "slide.tsx")]);
  await Bun.sleep(50);
  return received.map((m) => m.type);
}

test("a new utility: the stylesheet first, then the update", async () => {
  const types = await edit(SLIDE('<b className="grid-cols-7">Hello</b>'));
  expect(types).toContain("css");
  expect(types).toContain("update");
  expect(types.indexOf("css")).toBeLessThan(types.indexOf("update"));
  expect(types.filter((t) => t === "ok" || t === "error")).toEqual(["ok"]);
});

test("no new utility: the update and no stylesheet", async () => {
  expect(await edit(SLIDE('<b className="grid-cols-7">Hello, more words</b>'))).toEqual(["ok", "update"]);
});
