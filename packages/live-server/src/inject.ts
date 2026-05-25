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

/** Inject `window.__PRESENT_IT_LIVE__` into <head> so the client knows a server
 *  is present (absence → standalone fallback). `</` is escaped to keep the inline
 *  script well-formed. */
export function injectBootstrap(html: string, boot: LiveBootstrap): string {
  const json = JSON.stringify(boot).replace(/</g, "\\u003c");
  const tag = `<script>window.__PRESENT_IT_LIVE__=${json}</script>`;
  if (html.includes("</head>")) return html.replace("</head>", `${tag}</head>`);
  if (html.includes("<body")) return html.replace("<body", `${tag}<body`);
  return tag + html;
}
