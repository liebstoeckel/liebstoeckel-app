# @liebstoeckel/thumbnails

> Slide thumbnail capture for liebstoeckel decks — headless Chromium screenshots embedded into the deck.

Part of **[liebstoeckel](https://liebstoeckel.app)** — a code-first presentation framework: author decks in **MDX + TSX**, get one self-contained HTML file that's animated, interactive, and live-shareable. Built on **Bun + React 19 + Motion + Tailwind v4**.

> ⚠️ Pre-release (`0.0.0`). APIs may change.

Renders each slide of a built deck with headless Chromium and embeds the screenshots back into the HTML — so the deck overview, presenter view, and link previews have real thumbnails. Encodes to WebP via `Bun.Image`. Degrades gracefully: if no Chromium is available it simply skips, and the deck still builds.

## Install

```sh
bun add -d @liebstoeckel/thumbnails
bun add react   # peer
```

> Needs a real **Chromium** binary (resolved from `opts.executablePath` → `$LIEBSTOECKEL_CHROMIUM` → Playwright's installed Chromium). Ships `playwright-core` only — install a browser, or point at one you already have.

## Usage

The common case — swap your `buildDeck` call for the thumbnail-aware one:

```ts
// build.ts
import { buildDeckWithThumbnails } from "@liebstoeckel/thumbnails/build";

await buildDeckWithThumbnails({ entry: "./index.html", outdir: "./dist" });
// → dist/index.html, with per-slide thumbnails embedded
```

Or capture against an already-built file:

```ts
import { addThumbnailsToFile } from "@liebstoeckel/thumbnails";

await addThumbnailsToFile("dist/index.html");
```

## Exports

| Entry | What |
|---|---|
| `@liebstoeckel/thumbnails` | `captureThumbnails`, `addThumbnailsToFile`, `resolveChromium`, `hasChromium`, `thumbnailsEnabled`, manifest re-exports, and `CaptureOptions` / `ThumbnailFormat` / `ThumbnailManifest` types |
| `@liebstoeckel/thumbnails/build` | `buildDeckWithThumbnails(build?, capture?)` — the standard deck `build.ts` one-liner |
| `@liebstoeckel/thumbnails/cli` | `runThumbs` (powers the `liebstoeckel-thumbnails` bin) |

`CaptureOptions` defaults: `width` 640, `format` `webp`, `quality` 80, `scale` 2, `settleMs` 250, `timeoutMs` 15000.

## Gotchas

- Only works on a **built `<Present>` deck**, not raw source.
- Skips silently when no Chromium is found or `LIEBSTOECKEL_NO_THUMBS` is set — useful in CI where you don't want to install a browser.

## Architecture

Drives a built single-file deck through its own **capture protocol** (re-exported from `@liebstoeckel/engine/build`) and screenshots each slide. The deck cooperates: it renders `CaptureView` instead of the normal presenter when the capture flag is present.

| File | Role |
|---|---|
| `src/capture.ts` | The browser side. `captureThumbnails(html, opts)` launches headless Chromium via `playwright-core`, injects the `CAPTURE_FLAG` as a classic inline `<script>` (so it runs before the deferred deck bundle boots), waits for `SLIDE_COUNT`, then for each slide dispatches `CAPTURE_EVENT` and waits for `CAPTURE_READY` to match before a settle delay and a PNG `page.screenshot()`. Also `resolveChromium`, `hasChromium`, `thumbnailsEnabled`, and the PNG→WebP/JPEG transcode via `Bun.Image`. |
| `src/index.ts` | `addThumbnailsToFile(path)` — read the HTML, `captureThumbnails`, then re-embed in place with `embedThumbnails` (engine). Idempotent: a prior block is stripped first. Re-exports the engine manifest helpers (`embedThumbnails` / `extractThumbnails` / `stripThumbnails`). |
| `src/build.ts` | `buildDeckWithThumbnails()` — calls engine `buildDeck`, then `addThumbnailsToFile` on the output. Wraps capture in a guard (`thumbnailsEnabled`) and a try/catch so the optional step **never fails the build**. |
| `src/cli.ts` | `runThumbs` — powers the `liebstoeckel-thumbs` bin and the CLI's `thumbs` command; parses `--width/--quality/--scale/--format` and calls `addThumbnailsToFile`. |

Capture sequencing notes:

- Chromium launches with container-friendly flags (`--no-sandbox`, `--single-process`, `--no-zygote`, …) so it runs without a GPU or user namespace.
- Renders at `deviceScaleFactor` `scale` (default 2) for crisp text; the manifest stores the scaled `w`/`h`.
- Resolution order for the binary: `opts.executablePath` → `$LIEBSTOECKEL_CHROMIUM` → Playwright's installed Chromium, with an `existsSync` check so `hasChromium()` stays honest in CI.

## Docs

**[liebstoeckel.app/guides/thumbnails](https://docs.liebstoeckel.app/guides/thumbnails/)**

## License

[MPL-2.0](https://github.com/limond/liebstoeckel-app-public/blob/main/LICENSE)
