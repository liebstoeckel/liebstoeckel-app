// A thumbnails manifest mirrors the plugin manifest: an inert JSON <script> the
// browser never executes, embedded into the single-file deck. Each entry maps a
// slide index to a data-URI image (built by @liebstoeckel/thumbnails). The engine
// reads it to render cheap <img> previews in the overview / presenter instead of
// mounting N live slides. Pure string/JSON helpers, no DOM, no browser.

export interface ThumbnailManifest {
  v: 1;
  /** intrinsic pixel size of each thumbnail */
  w: number;
  h: number;
  /** slide index → data-URI (e.g. "data:image/jpeg;base64,…") */
  thumbs: Record<number, string>;
}

export const THUMBS_ATTR = "data-liebstoeckel-thumbnails";

export const encodeThumbnails = (m: ThumbnailManifest): string => JSON.stringify(m);
export const parseThumbnails = (json: string): ThumbnailManifest => JSON.parse(json) as ThumbnailManifest;

/** Embed (or replace) the thumbnails manifest as an inert JSON <script> before
 *  the closing </body>. Re-embedding strips any prior block so re-running is idempotent.
 *  Inserts before the LAST </body>, a deck's inlined JS bundle can contain the string
 *  "</body>" in a literal (e.g. an iframe srcdoc), and the real document </body> is last. */
export function embedThumbnails(html: string, m: ThumbnailManifest): string {
  const stripped = stripThumbnails(html);
  const tag = `<script type="application/json" ${THUMBS_ATTR}>${encodeThumbnails(m)}</script>`;
  const at = stripped.lastIndexOf("</body>");
  return at >= 0 ? stripped.slice(0, at) + tag + stripped.slice(at) : stripped + tag;
}

const blockRe = new RegExp(`<script[^>]*${THUMBS_ATTR}[^>]*>[\\s\\S]*?</script>`, "i");

/** Remove an embedded thumbnails block (if present). */
export function stripThumbnails(html: string): string {
  return html.replace(blockRe, "");
}

/** Extract the thumbnails manifest from a built HTML, or null if none/invalid. */
export function extractThumbnails(html: string): ThumbnailManifest | null {
  const re = new RegExp(`<script[^>]*${THUMBS_ATTR}[^>]*>([\\s\\S]*?)</script>`, "i");
  const m = html.match(re);
  if (!m) return null;
  try {
    return parseThumbnails(m[1]!);
  } catch {
    return null;
  }
}
