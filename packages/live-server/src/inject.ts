import type { Role } from "./session";

export interface LiveBootstrap {
  ws: string; // websocket url
  session: string;
  role: Role;
  token: string;
  participant: string;
  /** the read-only follow-along link (for the in-deck QR) */
  viewer?: string;
}

/** Inject `window.__LIEBSTOECKEL_LIVE__` into <head> so the client knows a server
 *  is present (absence → standalone fallback). `</` is escaped to keep the inline
 *  script well-formed. */
export function injectBootstrap(html: string, boot: LiveBootstrap): string {
  const json = JSON.stringify(boot).replace(/</g, "\\u003c");
  const tag = `<script>window.__LIEBSTOECKEL_LIVE__=${json}</script>`;
  if (html.includes("</head>")) return html.replace("</head>", `${tag}</head>`);
  if (html.includes("<body")) return html.replace("<body", `${tag}<body`);
  return tag + html;
}

const WATERMARK_HREF = "https://liebstoeckel.app";

/** Inject a small, unobtrusive "Published with liebstoeckel" provenance badge for the
 *  free-tier live audience view ((internal ADR) / (internal ADR)). White-labelled (paid) sessions
 *  omit it. Inserted before the last </body>; self-contained inline styles (the deck
 *  runs in an opaque sandbox). The corner link opens in a new tab (allow-popups). */
export function injectWatermark(html: string): string {
  const badge =
    `<a href="${WATERMARK_HREF}" target="_blank" rel="noopener noreferrer"` +
    ` style="position:fixed;right:10px;bottom:10px;z-index:2147483647;` +
    `font:500 11px/1 system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.55);` +
    `padding:5px 9px;border-radius:999px;text-decoration:none;letter-spacing:.02em;` +
    `backdrop-filter:blur(4px);pointer-events:auto">Published with liebstoeckel</a>`;
  const at = html.lastIndexOf("</body>");
  return at >= 0 ? html.slice(0, at) + badge + html.slice(at) : html + badge;
}
