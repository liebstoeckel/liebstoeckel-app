// The dev-mode loader tag. Permanently present in a deck's index.html: it
// probes the co-served /__dev/ping endpoint and injects the bridge script
// (the in-frame half of dev mode: it relays the shell page's sidebar to the
// framed deck) only when a dev server answers, so a static open, `live`, or a
// hosted viewer all no-op (the fetch fails or 404s). The build strips any tag carrying this
// attribute, so built decks ship zero dev-mode bytes. Kept as an inline classic
// script deliberately: an external `src` would be resolved (and rejected) by
// the bundler, an inline script passes through both the dev server and
// `Bun.build` verbatim.
//
// Lives in the CLI (not the dev server) so the scaffold template and the
// scaffold-migration registry share one definition; the dev server re-exports
// it. Keep this module an import leaf: the dev-server package imports the CLI,
// and the CLI's umbrella soft-imports the dev server, so anything here that
// pulls in a CLI command module becomes a load cycle.

export const DEV_ATTR = "data-liebstoeckel-dev";

export const DEV_LOADER_TAG =
  `<script ${DEV_ATTR}>` +
  "/* liebstoeckel dev-mode loader; stripped from builds */" +
  '(function(){try{if(!/^https?:$/.test(location.protocol))return;' +
  'fetch("/__dev/ping",{cache:"no-store"}).then(function(r){if(r.ok){' +
  'var s=document.createElement("script");s.src="/__dev/bridge.js";document.head.appendChild(s)}})' +
  ".catch(function(){})}catch(e){}})()" +
  "</script>";

/** Presence is the attribute alone, not the exact script body: a tag from an
 *  older CLI (e.g. one loading the former `/__dev/drawer.js` route, which the
 *  server keeps serving as an alias) still counts and is never re-patched. */
export function hasDevLoaderTag(html: string): boolean {
  return html.includes(DEV_ATTR);
}

/** Add the loader tag before </head> (or <body as a fallback). Idempotent. */
export function addDevLoaderTag(html: string): string {
  if (hasDevLoaderTag(html)) return html;
  if (html.includes("</head>")) return html.replace("</head>", `    ${DEV_LOADER_TAG}\n  </head>`);
  if (html.includes("<body")) return html.replace("<body", `${DEV_LOADER_TAG}<body`);
  return DEV_LOADER_TAG + html;
}
