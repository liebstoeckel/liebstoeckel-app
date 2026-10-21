import { defineMessages } from "@liebstoeckel/plugin-sdk/messages";
import type { Role } from "./session";

export interface LiveBootstrap {
  ws: string; // websocket url
  session: string;
  role: Role;
  token: string;
  participant: string;
  /** the read-only follow-along link (for the in-deck QR) */
  viewer?: string;
  /** days the host keeps what the audience writes after the session; absent = not kept */
  audienceInputKeptDays?: number;
  /** the operator's legal links, for the deck's menu; the report link names the session */
  legal?: LegalLinks;
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
 *  free-tier live audience view. White-labelled (paid) sessions
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

/** Where the legal links on a live page lead: the operator's Impressum, privacy
 *  notice and the form to report content. `report` gets the session's link as `url`. */
export interface LegalLinks {
  imprint: string;
  privacy: string;
  report: string;
}

const legalMessages = defineMessages({
  en: { legal: "Legal", imprint: "Imprint", privacy: "Privacy", report: "Report content", publishedWith: "Published with liebstoeckel" },
  de: { legal: "Rechtliches", imprint: "Impressum", privacy: "Datenschutz", report: "Inhalt melden", publishedWith: "Mit liebstoeckel veröffentlicht" },
});

/** Whether `v` is a link the row may carry: http(s) only, no credentials. */
function safeLink(v: string | undefined): string | null {
  try {
    const u = new URL(v ?? "");
    if (u.username || u.password) return null;
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** The configured legal links, or null when one is missing or not an http(s) URL. */
export function legalLinksFrom(env: { imprint?: string; privacy?: string; report?: string }): LegalLinks | null {
  const imprint = safeLink(env.imprint);
  const privacy = safeLink(env.privacy);
  const report = safeLink(env.report);
  return imprint && privacy && report ? { imprint, privacy, report } : null;
}

const escapeHtml = (v: string): string =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** The attribute a deck's engine sets on its root element once it shows the legal links
 *  in its own menu. Its name in a built deck's code tells the relay that the engine reads
 *  the links from the bootstrap; an engine from before has no such code and gets the row.
 *  The version suffix changes when the bootstrap's `legal` shape does. */
export const LEGAL_MENU_ATTR = "data-liebstoeckel-legal-menu-v1";

/** Whether a built deck's engine shows the legal links in its menu. A plain text check:
 *  a deck that only mentions the name still gets the row, see {@link injectLegalLinks}. */
export function readsLegalMenu(html: string): boolean {
  return html.includes(LEGAL_MENU_ATTR);
}

/** How long the row waits for the engine to take the links into its menu before it
 *  shows them itself (a deck whose engine failed, or one that only names the marker). */
export const LEGAL_MENU_WAIT_MS = 4000;

/** The legal links a page's bootstrap carries, the report link naming `page`. */
export function legalForPage(links: LegalLinks, page: string | undefined): LegalLinks {
  return { imprint: links.imprint, privacy: links.privacy, report: reportHref(links.report, page) };
}

/** The report form's address with the reported page filled in. */
export function reportHref(report: string, page: string | undefined): string {
  if (!page) return report;
  const u = new URL(report);
  u.searchParams.set("url", page);
  return u.href;
}

/**
 * Inject the small legal row into a live page: the Impressum, the privacy notice and
 * a way to report the content (prefilled with `page`, the session's link), for the
 * audience and the presenter alike, also when the session is white-labelled. On the
 * free tier the provenance badge joins the same pill, so the corner holds one thing.
 * On a narrow screen the row folds into one "Legal" link at the top right that opens
 * the three. On the
 * presenter's page it shows only in the presenter view (`#presenter`): the deck
 * window is what the room sees.
 *
 * `menu`: the deck's engine shows the links in its own menu ({@link readsLegalMenu}).
 * The row then holds only the badge (free tier) and keeps the three links hidden. If
 * the engine has not marked the page ({@link LEGAL_MENU_ATTR}) after
 * {@link LEGAL_MENU_WAIT_MS}, the row shows them after all, so a page never ends up
 * without them; once the engine marks the page they stay hidden.
 *
 * English or German by the reader's languages (`?lang=` first), chosen in the browser
 * so one prepared page serves every reader. Self-contained (inline styles and a small
 * inline script): the deck runs in an opaque sandbox with no outside resources. The
 * links open a new tab; the page's sandbox lets that tab leave it, so the forms and
 * pages there work as anywhere else. The row lives inside the deck's own document,
 * so a deck's script can hide it, as it could hide anything else on its page.
 */
export function injectLegalLinks(
  html: string,
  opts: { links: LegalLinks; page?: string; role: Role; watermark: boolean; menu?: boolean },
): string {
  const en = legalMessages("en");
  const de = legalMessages("de");
  const report = reportHref(opts.links.report, opts.page);
  const a = (href: string, key: string, text: string) =>
    `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" data-lst-t="${key}">${escapeHtml(text)}</a>`;
  const badge = opts.watermark ? a(WATERMARK_HREF, "publishedWith", en.publishedWith) : "";
  const legal = [a(opts.links.imprint, "imprint", en.imprint), a(opts.links.privacy, "privacy", en.privacy), a(report, "report", en.report)].join("");
  const menu = opts.menu === true;
  const classes = menu ? (opts.watermark ? "lst-menu lst-wait" : "lst-menu lst-wait lst-nobadge") : "";
  // Only the texts this page shows (a white-label page names no product, not even here).
  const shown = (m: typeof en) => {
    const { publishedWith, ...rest } = m;
    return opts.watermark ? { ...rest, publishedWith } : rest;
  };
  const texts = JSON.stringify({ en: shown(en), de: shown(de) }).replace(/</g, "\\u003c");
  const presenterOnly = opts.role === "presenter";
  const css =
    `#lst-legal .lst-row .lst-legal{display:contents}` +
    // The engine shows the links in its menu: hidden while waiting for it, and for good
    // once it marked the page. Without the badge the whole row goes.
    (menu
      ? `#lst-legal.lst-wait .lst-legal,html[${LEGAL_MENU_ATTR}] #lst-legal .lst-legal{display:none!important}` +
        `#lst-legal.lst-wait.lst-nobadge,html[${LEGAL_MENU_ATTR}] #lst-legal.lst-nobadge{display:none}` +
        // Such an engine draws its slide counter in the bottom right corner: sit above it.
        `#lst-legal.lst-menu{bottom:calc(2.6rem + env(safe-area-inset-bottom))}`
      : ``) +
    `#lst-legal{position:fixed;right:max(10px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom));` +
    `z-index:2147483647;font:500 11px/1.2 system-ui,sans-serif;letter-spacing:.02em;color:#fff}` +
    `#lst-legal[hidden]{display:none}` +
    `#lst-legal a,#lst-legal summary{color:inherit;text-decoration:none;opacity:.9}` +
    `#lst-legal a:hover,#lst-legal a:focus-visible,#lst-legal summary:hover,#lst-legal summary:focus-visible{opacity:1;text-decoration:underline}` +
    `#lst-legal .lst-row,#lst-legal .lst-narrow{gap:10px;align-items:center;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);border-radius:999px;padding:5px 10px}` +
    `#lst-legal .lst-row{display:flex}#lst-legal .lst-narrow{display:none}` +
    `#lst-legal summary{list-style:none;cursor:pointer}#lst-legal summary::-webkit-details-marker{display:none}` +
    `#lst-legal .lst-fold{display:none;flex-direction:column;gap:8px;position:absolute;right:0;top:calc(100% + 6px);white-space:nowrap;` +
    `background:rgba(0,0,0,.8);border-radius:10px;padding:10px 12px;font-size:13px}#lst-legal details[open] .lst-fold{display:flex}` +
    // A narrow screen: one pill at the top right, where the letterbox above the slide is
    // empty (the bottom edge holds the deck's own controls and counter there), with the
    // three links folded behind "Legal".
    `@media (max-width:640px),(pointer:coarse) and (max-height:500px){#lst-legal,#lst-legal.lst-menu{top:max(10px,env(safe-area-inset-top));bottom:auto}` +
    `#lst-legal .lst-row{display:none}#lst-legal .lst-narrow{display:flex}}`;
  const script =
    `(function(){var r=document.getElementById("lst-legal");if(!r)return;var T=${texts};` +
    `var l="en";try{var q=new URLSearchParams(location.search).get("lang");var c=(q?[q]:[]).concat(navigator.languages||[navigator.language||""]);` +
    `for(var i=0;i<c.length;i++){var b=String(c[i]||"").toLowerCase().split(/[-_]/)[0];if(b==="en"||b==="de"){l=b;break}}}catch(e){}` +
    (menu ? `setTimeout(function(){r.classList.remove("lst-wait")},${LEGAL_MENU_WAIT_MS});` : ``) +
    `var m=T[l];r.lang=l;var n=r.querySelectorAll("[data-lst-t]");for(var j=0;j<n.length;j++){var k=n[j].getAttribute("data-lst-t");if(m[k])n[j].textContent=m[k]}` +
    (presenterOnly
      ? `var s=function(){r.hidden=location.hash!=="#presenter"};s();addEventListener("hashchange",s);`
      : ``) +
    `})();`;
  const row =
    `<style>${css}</style>` +
    `<nav id="lst-legal" lang="en" aria-label="Legal"${classes ? ` class="${classes}"` : ""}${presenterOnly ? " hidden" : ""}>` +
    `<div class="lst-row">${badge}<span class="lst-legal">${legal}</span></div>` +
    `<div class="lst-narrow">${badge}<details class="lst-legal"><summary data-lst-t="legal">${escapeHtml(en.legal)}</summary><div class="lst-fold">${legal}</div></details></div>` +
    `</nav><script>${script}</script>`;
  const at = html.lastIndexOf("</body>");
  return at >= 0 ? html.slice(0, at) + row + html.slice(at) : html + row;
}
