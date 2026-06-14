# @liebstoeckel/thumbnails

> Slide thumbnail capture for liebstoeckel decks. Headless Chromium screenshots embedded into the deck.

Part of [liebstoeckel](https://liebstoeckel.app), a code-first presentation framework. You write decks in MDX and TSX and build them into a single self-contained HTML file with no server or runtime dependencies. The same file works offline, and when you host it the deck runs a live session between the presenter and the audience. Built on Bun, React 19, Motion, and Tailwind v4.

> Pre-release software. The API can still change.

It renders each slide of a built deck with headless Chromium and embeds the screenshots back into the HTML, so the overview grid, presenter view, and link previews have real thumbnails. It encodes to WebP through `Bun.Image`. If no Chromium is available, it skips the step and the deck still builds.

## Install

```sh
bun add -d @liebstoeckel/thumbnails
bun add react   # peer
```

> Needs a real Chromium binary. It's resolved from `opts.executablePath`, then `$LIEBSTOECKEL_CHROMIUM`, then Playwright's installed Chromium. The package ships `playwright-core` only, so install a browser or point at one you already have.

## Usage

The common case is to swap your `buildDeck` call for the thumbnail-aware one:

```ts
// build.ts
import { buildDeckWithThumbnails } from "@liebstoeckel/thumbnails/build";

await buildDeckWithThumbnails({ entry: "./index.html", outdir: "./dist" });
// writes dist/index.html with per-slide thumbnails embedded
```

Or capture against an already-built file:

```ts
import { addThumbnailsToFile } from "@liebstoeckel/thumbnails";

await addThumbnailsToFile("dist/index.html");
```

## Exports

| Entry | What |
|---|---|
| `@liebstoeckel/thumbnails` | `captureThumbnails`, `addThumbnailsToFile`, `resolveChromium`, `hasChromium`, `thumbnailsEnabled`, the manifest re-exports, and the `CaptureOptions` / `ThumbnailFormat` / `ThumbnailManifest` types |
| `@liebstoeckel/thumbnails/build` | `buildDeckWithThumbnails(build?, capture?)`, the standard deck `build.ts` one-liner |
| `@liebstoeckel/thumbnails/cli` | `runThumbs` (powers the `liebstoeckel-thumbnails` bin) |

`CaptureOptions` defaults: `width` 640, `format` `webp`, `quality` 80, `scale` 2, `settleMs` 250, `timeoutMs` 15000.

## Gotchas

- It only works on a built `<Present>` deck, not raw source.
- It skips silently when no Chromium is found or `LIEBSTOECKEL_NO_THUMBS` is set, which is handy in CI where you don't want to install a browser.

## Architecture

It drives a built single-file deck through its own capture protocol (re-exported from `@liebstoeckel/engine/build`) and screenshots each slide. The deck cooperates by rendering `CaptureView` instead of the normal presenter when the capture flag is present.

| File | Role |
|---|---|
| `src/capture.ts` | The browser side. `captureThumbnails(html, opts)` launches headless Chromium through `playwright-core`, injects the `CAPTURE_FLAG` as a classic inline `<script>` (so it runs before the deferred deck bundle boots), waits for `SLIDE_COUNT`, then for each slide dispatches `CAPTURE_EVENT` and waits for `CAPTURE_READY` to match before a settle delay and a PNG `page.screenshot()`. It also holds `resolveChromium`, `hasChromium`, `thumbnailsEnabled`, and the PNG-to-WebP/JPEG transcode through `Bun.Image`. |
| `src/index.ts` | `addThumbnailsToFile(path)` reads the HTML, runs `captureThumbnails`, then re-embeds in place with `embedThumbnails` (from the engine). It's idempotent, since a prior block is stripped first. It re-exports the engine manifest helpers (`embedThumbnails` / `extractThumbnails` / `stripThumbnails`). |
| `src/build.ts` | `buildDeckWithThumbnails()` calls the engine's `buildDeck`, then `addThumbnailsToFile` on the output. It wraps capture in a guard (`thumbnailsEnabled`) and a try/catch, so the optional step never fails the build. |
| `src/cli.ts` | `runThumbs` powers the `liebstoeckel-thumbs` bin and the CLI's `thumbs` command. It parses `--width/--quality/--scale/--format` and calls `addThumbnailsToFile`. |

A few sequencing notes:

- Chromium launches with container-friendly flags (`--no-sandbox`, `--single-process`, `--no-zygote`, …) so it runs without a GPU or a user namespace.
- It renders at `deviceScaleFactor` `scale` (default 2) for crisp text, and the manifest stores the scaled `w`/`h`.
- The binary resolution order is `opts.executablePath`, then `$LIEBSTOECKEL_CHROMIUM`, then Playwright's installed Chromium, each with an `existsSync` check so `hasChromium()` stays honest in CI.

## Links

- [Thumbnails guide](https://docs.liebstoeckel.app/guides/thumbnails/) and [Chromium setup](https://docs.liebstoeckel.app/guides/chromium/)
- [Homepage](https://liebstoeckel.app)
- [Source and issues](https://github.com/liebstoeckel/liebstoeckel-app)

Licensed under [MPL-2.0](https://github.com/liebstoeckel/liebstoeckel-app/blob/main/LICENSE).
