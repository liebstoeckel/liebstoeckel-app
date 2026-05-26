# @present-it/thumbnails

Build-time slide thumbnails for present-it decks. A headless browser renders each
slide once, motionless, and screenshots it; the images are embedded into the deck's
single `.html` as a **thumbnails manifest**. The engine then shows cheap `<img>`
previews in the **overview grid** instead of mounting *N* live slides (which on a
large deck means *N* `ScaledStage`s + infinite `Atmosphere` animations). The
presenter view renders its current/next previews live (only two slides), so it stays
crisp and reflects live state — it does not use these thumbnails.

Default size is the native **1280×720** canvas (`--width 640 --scale 2`), so the
overview never upscales; WebP keeps each ~16–18 KB. Lower `--width` to shrink a
large deck.

## Use

```bash
# build the deck first, then capture into it (idempotent, in place)
bunx present-it-thumbnails dist/index.html            # --format webp --width 640 --quality 80 --scale 2
```

```ts
import { addThumbnailsToFile, captureThumbnails } from "@present-it/thumbnails";

await addThumbnailsToFile("dist/index.html");          // capture + embed in place
const manifest = await captureThumbnails(html);        // or just get the manifest
```

It's **opt-in / prod-only** (needs a browser). The demo build runs it when
`PRESENT_IT_THUMBS=1` is set.

## How it works

1. The capturer injects `window.__PRESENT_IT_CAPTURE__` before the deck boots, so the
   engine's `Present` renders **`CaptureView`** — one slide at a time, all `<Step>`s
   revealed, `Atmosphere still`, no transitions, on the fixed 1280×720 canvas.
   `CaptureView` provides an offline (`live:false`) plugin context, so each
   `<Plugin>` renders its **fallback** (the standalone preview, with the author's
   `props`) instead of nothing.
2. It reads `__PRESENT_IT_SLIDE_COUNT__`, then for each slide dispatches a
   `present-it:capture` event and waits for `__PRESENT_IT_CAPTURE_READY__` to match
   before screenshotting the viewport (sized to the thumbnail × `scale`).
3. The browser yields a lossless PNG (Playwright only screenshots PNG/JPEG);
   **`Bun.Image`** (Bun's built-in codec — no `sharp`) transcodes it to a **WebP**
   data-URI (≈ half a JPEG; `format: "webp" | "jpeg" | "png"` is selectable). All of
   them go into a `<script type="application/json" data-present-it-thumbnails>` block
   via `embedThumbnails` (re-running strips the prior block).

## Chromium

Resolves a binary from `executablePath` → `$PRESENT_IT_CHROMIUM` → Playwright's
bundled Chromium (`bunx playwright install chromium`). Launches with
container-friendly flags (`--no-sandbox --disable-gpu --disable-dev-shm-usage
--single-process --no-zygote`) using the **full** Chromium build (the
`chrome-headless-shell` SIGSEGVs in some sandboxes).
