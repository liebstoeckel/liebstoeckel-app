// `liebstoeckel dev` in a real browser: an edit to a slide, a shared component, a
// slide's notes, main.tsx and a utility class shows up without a reload, the deck
// stays on its slide and step, and the edited components keep their state (React
// Fast Refresh), as Bun's dev server kept it. A component whose hooks change
// remounts; a broken edit shows the overlay, and fixing it clears it.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "playwright-core";
import { browserSuite, chromiumAvailable, launchChromium } from "./harness";

const PKG = join(import.meta.dir, "..");
const REPO = join(PKG, "../..");
const CLI = join(REPO, "packages/cli/src/cli.ts");

const FILES: Record<string, string> = {
  "package.json": JSON.stringify({ name: "hot-deck", version: "0.0.0", private: true, type: "module" }),
  "index.html":
    '<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Hot</title></head>' +
    '<body data-brand="liebstoeckel"><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>',
  "main.tsx": `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Present, Step } from "@liebstoeckel/engine";
import "@liebstoeckel/theme/styles.css";
import A from "./slides/a";
import B from "./slides/b";
// MAINMARK
const root = (import.meta.hot.data.root ??= createRoot(document.getElementById("root")!));
root.render(<StrictMode><Present title="Hot" slides={[A, B]} /></StrictMode>);
import.meta.hot.accept();
`,
  "slides/a.tsx": `import { useState } from "react";
export default function A() {
  const [n, setN] = useState(0);
  return <button id="a" onClick={() => setN(n + 1)}>A {n} AMARK</button>;
}
`,
  "slides/b.tsx": `import { Step } from "@liebstoeckel/engine";
import { Counter } from "../components/Counter";
export const notes = "BNOTES";
export default function B() {
  return <div id="b"><span id="bt">BMARK</span><Counter /><Step><span id="step">STEP</span></Step></div>;
}
`,
  "components/Counter.tsx": `import { useState } from "react";
export function Counter() {
  const [n, setN] = useState(0);
  return <button id="c" onClick={() => setN(n + 1)}>C {n} CMARK</button>;
}
`,
};

describe.skipIf(!chromiumAvailable())(browserSuite("liebstoeckel dev: hot reload in the browser"), () => {
  let dir: string;
  let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  let browser: Browser;
  let page: Page;
  let reloads = 0;
  const errors: string[] = [];

  const edit = (rel: string, from: string, to: string) => {
    const p = join(dir, rel);
    const before = readFileSync(p, "utf8");
    if (!before.includes(from)) throw new Error(`${rel} has no ${from}`);
    writeFileSync(p, before.replace(from, to));
  };
  const text = (sel: string) => page.locator(sel).first().textContent({ timeout: 5000 });
  const until = (fn: () => boolean | null, ms = 10_000) =>
    page.waitForFunction(fn, null, { timeout: ms });

  beforeAll(async () => {
    mkdirSync(join(PKG, ".test-tmp"), { recursive: true });
    dir = mkdtempSync(join(PKG, ".test-tmp", "hot-"));
    for (const [rel, content] of Object.entries(FILES)) {
      mkdirSync(join(dir, rel, ".."), { recursive: true });
      writeFileSync(join(dir, rel), content);
    }
    proc = Bun.spawn([process.execPath, CLI, "dev", "--dir", dir, "--port", "0", "--json"], { cwd: REPO, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    let out = "";
    const reader = proc.stdout.getReader();
    const deadline = Date.now() + 60_000;
    while (!out.includes("\n") && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      out += new TextDecoder().decode(value);
    }
    reader.releaseLock();
    const info = JSON.parse(out.split("\n")[0]!) as { url: string };
    browser = await launchChromium();
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") console.error(`page: ${m.text()}`);
    });
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) reloads++;
    });
    await page.goto(`${info.url}/deck`);
    await page.waitForSelector("#a", { timeout: 60_000 }).catch(async (err) => {
      console.error(errors, (await page.content()).slice(0, 2000));
      throw err;
    });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    proc?.kill();
    await proc?.exited;
    rmSync(dir, { recursive: true, force: true });
  });

  test("a slide edit keeps the deck and the slide's own state", async () => {
    for (let i = 0; i < 3; i++) await page.click("#a");
    edit("slides/a.tsx", "AMARK", "AMARK2");
    await until(() => document.querySelector("#a")?.textContent?.includes("AMARK2") ?? false);
    expect(await text("#a")).toBe("A 3 AMARK2");
  });

  test("a shared component, the slide around it, its notes and main.tsx: state, slide and step stay", async () => {
    await page.keyboard.press("ArrowRight");
    await page.waitForSelector("#c");
    for (let i = 0; i < 2; i++) await page.click("#c");
    await page.keyboard.press("ArrowRight"); // the slide's one step
    await page.waitForSelector("#step", { state: "visible" });
    const place = () => page.evaluate(() => document.querySelector("[data-deck-root]")?.getAttribute("data-slide"));
    const slide = await place();
    edit("components/Counter.tsx", "CMARK", "CMARK2");
    await until(() => document.querySelector("#c")?.textContent?.includes("CMARK2") ?? false);
    expect(await text("#c")).toBe("C 2 CMARK2");
    edit("slides/b.tsx", "BMARK", "BMARK2");
    await until(() => document.querySelector("#bt")?.textContent === "BMARK2");
    edit("slides/b.tsx", "BNOTES", "BNOTES2");
    edit("main.tsx", "// MAINMARK", "// MAINMARK2");
    await Bun.sleep(1500);
    expect(await text("#c")).toBe("C 2 CMARK2");
    expect(await place()).toBe(slide);
    expect(await page.locator("#step").isVisible()).toBe(true);
  });

  test("a new utility class applies without a reload", async () => {
    edit("slides/b.tsx", '<span id="bt">', '<span id="bt" className="tracking-[0.77em]">');
    await until(() => getComputedStyle(document.querySelector("#bt")!).letterSpacing === "12.32px");
  });

  test("a component whose hooks change remounts instead of breaking", async () => {
    edit("components/Counter.tsx", "  const [n, setN] = useState(0);", "  const [n, setN] = useState(0);\n  const [m] = useState(5);");
    edit("components/Counter.tsx", "C {n} CMARK2", "C {n} {m} CMARK3");
    await until(() => document.querySelector("#c")?.textContent?.includes("CMARK3") ?? false);
    expect(await text("#c")).toBe("C 0 5 CMARK3");
  });

  test("a broken edit shows the overlay with the file and line; fixing it clears the overlay and keeps the state", async () => {
    for (let i = 0; i < 2; i++) await page.click("#c");
    expect(await text("#c")).toBe("C 2 5 CMARK3");
    const good = readFileSync(join(dir, "components/Counter.tsx"), "utf8");
    writeFileSync(join(dir, "components/Counter.tsx"), good.replace("return <button", "return <<button"));
    await until(() => !!document.querySelector("lst-dev-overlay[data-error]"));
    const overlay = await page.evaluate(() => document.querySelector("lst-dev-overlay")!.getAttribute("data-error"));
    expect(overlay).toMatch(/components\/Counter\.tsx:5:\d+/);
    writeFileSync(join(dir, "components/Counter.tsx"), good.replace("CMARK3", "CMARK4"));
    await until(() => !document.querySelector("lst-dev-overlay"));
    await until(() => document.querySelector("#c")?.textContent?.includes("CMARK4") ?? false);
    expect(await text("#c")).toBe("C 2 5 CMARK4");
  });

  test("none of it reloaded the page", () => {
    expect(reloads).toBe(1);
    expect(errors).toEqual([]);
  });
});
