import { join } from "node:path";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { chromium, type Browser, type Page } from "playwright-core";

/** The package the fixture deck belongs to: `buildFixture` builds `fixture/index.html`
 *  with this directory's package.json, so the embedded source is relative to it. */
export const FIXTURE_PACKAGE = join(import.meta.dir, "..");
// Full Chromium + container-friendly flags (chrome-headless-shell SIGSEGVs here).
// Mirrors the thumbnails capturer's defaults: the GPU thread stays out of the
// browser process (an in-browser GPU thread turns a software-GL init failure
// into a fatal crash); --renderer-process-limit=1 bounds the process count.
export const CHROMIUM_ARGS = ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--renderer-process-limit=1"];

/** The browser the tests drive: `LIEBSTOECKEL_CHROMIUM` (a Chrome or Chromium binary,
 *  e.g. the one a CI runner ships), else Playwright's own Chromium when it is installed. */
export function chromiumPath(): string | null {
  const explicit = process.env.LIEBSTOECKEL_CHROMIUM;
  if (explicit) return existsSync(explicit) ? explicit : null;
  try {
    const p = chromium.executablePath();
    // executablePath() yields a path even when the browser isn't installed;
    // require the binary to actually exist so the suite skips cleanly in CI.
    return p && existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

/** Why Playwright cannot drive a browser from this process, or null when it can.
 *  Under Bun on Windows it cannot: its pipe transport needs extra stdio handles Bun's
 *  child_process does not pass there, and connecting over CDP needs an HTTP upgrade
 *  Bun's client lacks. The release matrix covers Windows with the drivers under
 *  scripts/, which run under Node. */
export function playwrightBlocked(): string | null {
  if (process.platform === "win32" && process.versions.bun) return "Playwright cannot reach a browser from Bun on Windows";
  return null;
}

/** Why the browser tests skip here, or null when they run. Put it in the describe
 *  name, so a skipped run says why. */
export function browserSkipReason(): string | null {
  return playwrightBlocked() ?? (chromiumPath() ? null : "no Chromium (set LIEBSTOECKEL_CHROMIUM)");
}

export function chromiumAvailable(): boolean {
  return browserSkipReason() === null;
}

/** `name`, or `name (skipped: reason)` when the browser tests cannot run here. */
export function browserSuite(name: string): string {
  const reason = browserSkipReason();
  return reason ? `${name} (skipped: ${reason})` : name;
}

/** Launch the browser the tests drive (see chromiumPath). */
export function launchChromium(timeout = LAUNCH_TIMEOUT_MS): Promise<Browser> {
  return chromium.launch({ executablePath: chromiumPath() ?? undefined, args: CHROMIUM_ARGS, headless: true, timeout });
}

/** Build the fixture deck once → its single-file HTML (plugins discovered + embedded).
 *  Runs in a subprocess (see build-fixture.ts) so it works under `bun test`. */
export async function buildFixture(): Promise<string> {
  const out = mkdtempSync(join(tmpdir(), "pi-e2e-"));
  // Pin to the running Bun (not a bare `bun` off PATH) so the fixture builds
  // under the same binary as the test run.
  const proc = Bun.spawnSync([process.execPath, join(import.meta.dir, "build-fixture.ts"), out], {
    cwd: FIXTURE_PACKAGE,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (!proc.success) {
    throw new Error(`fixture build failed:\n${proc.stderr.toString()}`);
  }
  return Bun.file(join(out, "index.html")).text();
}

/** Serve a single HTML string for every route (the deck is a hash-routed SPA). */
export function serveHtml(html: string): { url: string; stop: () => void } {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response(html, { headers: { "content-type": "text/html" } }),
  });
  return { url: `http://127.0.0.1:${server.port}/`, stop: () => server.stop(true) };
}

export interface PageOpts {
  /** emulate a touch phone (coarse pointer) so the mobile paths engage */
  mobile?: boolean;
  /** override the viewport (e.g. a non-16:9 size to force stage scale < 1, or a phone
   *  held sideways with `mobile`) */
  viewport?: { width: number; height: number };
  /** emulate the OS "reduce motion" preference */
  reducedMotion?: "reduce" | "no-preference";
  /** override the default action timeout (clicks, fills, waits on a locator) */
  actionTimeout?: number;
  /** override the default navigation timeout (goto, reload, waitForURL) */
  navigationTimeout?: number;
}

// Playwright's library defaults (30 s per action and navigation, 180 s for launch)
// add up past bun's 45 to 60 s test timeouts, so a stuck step ended as a bare
// "test timed out" with no hint which locator it was waiting on. With these defaults
// a stuck action fails on its own with Playwright's "Timeout Nms exceeded ...
// waiting for locator(...)" message, well inside the test timeout, and the finally
// below still gets to close the browser.
export const DEFAULT_ACTION_TIMEOUT_MS = 10_000;
export const DEFAULT_NAVIGATION_TIMEOUT_MS = 20_000;
// Launch gets its own bound for the same reason (Playwright's default is 180 s).
const LAUNCH_TIMEOUT_MS = 30_000;
// A browser whose CDP pipe has stopped answering never finishes close(); don't let
// that turn a clear action timeout into an opaque test timeout.
const CLOSE_TIMEOUT_MS = 10_000;

async function closeWithin(browser: Browser, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const gaveUp = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(true), ms);
  });
  const closed = browser.close().then(
    () => false,
    () => false,
  );
  if (await Promise.race([closed, gaveUp])) {
    console.warn(`[e2e] browser.close() did not finish within ${ms} ms; moving on`);
  }
  clearTimeout(timer);
}

/** Launch a fresh browser (single-process Chromium can't share contexts), run the
 *  callback with a page + a collected console/page-error list, then tear down. */
export async function withPage(opts: PageOpts, fn: (page: Page, errors: string[]) => Promise<void>): Promise<void> {
  const browser: Browser = await launchChromium();
  try {
    const context = await browser.newContext({
      ...(opts.mobile
        ? { viewport: opts.viewport ?? { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : { viewport: opts.viewport ?? { width: 1280, height: 720 } }),
      ...(opts.reducedMotion ? { reducedMotion: opts.reducedMotion } : {}),
    });
    context.setDefaultTimeout(opts.actionTimeout ?? DEFAULT_ACTION_TIMEOUT_MS);
    context.setDefaultNavigationTimeout(opts.navigationTimeout ?? DEFAULT_NAVIGATION_TIMEOUT_MS);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    await fn(page, errors);
  } finally {
    await closeWithin(browser, CLOSE_TIMEOUT_MS);
  }
}

/** The deck's slide counter, e.g. "02 / 03", or "" if not found. */
export async function readCounter(page: Page): Promise<string> {
  const txt = (await page.textContent("body")) ?? "";
  return txt.match(/\d{2}\s*\/\s*\d{2}/)?.[0]?.replace(/\s+/g, " ") ?? "";
}

/** Jump to a 1-based slide via the deck's digit buffer. */
export async function jumpToSlide(page: Page, n: number): Promise<void> {
  await page.keyboard.press(String(n));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
}
