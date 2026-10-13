// The deck page as the relay sends it: compressed once per session, revalidated by the
// browser instead of downloaded again.
//
// A deck is about 1 MB, and every viewer's copy differs only in a few hundred bytes: the
// bootstrap script with its grant and participant id. Compressing the whole page per
// request would cost the relay's single core about 30 ms per join, so a room of a few
// thousand joining at once would spend its fan-out time on gzip. Instead the parts before
// and after the bootstrap are deflated once per session, and a request deflates only its
// bootstrap and joins the three pieces into one gzip member. The pieces are compressed on
// their own (no shared window, no dictionary), so the grant is never compressed together
// with anything else on the page.
//
// The audience gets a slimmer copy: without the slide thumbnails, which only the overview
// grid shows, and viewers cannot open it. The presenter gets the deck exactly as uploaded.

import { createHash } from "node:crypto";
import zlib from "node:zlib";
import type { LiveBootstrap } from "@liebstoeckel/live-server";

/** Bumped whenever what the relay puts into the page changes, so a browser holding an
 *  older copy downloads the new one instead of being told it is current. */
const PAGE_FORMAT = 1;

/** The bootstrap script, exactly as `injectBootstrap` writes it. */
export function bootstrapTag(boot: LiveBootstrap): string {
  const json = JSON.stringify(boot).replace(/</g, "\\u003c");
  return `<script>window.__LIEBSTOECKEL_LIVE__=${json}</script>`;
}

/** Where `injectBootstrap` puts the bootstrap: before the first `</head>`, else before
 *  the first `<body`, else at the start. */
export function bootstrapAt(html: string): number {
  const head = html.indexOf("</head>");
  if (head >= 0) return head;
  const body = html.indexOf("<body");
  return body >= 0 ? body : 0;
}

/** The deck a viewer gets: the slide thumbnails are dropped (the overview grid that shows
 *  them is the presenter's), everything else stays, plugin manifest, license notices and
 *  embedded source included. */
export function audienceHtml(html: string): string {
  return html.replace(THUMBNAILS_BLOCK, "");
}

/** The attribute the engine's build marks the thumbnails block with (a test keeps the two
 *  the same; the relay does not depend on the engine package). */
export const THUMBNAILS_ATTR = "data-liebstoeckel-thumbnails";

/** The block itself, an inert `<script>` before `</body>`. Only a `<script ...>` tag that
 *  carries the attribute matches, not the engine's code that looks the block up. */
const THUMBNAILS_BLOCK = new RegExp(`<script[^>]*${THUMBNAILS_ATTR}[^>]*>[\\s\\S]*?</script>`, "i");

// --- gzip from pieces ---------------------------------------------------------------

const GZIP_HEADER = Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0xff]);
const SYNC = { finishFlush: zlib.constants.Z_SYNC_FLUSH } as const;

function gf2Times(mat: Uint32Array, vec: number): number {
  let sum = 0;
  let v = vec >>> 0;
  for (let i = 0; v !== 0; i++, v >>>= 1) if (v & 1) sum ^= mat[i]!;
  return sum >>> 0;
}

function gf2Square(square: Uint32Array, mat: Uint32Array): void {
  for (let n = 0; n < 32; n++) square[n] = gf2Times(mat, mat[n]!);
}

/** The CRC-32 of `a` followed by `b`, from the CRC of each and the length of `b` (zlib's
 *  `crc32_combine`), so a request never runs a CRC over the whole page. */
export function crc32Combine(crcA: number, crcB: number, lenB: number): number {
  let crc = crcA >>> 0;
  if (lenB <= 0) return crc;
  const even = new Uint32Array(32);
  const odd = new Uint32Array(32);
  odd[0] = 0xedb88320; // the CRC-32 polynomial: the operator for one zero bit
  for (let n = 1, row = 1; n < 32; n++, row <<= 1) odd[n] = row >>> 0;
  gf2Square(even, odd); // two zero bits
  gf2Square(odd, even); // four zero bits
  let len = lenB;
  for (;;) {
    gf2Square(even, odd);
    if (len & 1) crc = gf2Times(even, crc);
    len = Math.floor(len / 2);
    if (len === 0) break;
    gf2Square(odd, even);
    if (len & 1) crc = gf2Times(odd, crc);
    len = Math.floor(len / 2);
    if (len === 0) break;
  }
  return (crc ^ crcB) >>> 0;
}

/** One session's page, ready to send: the HTML around the bootstrap, kept compressed. */
export interface PreparedPage {
  /** Content digest of the page without its bootstrap (the same on every relay). */
  digest: string;
  /** Uncompressed size (bytes) of the page without its bootstrap. */
  bytes: number;
  /** Compressed bytes held for it. */
  heldBytes: number;
  /** The page with this bootstrap, gzip-encoded. */
  gzip(boot: LiveBootstrap): Uint8Array<ArrayBuffer>;
  /** The page with this bootstrap, as text. */
  text(boot: LiveBootstrap): string;
}

/** Prepare a page for many requests: compress what is the same for all of them once. */
export function preparePage(html: string): PreparedPage {
  const at = bootstrapAt(html);
  const before = Buffer.from(html.slice(0, at), "utf8");
  const after = Buffer.from(html.slice(at), "utf8");
  // Level 9 costs more once and nothing per request.
  const head = zlib.deflateRawSync(before, { ...SYNC, level: 9 });
  const tail = zlib.deflateRawSync(after, { level: 9 });
  const headCrc = zlib.crc32(before);
  const tailCrc = zlib.crc32(after);
  const digest = createHash("sha256").update(before).update(after).digest("base64url").slice(0, 22);
  // Only the compressed pieces are kept, not the text.
  const beforeLen = before.byteLength;
  const afterLen = after.byteLength;
  return {
    digest,
    bytes: beforeLen + afterLen,
    heldBytes: head.byteLength + tail.byteLength,
    gzip(boot) {
      const tag = Buffer.from(bootstrapTag(boot), "utf8");
      const mid = zlib.deflateRawSync(tag, SYNC);
      const crc = crc32Combine(zlib.crc32(tag, headCrc), tailCrc, afterLen);
      const trailer = Buffer.alloc(8);
      trailer.writeUInt32LE(crc, 0);
      trailer.writeUInt32LE((beforeLen + tag.byteLength + afterLen) >>> 0, 4);
      return Buffer.concat([GZIP_HEADER, head, mid, tail, trailer]) as Uint8Array<ArrayBuffer>;
    },
    text(boot) {
      // Rare (a client that takes no gzip): decoded from the held pieces.
      const text = (b: Buffer) => zlib.inflateRawSync(b, SYNC).toString("utf8");
      return text(head) + bootstrapTag(boot) + text(tail);
    },
  };
}

// --- request helpers ------------------------------------------------------------------

/** Whether the request takes a gzip body (`Accept-Encoding`, honouring `q=0`). */
export function acceptsGzip(header: string | null | undefined): boolean {
  if (!header) return false;
  for (const part of header.split(",")) {
    const [name, ...params] = part.split(";").map((s) => s.trim().toLowerCase());
    if (name !== "gzip" && name !== "*") continue;
    const q = params.find((p) => p.startsWith("q="));
    return q === undefined || Number(q.slice(2)) > 0;
  }
  return false;
}

/** The validator of one viewer's page: what the page holds for that viewer (deck, grant,
 *  participant, socket address) and the policy it is served under. A truncated SHA-256,
 *  so two viewers never share one. */
export function pageEtag(page: PreparedPage, boot: LiveBootstrap, csp: string): string {
  const h = createHash("sha256")
    .update(`${PAGE_FORMAT}\0${page.digest}\0${JSON.stringify(boot)}\0${csp}`)
    .digest("base64url")
    .slice(0, 27);
  return `W/"${h}"`;
}

/** Whether `If-None-Match` names this validator (weak comparison, as for GET). */
export function notModified(header: string | null | undefined, etag: string): boolean {
  if (!header) return false;
  const bare = etag.replace(/^W\//, "");
  return header.split(",").some((t) => {
    const v = t.trim();
    return v === "*" || v.replace(/^W\//, "") === bare;
  });
}
