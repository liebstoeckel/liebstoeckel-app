import { parseThumbnails, THUMBS_ATTR } from "./build/thumbnails";

export interface ThumbnailSet {
  w: number;
  h: number;
  /** data-URI for a slide, or undefined if not captured */
  get(index: number): string | undefined;
}

let cache: ThumbnailSet | null | undefined;

/** Read the thumbnails manifest embedded in the current document, if any.
 *  Memoized (the manifest is static for a loaded deck). No DOM / no block → null,
 *  so callers fall back to the live <DeckThumb>. */
export function readThumbnails(): ThumbnailSet | null {
  if (cache !== undefined) return cache;
  cache = parse();
  return cache;
}

function parse(): ThumbnailSet | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(`script[${THUMBS_ATTR}]`);
  if (!el?.textContent) return null;
  try {
    const m = parseThumbnails(el.textContent);
    return { w: m.w, h: m.h, get: (i) => m.thumbs[i] };
  } catch {
    return null;
  }
}
