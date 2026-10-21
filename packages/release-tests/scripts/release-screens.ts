// Open a built deck from file:// in one browser engine, screenshot every slide and
// report console and page errors, for the release QA (README "Release fixture"):
//
//   bun packages/release-tests/scripts/release-screens.ts <chromium|firefox|webkit> <deck.html> <outdir>
//
// Runs under Bun or Node (>= 22.6 with --experimental-strip-types) with playwright-core
// and that engine's Playwright browser installed. Prints one JSON document:
// { browser, slides, errors: [...], shots: [...] }; exit 1 when a slide is missing
// or the page logged an error.
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, firefox, webkit } from "playwright-core";

const [name, html, outdir] = process.argv.slice(2);
const engines = { chromium, firefox, webkit } as const;
const engine = engines[name as keyof typeof engines];
if (!engine || !html || !outdir) {
  console.error("usage: release-screens.ts <chromium|firefox|webkit> <deck.html> <outdir>");
  process.exit(2);
}
mkdirSync(outdir, { recursive: true });
// For chromium, LIEBSTOECKEL_CHROMIUM names a Chrome or Chromium binary (else Playwright's own).
const browser = await engine.launch(name === "chromium" ? { executablePath: process.env.LIEBSTOECKEL_CHROMIUM || undefined, args: ["--no-sandbox"] } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});
await page.goto(pathToFileURL(resolve(html)).href, { waitUntil: "load" });
await page.waitForTimeout(1500);
const counter = async () => ((await page.textContent("body")) ?? "").match(/(\d{2})\s*\/\s*(\d{2})/);
const total = Number((await counter())?.[2] ?? 0);
const shots: string[] = [];
for (let n = 1; n <= total; n++) {
  for (const d of String(n)) await page.keyboard.press(d);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  const at = Number((await counter())?.[1] ?? 0);
  if (at !== n) errors.push(`slide ${n}: the counter shows ${at}`);
  const file = join(outdir, `${name}-${String(n).padStart(2, "0")}.png`);
  await page.screenshot({ path: file });
  shots.push(file);
}
await browser.close();
if (total === 0) errors.push("no slide counter found");
console.log(JSON.stringify({ browser: name, slides: total, errors, shots }, null, 2));
process.exit(errors.length ? 1 : 0);
