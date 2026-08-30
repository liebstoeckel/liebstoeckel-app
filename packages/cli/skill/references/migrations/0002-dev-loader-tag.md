---
id: 0002-dev-loader-tag
title: Dev-mode loader tag in index.html
since: 0.3.11
surface: index.html
reason: the dev-mode bridge (the shell's sidebar talks to the framed deck through it) only loads when index.html carries the dev-mode loader tag (inert outside dev, stripped from builds)
---

# Dev-mode loader tag in index.html

## Why

Dev mode is a shell page: `liebstoeckel dev` serves the annotation sidebar at
`/` with the deck framed from a per-session token path (`/deck` redirects to it). Inside that frame, a small inline
`<script data-liebstoeckel-dev>` in the deck's `index.html` loads the bridge
script that connects the framed deck to the sidebar (annotations, the agent
live loop). The tag is permanent deck source and safe everywhere: it probes the
co-served `/__dev/ping` endpoint and injects the bridge only when a dev server
answers, so a static file open, `liebstoeckel live`, or a hosted viewer all
no-op. The build strips any tag carrying the attribute, so built decks ship
zero dev-mode bytes. Decks scaffolded before dev mode existed lack the tag, and
the sidebar never connects to them.

## The edit

`liebstoeckel dev` adds the tag automatically when `index.html` has a `</head>`
(preferred) or a `<body` to anchor on, which every scaffolded deck does. Only
an unusually shaped `index.html` needs a manual edit: add this line inside
`<head>`:

```html
<script data-liebstoeckel-dev>/* liebstoeckel dev-mode loader; stripped from builds */(function(){try{if(!/^https?:$/.test(location.protocol))return;fetch("/__dev/ping",{cache:"no-store"}).then(function(r){if(r.ok){var s=document.createElement("script");s.src="/__dev/bridge.js";document.head.appendChild(s)}}).catch(function(){})}catch(e){}})()</script>
```

Keep it as an inline classic script: an external `src` would be resolved (and
rejected) by the bundler, while the inline form passes through both the dev
server and `Bun.build` verbatim.

Detection is the `data-liebstoeckel-dev` attribute, not the exact script body:
a tag written by an earlier CLI (one loading `/__dev/drawer.js`, which the dev
server keeps serving as an alias of `/__dev/bridge.js`) still counts as present
and is never re-patched.

## Opting out

If the deck deliberately excludes dev mode, suppress this migration with a
reason in the deck's `package.json`:

```json
"liebstoeckel": {
  "migrationOptOut": {
    "0002-dev-loader-tag": "this deck is never served with liebstoeckel dev"
  }
}
```

The reason is mandatory. `doctor --json` keeps reporting the entry as
`suppressed: true` with the reason; hints and auto-patching stop.
