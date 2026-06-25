import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import {
  CAPTURE_EVENT,
  CAPTURE_FLAG,
  CAPTURE_READY,
  PRINT_FLAG,
  PRINT_READY,
  PRINT_SELECT_EVENT,
  SLIDE_COUNT,
} from "@liebstoeckel/engine/build/capture-protocol";
import type { ThumbnailManifest } from "@liebstoeckel/engine/build/thumbnails";

export type ThumbnailFormat = "webp" | "jpeg" | "png";

/** The exact `playwright-core` version this package resolves browsers through.
 *  `chromium.executablePath()` looks for one specific bundled revision, so any
 *  install must use the *matching* npm release. `doctor --install-chromium` pins
 *  `playwright@<this>`. An unpinned `playwright install` resolves to registry-latest
 *  and drops a newer revision into a different dir, which this version can't find
 *  (the install "succeeds" yet capture still reports no Chromium). */
export const playwrightCoreVersion: string = createRequire(import.meta.url)("playwright-core/package.json").version;

/** Thumbnail capture options, the slide driver's options ((internal ADR)) plus the
 *  image-encoding policy specific to the thumbnail sink. Default width 640 ×
 *  scale 2 = 1280×720, the native authoring canvas, so the overview is never
 *  upscaled even on large/hi-dpi screens. Lower `width` to shrink a big deck. */
export interface CaptureOptions extends RenderDriveOptions {
  /** output image format (default "webp", ~half a JPEG, alpha, no extra deps) */
  format?: ThumbnailFormat;
  /** lossy quality 0-100 (ignored for png) */
  quality?: number;
}

// Bun's built-in image codec (Bun.Image), not yet in @types/bun, so typed here.
// Lets us transcode the browser's PNG screenshot to WebP natively (no `sharp`).
interface BunImageChain {
  webp(o?: { quality?: number }): BunImageChain;
  jpeg(o?: { quality?: number }): BunImageChain;
  png(): BunImageChain;
  dataurl(): Promise<string>;
}
type BunImageCtor = new (data: Uint8Array | ArrayBuffer) => BunImageChain;
const BunImage = (Bun as unknown as { Image: BunImageCtor }).Image;

/** Transcode a PNG screenshot to a `data:` URI in the requested format. */
function encodeDataUri(png: Uint8Array, format: ThumbnailFormat, quality: number): Promise<string> {
  const img = new BunImage(png);
  if (format === "png") return img.png().dataurl();
  if (format === "jpeg") return img.jpeg({ quality }).dataurl();
  return img.webp({ quality }).dataurl();
}

// Container-friendly flags. The full Chromium (not chrome-headless-shell, which
// SIGSEGVs in some sandboxes) plus --single-process/--no-zygote launches cleanly
// without a GPU or a user namespace.
const DEFAULT_ARGS = [
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--single-process",
  "--no-zygote",
];

/** Well-known Chrome/Chromium locations to probe when no binary is set explicitly,
 *  so a machine that already has Chrome "just works" without LIEBSTOECKEL_CHROMIUM
 *  Order = preference; the caller verifies each exists on disk. Pure (env-driven). */
export function systemChromiumCandidates(env: Record<string, string | undefined> = process.env): string[] {
  const out: string[] = [];
  // De-facto standard env vars other Chrome-driving tools honor.
  if (env.PUPPETEER_EXECUTABLE_PATH) out.push(env.PUPPETEER_EXECUTABLE_PATH);
  if (env.CHROME_PATH) out.push(env.CHROME_PATH);
  // Puppeteer's install cache (`bunx puppeteer browsers install chrome`).
  const pcache = join(homedir(), ".cache", "puppeteer", "chrome");
  for (const sub of ["chrome-linux64/chrome", "chrome-win64/chrome.exe"]) {
    try {
      for (const p of new Bun.Glob(`*/${sub}`).scanSync({ cwd: pcache, absolute: true, onlyFiles: false })) out.push(p);
    } catch {
      // no cache dir / glob unsupported → skip
    }
  }
  // PATH binaries (Linux/BSD).
  for (const bin of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]) {
    const p = Bun.which(bin);
    if (p) out.push(p);
  }
  // macOS app bundles + common Windows install paths.
  out.push(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  );
  for (const base of [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA]) {
    if (base) out.push(join(base, "Google", "Chrome", "Application", "chrome.exe"));
  }
  return out;
}

/** First system Chrome/Chromium that exists on disk, or undefined. */
function detectSystemChromium(): string | undefined {
  for (const c of systemChromiumCandidates()) if (c && existsSync(c)) return c;
  return undefined;
}

/** Resolve a Chromium binary: explicit → $LIEBSTOECKEL_CHROMIUM → a system
 *  Chrome/Chromium → Playwright's. The first one that exists on disk wins. */
export function resolveChromium(opts: CaptureOptions = {}): string {
  const explicit = opts.executablePath ?? process.env.LIEBSTOECKEL_CHROMIUM;
  if (explicit && existsSync(explicit)) return explicit;

  const system = detectSystemChromium();
  if (system) return system;

  // executablePath() returns a computed path even when the browser isn't
  // installed, verify the binary actually exists so hasChromium() stays honest
  // (otherwise capture is attempted where no browser exists, e.g. CI).
  let playwright: string | undefined;
  try {
    playwright = chromium.executablePath();
  } catch {
    playwright = undefined;
  }
  if (playwright && existsSync(playwright)) return playwright;

  throw new Error(
    "No Chromium found for slide capture. Run `liebstoeckel doctor --install-chromium`, " +
      "set LIEBSTOECKEL_CHROMIUM to a Chrome/Chromium binary, or `bunx playwright install chromium`.",
  );
}

/** Whether a Chromium is available for capture (cheap, resolves a path, no launch). */
export function hasChromium(opts: CaptureOptions = {}): boolean {
  try {
    resolveChromium(opts);
    return true;
  } catch {
    return false;
  }
}

/** Decide whether to capture thumbnails: on by default, opt out with
 *  `LIEBSTOECKEL_NO_THUMBS`, and skipped (not failed) when no Chromium is available.
 *  Pure, `env`/`chromium` are injectable for tests. */
export function thumbnailsEnabled(
  env: Record<string, string | undefined> = process.env,
  chromium = hasChromium(),
): { enabled: boolean; reason?: string } {
  if (env.LIEBSTOECKEL_NO_THUMBS) return { enabled: false, reason: "LIEBSTOECKEL_NO_THUMBS is set" };
  if (!chromium) {
    return { enabled: false, reason: "no Chromium (run `liebstoeckel doctor --install-chromium` or set LIEBSTOECKEL_CHROMIUM)" };
  }
  return { enabled: true };
}

/** Inject a static-mode flag as a classic (non-deferred) inline script so it runs
 *  before the deck's deferred module bundle boots → Present renders the matching
 *  static view (CaptureView / PrintView) instead of the live deck. */
function injectFlag(html: string, global: string, value: unknown): string {
  const tag = `<script>window.${global}=${JSON.stringify(value)};</script>`;
  const head = html.match(/<head[^>]*>/i);
  if (head) return html.replace(head[0], head[0] + tag);
  const body = html.match(/<body[^>]*>/i);
  if (body) return html.replace(body[0], body[0] + tag);
  return tag + html;
}

const injectCaptureFlag = (html: string): string => injectFlag(html, CAPTURE_FLAG, { index: 0 });

/** Options for the sink-agnostic slide driver ((internal ADR)). The viewport/scale and
 *  the per-slide wait policy live here; what the rendered frame *becomes* (a
 *  data-URI thumbnail, a PNG file, a PDF page) is the caller's `onFrame`. */
export interface RenderDriveOptions {
  /** viewport width in CSS px (default 640). */
  width?: number;
  /** viewport height in CSS px (default 16:9 of width). */
  height?: number;
  /** device scale factor, renders at this multiple for crisp output (default 2). */
  scale?: number;
  /** explicit Chromium/Chrome binary; else $LIEBSTOECKEL_CHROMIUM, else Playwright's */
  executablePath?: string;
  /** override the launch flags (defaults are container-friendly) */
  launchArgs?: string[];
  /** extra settle time after a slide reports ready (late chart/font paints) */
  settleMs?: number;
  /** per-step timeout */
  timeoutMs?: number;
  /** 0-based slide indices to render, in order (default: every slide). Indices
   *  outside `[0, count)` are skipped. The capture protocol can jump to any
   *  index, so a subset is just a shorter list ((internal ADR) / 0043). */
  indices?: number[];
  /** Resolve the index list once the deck's slide count is known, for specs that
   *  are open-ended (e.g. "from slide 3 to the end"). Overrides `indices`. */
  selectIndices?(count: number): number[];
  /** progress callback: (nth-rendered, total-to-render). */
  onSlide?(index: number, total: number): void;
}

export interface RenderDriveResult {
  /** total slides the deck reported (not necessarily how many were rendered). */
  count: number;
  /** intrinsic pixel size of each frame (`width*scale` × `height*scale`). */
  w: number;
  h: number;
}

/**
 * The one headless drive loop ((internal ADR)): launch a browser, load a built deck in
 * capture mode, wait for fonts + the slide-count handshake, then step through the
 * requested slide indices, calling `onFrame(index, page)` once each slide has
 * painted and settled. Sink-agnostic: the callback decides what a frame becomes.
 * Both `captureThumbnails` and `exportDeck` ride on this. The deck must render
 * `Present`/`CaptureView`. **Loud**, throws if no Chromium / never enters capture.
 */
export async function renderDeckSlides(
  html: string,
  opts: RenderDriveOptions,
  onFrame: (index: number, page: Page) => Promise<void>,
): Promise<RenderDriveResult> {
  const width = opts.width ?? 640;
  const height = opts.height ?? Math.round((width * 9) / 16);
  const scale = opts.scale ?? 2;
  const settleMs = opts.settleMs ?? 250;
  const timeout = opts.timeoutMs ?? 15000;

  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromium(opts),
    args: opts.launchArgs ?? DEFAULT_ARGS,
  });
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    await page.setContent(injectCaptureFlag(html), { waitUntil: "load", timeout });
    // fonts affect layout/metrics; wait once before stepping through slides
    await page.evaluate(() => (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready);
    try {
      await page.waitForFunction((key) => (window as unknown as Record<string, unknown>)[key] != null, SLIDE_COUNT, { timeout });
    } catch {
      throw new Error("deck never entered capture mode, ensure it renders <Present> (no __LIEBSTOECKEL_SLIDE_COUNT__)");
    }
    const count = (await page.evaluate((key) => (window as unknown as Record<string, unknown>)[key], SLIDE_COUNT)) as number;

    // Resolve which slides to render: a count-aware resolver (open-ended specs)
    // wins, else an explicit list, else every slide, always clamped to real slides.
    const requested = opts.selectIndices
      ? opts.selectIndices(count)
      : (opts.indices ?? Array.from({ length: count }, (_, i) => i));
    const indices = requested.filter((i) => Number.isInteger(i) && i >= 0 && i < count);

    for (let n = 0; n < indices.length; n++) {
      const i = indices[n]!;
      opts.onSlide?.(n, indices.length);
      // tell CaptureView to render slide i; it flips CAPTURE_READY to i when painted
      await page.evaluate(
        ([evt, idx]) => window.dispatchEvent(new CustomEvent(evt as string, { detail: idx })),
        [CAPTURE_EVENT, i] as const,
      );
      await page.waitForFunction(
        ([key, idx]) => (window as unknown as Record<string, unknown>)[key as string] === idx,
        [CAPTURE_READY, i] as const,
        { timeout },
      );
      if (settleMs > 0) await page.waitForTimeout(settleMs);
      await onFrame(i, page);
    }
    return { count, w: Math.round(width * scale), h: Math.round(height * scale) };
  } finally {
    await browser.close();
  }
}

/** Render a built single-file deck in a headless browser and screenshot each slide
 *  as a data-URI (WebP by default, via Bun.Image). Returns a thumbnails manifest
 *  (embed it with `embedThumbnails`). The deck must use `Present`/`CaptureView`. */
export async function captureThumbnails(html: string, opts: CaptureOptions = {}): Promise<ThumbnailManifest> {
  const format = opts.format ?? "webp";
  const quality = opts.quality ?? 80;

  const thumbs: Record<number, string> = {};
  const { w, h } = await renderDeckSlides(html, opts, async (i, page) => {
    // PNG (lossless) from the browser → transcode natively to the target format
    const png = await page.screenshot({ type: "png" });
    thumbs[i] = await encodeDataUri(png, format, quality);
  });
  return { v: 1, w, h, thumbs };
}

/** Options for the vector-PDF driver. The logical page is the authoring canvas
 *  (STAGE_W×STAGE_H, 1280×720), selectable text, vector output, no raster. */
export interface PrintDriveOptions {
  /** logical page width in CSS px (default 1280, the authoring canvas). */
  pageWidth?: number;
  /** logical page height in CSS px (default 16:9 of pageWidth). */
  pageHeight?: number;
  /** explicit Chromium/Chrome binary; else $LIEBSTOECKEL_CHROMIUM, else Playwright's */
  executablePath?: string;
  /** override the launch flags (defaults are container-friendly) */
  launchArgs?: string[];
  /** settle time after the print selection paints (lets entrance motion finish).
   *  More generous than capture's per-slide settle, every slide animates at once. */
  settleMs?: number;
  /** per-step timeout */
  timeoutMs?: number;
  /** resolve the 0-based slide indices once the count is known (open-ended specs). */
  selectIndices?(count: number): number[];
}

export interface PrintDriveResult {
  /** the produced PDF bytes. */
  pdf: Uint8Array;
  /** total slides the deck reported. */
  count: number;
  /** number of slides laid out (pages in the PDF). */
  pages: number;
}

/**
 * Render a built deck through `PrintView` and produce a **single, text-preserving**
 * PDF ((internal ADR)): every selected slide is stacked one-per-page in the DOM, so one
 * `page.pdf()` yields a multi-page vector PDF with selectable text. `emulateMedia`
 * keeps the deck's *screen* styles (not print CSS). **Loud**, throws if no Chromium.
 */
export async function printDeckPdf(html: string, opts: PrintDriveOptions = {}): Promise<PrintDriveResult> {
  const pageWidth = opts.pageWidth ?? 1280;
  const pageHeight = opts.pageHeight ?? Math.round((pageWidth * 9) / 16);
  const settleMs = opts.settleMs ?? 700;
  const timeout = opts.timeoutMs ?? 30000;

  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromium(opts),
    args: opts.launchArgs ?? DEFAULT_ARGS,
  });
  try {
    const page = await browser.newPage({ viewport: { width: pageWidth, height: pageHeight } });
    // print with the deck's screen styling, not print-media CSS
    await page.emulateMedia({ media: "screen" });
    await page.setContent(injectFlag(html, PRINT_FLAG, {}), { waitUntil: "load", timeout });
    await page.evaluate(() => (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready);
    try {
      await page.waitForFunction((key) => (window as unknown as Record<string, unknown>)[key] != null, SLIDE_COUNT, { timeout });
    } catch {
      throw new Error("deck never entered print mode, ensure it renders <Present> (no __LIEBSTOECKEL_SLIDE_COUNT__)");
    }
    const count = (await page.evaluate((key) => (window as unknown as Record<string, unknown>)[key], SLIDE_COUNT)) as number;

    const requested = opts.selectIndices ? opts.selectIndices(count) : Array.from({ length: count }, (_, i) => i);
    const indices = requested.filter((i) => Number.isInteger(i) && i >= 0 && i < count);

    // Hand PrintView the selection + a token it echoes into PRINT_READY once painted.
    const token = 1;
    await page.evaluate(
      ([evt, payload]) => window.dispatchEvent(new CustomEvent(evt as string, { detail: payload })),
      [PRINT_SELECT_EVENT, { indices, token }] as const,
    );
    await page.waitForFunction(
      ([key, tok]) => (window as unknown as Record<string, unknown>)[key as string] === tok,
      [PRINT_READY, token] as const,
      { timeout },
    );
    if (settleMs > 0) await page.waitForTimeout(settleMs);

    const pdf = await page.pdf({
      width: `${pageWidth}px`,
      height: `${pageHeight}px`,
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: false,
    });
    return { pdf: new Uint8Array(pdf), count, pages: indices.length };
  } finally {
    await browser.close();
  }
}
