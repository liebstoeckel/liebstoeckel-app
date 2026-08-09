import { test, expect, describe } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  embedThumbnails,
  extractThumbnails,
  stripThumbnails,
  type ThumbnailManifest,
} from "@liebstoeckel/engine/build/thumbnails";
import { captureThumbnails, renderDeckSlides, resolveChromium, thumbnailsEnabled } from "./capture";
import { withThumbnails } from "./index";

describe("thumbnails manifest (pure)", () => {
  const m: ThumbnailManifest = { v: 1, w: 640, h: 360, thumbs: { 0: "data:image/jpeg;base64,AAA", 1: "data:image/jpeg;base64,BBB" } };

  test("embed → extract round-trips", () => {
    const html = embedThumbnails("<html><body><div id=root></div></body></html>", m);
    const back = extractThumbnails(html);
    expect(back).toEqual(m);
  });

  test("embedding is idempotent (replaces the prior block)", () => {
    let html = embedThumbnails("<html><body></body></html>", m);
    html = embedThumbnails(html, { ...m, thumbs: { 0: "data:image/jpeg;base64,CCC" } });
    const count = (html.match(/data-liebstoeckel-thumbnails/g) ?? []).length;
    expect(count).toBe(1);
    expect(extractThumbnails(html)!.thumbs[0]).toBe("data:image/jpeg;base64,CCC");
  });

  test("strip removes the block", () => {
    const html = embedThumbnails("<html><body></body></html>", m);
    expect(extractThumbnails(stripThumbnails(html))).toBeNull();
  });

  test("extract returns null when absent or invalid", () => {
    expect(extractThumbnails("<html></html>")).toBeNull();
    expect(extractThumbnails(`<script type="application/json" data-liebstoeckel-thumbnails>{bad</script>`)).toBeNull();
  });
});

describe("thumbnailsEnabled (default-on gating)", () => {
  test("enabled by default when a browser is available", () => {
    expect(thumbnailsEnabled({}, true)).toEqual({ enabled: true });
  });
  test("opt out with LIEBSTOECKEL_NO_THUMBS", () => {
    const r = thumbnailsEnabled({ LIEBSTOECKEL_NO_THUMBS: "1" }, true);
    expect(r.enabled).toBe(false);
    expect(r.reason).toContain("LIEBSTOECKEL_NO_THUMBS");
  });
  test("skips (does not fail) when no Chromium is available", () => {
    const r = thumbnailsEnabled({}, false);
    expect(r.enabled).toBe(false);
    expect(r.reason).toContain("Chromium");
  });
});

describe("withThumbnails (gated, never-fatal)", () => {
  test("skips gracefully (unchanged html + reason) when disabled", async () => {
    const prev = process.env.LIEBSTOECKEL_NO_THUMBS;
    process.env.LIEBSTOECKEL_NO_THUMBS = "1";
    try {
      const html = "<html><body><div id=root></div></body></html>";
      const r = await withThumbnails(html);
      expect(r.html).toBe(html); // unchanged
      expect(r.manifest).toBeNull();
      expect(r.skipped).toContain("LIEBSTOECKEL_NO_THUMBS");
    } finally {
      if (prev === undefined) delete process.env.LIEBSTOECKEL_NO_THUMBS;
      else process.env.LIEBSTOECKEL_NO_THUMBS = prev;
    }
  });
});

// Browser-backed tests: skip cleanly if no Chromium is available.
let hasChromium = false;
try {
  resolveChromium();
  hasChromium = true;
} catch {
  hasChromium = false;
}

// A stub deck that implements the capture protocol directly (no engine), so the
// capturer's drive loop is tested in isolation: it reports a slide count, then
// paints + reports ready for whatever index the capturer asks for.
const STUB = `<!doctype html><html><head><meta charset=utf-8></head><body>
<div id=root style="position:fixed;inset:0;background:#0b1020"></div>
<script>
  const cap = window.__LIEBSTOECKEL_CAPTURE__;
  if (cap) {
    window.__LIEBSTOECKEL_SLIDE_COUNT__ = 3;
    const colors = ['#1e90ff','#22c55e','#f59e0b'];
    function render(i){
      document.getElementById('root').style.background = colors[i % colors.length];
      window.__LIEBSTOECKEL_CAPTURE_READY__ = -1;
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ window.__LIEBSTOECKEL_CAPTURE_READY__ = i; }); });
    }
    window.addEventListener('liebstoeckel:capture', function(e){ render(e.detail); });
    render(cap.index || 0);
  }
</script></body></html>`;

// A stub whose slide content fades in via a delayed finite animation: the frame
// is only correct once the animation finished (background flips to solid green
// at animationend). A naive fixed settle screenshots the mid-fade state.
const ANIMATED_STUB = `<!doctype html><html><head><meta charset=utf-8><style>
  @keyframes reveal { from { opacity: 0 } to { opacity: 1 } }
  #content { position: fixed; inset: 0; background: #22c55e; opacity: 0;
             animation: reveal 400ms ease-out 300ms forwards }
  @keyframes spin { to { transform: rotate(360deg) } }
  #drift { position: fixed; left: 0; top: 0; width: 8px; height: 8px;
           background: #f59e0b; animation: spin 5s linear infinite }
</style></head><body style="background:#0b1020">
<div id=content></div><div id=drift></div>
<script>
  const cap = window.__LIEBSTOECKEL_CAPTURE__;
  if (cap) {
    window.__LIEBSTOECKEL_SLIDE_COUNT__ = 1;
    function render(i){
      window.__LIEBSTOECKEL_CAPTURE_READY__ = -1;
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ window.__LIEBSTOECKEL_CAPTURE_READY__ = i; }); });
    }
    window.addEventListener('liebstoeckel:capture', function(e){ render(e.detail); });
    render(cap.index || 0);
  }
</script></body></html>`;

describe.skipIf(!hasChromium)("captureThumbnails (headless)", () => {
  test("waits out finite entrance animations, ignores infinite ones", async () => {
    // settleMs 0: only the animation-quiescence wait can make the frame
    // correct, and the infinite spinner must not stall it (bounded wait).
    const start = Date.now();
    let opacityAtFrame = "";
    await renderDeckSlides(ANIMATED_STUB, { width: 160, scale: 1, settleMs: 0 }, async (_i, page) => {
      opacityAtFrame = (await page.evaluate(
        () => getComputedStyle(document.getElementById("content")!).opacity,
      )) as string;
    });
    // the delayed 400ms fade finished before the frame callback ran
    expect(opacityAtFrame).toBe("1");
    expect(Date.now() - start).toBeLessThan(20_000);
  }, 30_000);

  test("drives the capture protocol and returns WebP data-URIs (default)", async () => {
    const m = await captureThumbnails(STUB, { width: 160, quality: 70, scale: 1, settleMs: 0 });
    expect(Object.keys(m.thumbs).length).toBe(3);
    expect(m.w).toBe(160);
    expect(m.h).toBe(90);
    for (const uri of Object.values(m.thumbs)) {
      expect(uri.startsWith("data:image/webp;base64,")).toBe(true);
      expect(uri.length).toBeGreaterThan(100); // a real, non-empty image (WebP packs a flat frame tiny)
    }
  }, 30_000);

  test("honors an explicit format (jpeg)", async () => {
    const m = await captureThumbnails(STUB, { width: 160, scale: 1, settleMs: 0, format: "jpeg" });
    expect(m.thumbs[0]!.startsWith("data:image/jpeg;base64,")).toBe(true);
  }, 30_000);

  test("withThumbnails embeds into the html when enabled", async () => {
    const r = await withThumbnails(STUB, { width: 160, scale: 1, settleMs: 0 });
    expect(r.skipped).toBeUndefined();
    expect(Object.keys(r.manifest!.thumbs).length).toBe(3);
    expect(r.html).toContain("data-liebstoeckel-thumbnails");
    expect(extractThumbnails(r.html)).toEqual(r.manifest);
  }, 30_000);

  const BUILT = join(import.meta.dir, "../../../presentations/poll-demo/dist/index.html");
  test.skipIf(!existsSync(BUILT))("captures the real built poll deck (engine CaptureView)", async () => {
    const html = await Bun.file(BUILT).text();
    const m = await captureThumbnails(html, { width: 320, settleMs: 50 });
    expect(Object.keys(m.thumbs).length).toBe(6); // title, poll, poll (pace), qa, reactions, outro
    expect(m.thumbs[0]!.startsWith("data:image/webp;base64,")).toBe(true);
  }, 45_000);

  test("captures identically over the raw-CDP transport (the Windows path)", async () => {
    // Windows always drives Chrome this way (playwright's transports break
    // under Bun there); exercising it on every platform keeps it from rotting.
    process.env.LIEBSTOECKEL_CDP_DRIVER = "1";
    try {
      const m = await captureThumbnails(STUB, { width: 160, quality: 70, scale: 1, settleMs: 0 });
      expect(Object.keys(m.thumbs).length).toBe(3);
      expect(m.w).toBe(160);
      expect(m.h).toBe(90);
      for (const uri of Object.values(m.thumbs)) {
        expect(uri.startsWith("data:image/webp;base64,")).toBe(true);
        expect(uri.length).toBeGreaterThan(100);
      }
    } finally {
      delete process.env.LIEBSTOECKEL_CDP_DRIVER;
    }
  }, 30_000);
});
