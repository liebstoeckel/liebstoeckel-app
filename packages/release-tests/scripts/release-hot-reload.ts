// Hot reload in daily use, on the release fixture, against a running `liebstoeckel dev`:
//
//   liebstoeckel dev --dir <fixture> --port 3500 &
//   bun packages/release-tests/scripts/release-hot-reload.ts <fixture> http://127.0.0.1:3500 [--browser chromium|webkit] [--chrome <path>] [-- <cli...>]
//
// Edits the fixture's files the way an author does and checks the browser after
// each: on an edit the page does not reload, the deck stays on its slide and step and
// the counter keeps its count; where the dev server reloads by design (a module the
// page used is gone, a new package) the deck keeps its slide; the overlay names
// file:line:column and clears on the fix.
// `<cli...>` is how to run the CLI under test for `install` (default: liebstoeckel).
// `--shots <dir>` keeps a screenshot of every failed step.
// `--browser webkit` drives Playwright's WebKit (the stand-in for Safari) instead of
// Chromium; `--chrome <path>` or LIEBSTOECKEL_CHROMIUM names the Chrome binary.
// Runs under Bun or Node (22.18 and later strip the types).
// Prints a JSON report with the edit-to-visible time of every step; exit 1 on a failure.
import { copyFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium, webkit } from "playwright-core";

const argv = process.argv.slice(2);
const dash = argv.indexOf("--");
const cli = dash >= 0 ? argv.slice(dash + 1) : ["liebstoeckel"];
const args = dash >= 0 ? argv.slice(0, dash) : argv;
const valued = new Set(["--chrome", "--browser", "--shots"]);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const executablePath = opt("--chrome") ?? (process.env.LIEBSTOECKEL_CHROMIUM || undefined);
const engine = opt("--browser") ?? "chromium";
// --shots <dir>: a screenshot of the page after every step that failed.
const shots = opt("--shots");
const [dir, base] = args.filter((a, i) => !valued.has(a) && !valued.has(args[i - 1] ?? ""));
if (!dir || !base || (engine !== "chromium" && engine !== "webkit")) {
  console.error("usage: release-hot-reload.ts <fixture-dir> <dev-url> [--browser chromium|webkit] [--chrome <path>] [-- <cli...>]");
  process.exit(2);
}

const browser = engine === "webkit" ? await webkit.launch() : await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
let loads = 0;
page.on("pageerror", (e) => errors.push(e.message));
page.on("framenavigated", (f) => {
  if (f === page.mainFrame()) loads++;
});

const results: Array<{ step: string; ok: boolean; ms?: number; reloaded?: boolean; note?: string }> = [];
const file = (rel: string) => join(dir, rel);
const edit = (rel: string, from: string, to: string) => {
  const before = readFileSync(file(rel), "utf8");
  if (!before.includes(from)) throw new Error(`${rel} has no ${JSON.stringify(from)}`);
  writeFileSync(file(rel), before.replace(from, to));
};
const until = (fn: string, ms = 20_000) => page.waitForFunction(fn, null, { timeout: ms, polling: 25 });
const counter = () => page.evaluate(() => (document.body.textContent ?? "").match(/(\d{2})\s*\/\s*(\d{2})/)?.slice(1).join("/") ?? "");
const count = () => page.evaluate(() => document.querySelector("#fx-counter")?.textContent ?? "");
const stepShown = (text: string) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll("div")].find((d) => d.textContent === t);
    return el ? Number(getComputedStyle(el).opacity) > 0.9 : false;
  }, text);
const go = async (n: number) => {
  for (const d of String(n)) await page.keyboard.press(d);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
};

/** Slide 1, two of its three steps shown, the counter at 3. */
async function setUp() {
  await page.waitForSelector("[data-deck-root]", { timeout: 90_000 });
  await go(1);
  await page.waitForSelector("#fx-counter", { timeout: 30_000 });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const c = await count();
  const n = Number(/clicked (\d+)/.exec(c)?.[1] ?? 0);
  for (let i = n; i < 3; i++) await page.click("#fx-counter");
  await page.waitForTimeout(400);
}

/** The deck has to be where we left it: slide 1, two steps shown, the count kept. */
async function kept(slides: string): Promise<string | null> {
  const at = await counter();
  if (at !== slides) return `counter ${at}, wanted ${slides}`;
  if (!(await stepShown("Two: another step")) || (await stepShown("Three: the last step"))) return "step state lost";
  const c = await count();
  if (!c.includes("clicked 3 ")) return `counter state lost: ${c}`;
  return null;
}

/** `reload` is what the dev server documents for the change: "none" keeps the page and
 *  every state; "allowed" may reload (a module the page used is gone, a new package):
 *  then only the slide has to stay, and the state is set up again for the next step. */
async function step(name: string, change: () => void, visible: string, opts: { slides?: string; reload?: "none" | "allowed"; after?: () => Promise<string | null>; stay?: boolean } = {}) {
  const slides = opts.slides ?? "01/10";
  const before = loads;
  const t0 = performance.now();
  try {
    change();
    await until(visible, 30_000);
    const ms = Math.round(performance.now() - t0);
    await page.waitForTimeout(300);
    const reloaded = loads !== before;
    let problem: string | null = null;
    if (reloaded && opts.reload !== "allowed") problem = "the page reloaded";
    else if (reloaded) {
      await page.waitForSelector("[data-deck-root]", { timeout: 60_000 });
      const at = await counter();
      if (at.split("/")[1] !== slides.split("/")[1]) problem = `counter ${at}, wanted ${slides}`;
    } else problem = await kept(slides);
    if (!problem && opts.after) problem = await opts.after();
    results.push({ step: name, ok: !problem, ms, reloaded, ...(problem ? { note: problem } : {}) });
  } catch (err) {
    const seen = await page
      .evaluate(() => `overlay ${document.querySelector("lst-dev-overlay")?.getAttribute("data-error")?.slice(0, 120) ?? "none"}, title ${document.querySelector("#fx-title")?.textContent ?? "none"}, ${(document.body.textContent ?? "").match(/\d{2}\s*\/\s*\d{2}/)?.[0] ?? ""}`)
      .catch(() => "");
    results.push({ step: name, ok: false, note: `${(err as Error).message.split("\n")[0]} (${seen})` });
  }
  if (shots && !results.at(-1)!.ok) {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: join(shots, `${engine}-${results.length}-${name.replace(/[^a-z0-9]+/gi, "-")}.png`) }).catch(() => {});
  }
  // With the overlay up, keys reach the deck but not as typed: leave the page alone.
  if (loads !== before || (opts.after && !opts.stay)) await setUp();
}

await page.goto(`${base.replace(/\/$/, "")}/deck`);
await setUp();
const wait = (ms: number) => `new Promise((r) => setTimeout(() => r(true), ${ms}))`;

await step("edit a slide", () => edit("slides/01-intro.tsx", "Every feature, one deck", "Every feature, edited"),
  `document.querySelector("#fx-title")?.textContent?.includes("edited")`);
await step("edit a shared component", () => edit("components/Kicker.tsx", "{children}", "{children} (kicked)"),
  `document.querySelector("[data-testid=kicker]")?.textContent?.includes("(kicked)")`);
await step("edit the component with state", () => edit("components/Counter.tsx", "COUNTERMARK", "COUNTERMARK2"),
  `document.querySelector("#fx-counter")?.textContent?.includes("COUNTERMARK2")`);
await step("edit notes", () => edit("slides/01-intro.tsx", "Fixture notes:", "Fixture notes, edited:"), wait(1500));
await step("edit main.tsx", () => edit("main.tsx", 'title="Release fixture"', 'title="Release fixture, edited"'), wait(1500));
await step("a new Tailwind class", () => edit("slides/01-intro.tsx", 'id="fx-title" className="', 'id="fx-title" className="underline decoration-wavy '),
  `getComputedStyle(document.querySelector("#fx-title")).textDecorationStyle === "wavy"`);
const added = `export default function Added() {\n  return <h2 id="fx-added" className="font-heading text-6xl text-text">ADDEDMARK</h2>;\n}\n`;
await step("add a slide", () => {
  writeFileSync(file("slides/11-added.tsx"), added);
  edit("main.tsx", 'import * as join from "./slides/10-join";', 'import * as join from "./slides/10-join";\nimport * as addedSlide from "./slides/11-added";');
  edit("main.tsx", "cjs, join]", "cjs, join, addedSlide]");
}, `/\\/\\s*11/.test(document.body.textContent ?? "")`, { slides: "01/11" });
await step("rename a slide", () => {
  renameSync(file("slides/11-added.tsx"), file("slides/11-renamed.tsx"));
  edit("main.tsx", '"./slides/11-added"', '"./slides/11-renamed"');
  edit("slides/11-renamed.tsx", "ADDEDMARK", "RENAMEDMARK");
}, wait(2000), {
  slides: "01/11",
  reload: "allowed",
  after: async () => {
    await go(11);
    const ok = await until(`document.querySelector("#fx-added")?.textContent === "RENAMEDMARK"`, 10_000).then(() => true, () => false);
    return ok ? null : "renamed slide not shown";
  },
});
await step("delete a slide", () => {
  edit("main.tsx", "\nimport * as addedSlide from \"./slides/11-renamed\";", "");
  edit("main.tsx", "cjs, join, addedSlide]", "cjs, join]");
  rmSync(file("slides/11-renamed.tsx"));
}, `/\\/\\s*10/.test(document.body.textContent ?? "")`, { reload: "allowed" });
await step("add an image", () => {
  copyFileSync(file("assets/gradient.png"), file("assets/added.png"));
  edit("slides/01-intro.tsx", 'import { Step } from "@liebstoeckel/engine";', 'import { Step } from "@liebstoeckel/engine";\nimport addedPng from "../assets/added.png";');
  edit("slides/01-intro.tsx", "      <Counter />", '      <Counter />\n      <img id="fx-added-img" src={addedPng} width={96} height={64} />');
}, `(document.querySelector("#fx-added-img")?.naturalWidth ?? 0) > 0`);
let installNote = "";
await step("add an npm dependency while dev runs", () => {
  const r = spawnSync(cli[0]!, [...cli.slice(1), "install", "dayjs@1.11.13", "--dir", dir], { encoding: "utf8", shell: process.platform === "win32" });
  installNote = `install exit ${r.status}`;
  if (r.status !== 0) throw new Error(`install failed: ${r.stderr}`);
  edit("slides/09-cjs.tsx", 'import ms from "ms";', 'import ms from "ms";\nimport dayjs from "dayjs";');
  edit("slides/09-cjs.tsx", "ms(5400000) = {ms(5400000)}", 'ms(5400000) = {ms(5400000)}, dayjs: <span id="fx-dayjs">{dayjs(0).toISOString()}</span>');
}, wait(3000), {
  reload: "allowed",
  after: async () => {
    await page.waitForSelector("[data-deck-root]", { timeout: 60_000 });
    await go(9);
    const shown = await until(`document.querySelector("#fx-dayjs")?.textContent === "1970-01-01T00:00:00.000Z"`, 20_000).then(() => true, () => false);
    const overlay = await page.evaluate(() => document.querySelector("lst-dev-overlay")?.getAttribute("data-error") ?? null);
    return shown ? null : `dayjs not shown (${installNote}); overlay: ${overlay}`;
  },
});
const good = readFileSync(file("slides/01-intro.tsx"), "utf8");
let overlayText = "";
await step("a broken edit shows the overlay", () => writeFileSync(file("slides/01-intro.tsx"), good.replace("<h1 id=", "<<h1 id=")),
  `!!document.querySelector("lst-dev-overlay[data-error]")`, {
    stay: true,
    after: async () => {
      overlayText = (await page.evaluate(() => document.querySelector("lst-dev-overlay")?.getAttribute("data-error"))) ?? "";
      return /slides\/01-intro\.tsx:\d+:\d+/.test(overlayText) ? null : `overlay lacks file:line:col: ${overlayText.slice(0, 200)}`;
    },
  });
await step("the fix clears it", () => writeFileSync(file("slides/01-intro.tsx"), good.replace("Every feature, edited", "Every feature, fixed")),
  `!document.querySelector("lst-dev-overlay") && document.querySelector("#fx-title")?.textContent?.includes("fixed")`);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ ok: failed.length === 0 && errors.length === 0, browser: engine, reloads: loads - 1, results, overlay: overlayText.slice(0, 300), pageErrors: errors }, null, 2));
process.exit(failed.length || errors.length ? 1 : 0);
