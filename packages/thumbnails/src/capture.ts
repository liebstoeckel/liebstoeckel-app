import { chromium } from "playwright-core";
import {
  CAPTURE_EVENT,
  CAPTURE_FLAG,
  CAPTURE_READY,
  SLIDE_COUNT,
} from "@present-it/engine/build/capture-protocol";
import type { ThumbnailManifest } from "@present-it/engine/build/thumbnails";

export type ThumbnailFormat = "webp" | "jpeg" | "png";

export interface CaptureOptions {
  /** thumbnail width in CSS px (height derived 16:9 unless given). Default 640 ×
   *  scale 2 = 1280×720, the native authoring canvas — so the overview is never
   *  upscaled even on large/hi-dpi screens. Lower it to shrink a big deck. */
  width?: number;
  height?: number;
  /** output image format (default "webp" — ~half a JPEG, alpha, no extra deps) */
  format?: ThumbnailFormat;
  /** lossy quality 0–100 (ignored for png) */
  quality?: number;
  /** device scale factor — renders at 2× for crisp text, stored at w*scale */
  scale?: number;
  /** explicit Chromium/Chrome binary; else $PRESENT_IT_CHROMIUM, else Playwright's */
  executablePath?: string;
  /** override the launch flags (defaults are container-friendly) */
  launchArgs?: string[];
  /** extra settle time after a slide reports ready (late chart/font paints) */
  settleMs?: number;
  /** per-step timeout */
  timeoutMs?: number;
  onSlide?(index: number, total: number): void;
}

// Bun's built-in image codec (Bun.Image) — not yet in @types/bun, so typed here.
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

/** Resolve a Chromium binary: explicit → $PRESENT_IT_CHROMIUM → Playwright's. */
export function resolveChromium(opts: CaptureOptions = {}): string {
  if (opts.executablePath) return opts.executablePath;
  if (process.env.PRESENT_IT_CHROMIUM) return process.env.PRESENT_IT_CHROMIUM;
  try {
    return chromium.executablePath();
  } catch {
    throw new Error(
      "No Chromium found for thumbnail capture. Run `bunx playwright install chromium`, " +
        "or set PRESENT_IT_CHROMIUM to a Chrome/Chromium binary.",
    );
  }
}

/** Whether a Chromium is available for capture (cheap — resolves a path, no launch). */
export function hasChromium(opts: CaptureOptions = {}): boolean {
  try {
    resolveChromium(opts);
    return true;
  } catch {
    return false;
  }
}

/** Decide whether to capture thumbnails: on by default, opt out with
 *  `PRESENT_IT_NO_THUMBS`, and skipped (not failed) when no Chromium is available.
 *  Pure — `env`/`chromium` are injectable for tests. */
export function thumbnailsEnabled(
  env: Record<string, string | undefined> = process.env,
  chromium = hasChromium(),
): { enabled: boolean; reason?: string } {
  if (env.PRESENT_IT_NO_THUMBS) return { enabled: false, reason: "PRESENT_IT_NO_THUMBS is set" };
  if (!chromium) {
    return { enabled: false, reason: "no Chromium (run `bunx playwright install chromium` or set PRESENT_IT_CHROMIUM)" };
  }
  return { enabled: true };
}

/** Inject the capture flag as a classic (non-deferred) inline script so it runs
 *  before the deck's deferred module bundle boots → Present renders CaptureView. */
function injectCaptureFlag(html: string): string {
  const tag = `<script>window.${CAPTURE_FLAG}={"index":0};</script>`;
  const head = html.match(/<head[^>]*>/i);
  if (head) return html.replace(head[0], head[0] + tag);
  const body = html.match(/<body[^>]*>/i);
  if (body) return html.replace(body[0], body[0] + tag);
  return tag + html;
}

/** Render a built single-file deck in a headless browser and screenshot each slide
 *  as a data-URI (WebP by default, via Bun.Image). Returns a thumbnails manifest
 *  (embed it with `embedThumbnails`). The deck must use `Present`/`CaptureView`. */
export async function captureThumbnails(html: string, opts: CaptureOptions = {}): Promise<ThumbnailManifest> {
  const width = opts.width ?? 640;
  const height = opts.height ?? Math.round((width * 9) / 16);
  const format = opts.format ?? "webp";
  const quality = opts.quality ?? 80;
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
      throw new Error("deck never entered capture mode — ensure it renders <Present> (no __PRESENT_IT_SLIDE_COUNT__)");
    }
    const count = (await page.evaluate((key) => (window as unknown as Record<string, unknown>)[key], SLIDE_COUNT)) as number;

    const thumbs: Record<number, string> = {};
    for (let i = 0; i < count; i++) {
      opts.onSlide?.(i, count);
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
      // PNG (lossless) from the browser → transcode natively to the target format
      const png = await page.screenshot({ type: "png" });
      thumbs[i] = await encodeDataUri(png, format, quality);
    }
    return { v: 1, w: Math.round(width * scale), h: Math.round(height * scale), thumbs };
  } finally {
    await browser.close();
  }
}
