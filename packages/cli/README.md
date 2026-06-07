# @liebstoeckel/cli

> The `liebstoeckel` command — scaffold, develop, build, and present decks.

Part of **[liebstoeckel](https://liebstoeckel.app)** — a code-first presentation framework: author decks in **MDX + TSX**, get one self-contained HTML file that's animated, interactive, and live-shareable. Built on **Bun + React 19 + Motion + Tailwind v4**.

> ⚠️ Pre-release. APIs may change.

The umbrella CLI for liebstoeckel: create a deck, run a hot-reloading dev server, build the single-file HTML, capture thumbnails, and drive live presenter mode — all from one command.

## Install

> Not on the public npm registry yet — the commands below are how it will install once published. For now, run it from a checkout of the repo (`bun run live|relay|thumbs …`) or a workspace that links the packages.

```sh
bun add -d @liebstoeckel/cli
# …or run without installing:
bunx @liebstoeckel/cli <command>
```

> Requires **Bun ≥ 1.3**.

## Commands

```sh
liebstoeckel new <name>          # scaffold a new deck in ./<name>
liebstoeckel add <name>...       # scaffold registry items (charts, …) into a deck as owned source
liebstoeckel registry list|view  # browse the chart/component registry (--json for agents)
liebstoeckel build [dir]         # build a deck → one self-contained .html (+ thumbnails)
liebstoeckel eject <deck.html>   # recover a built deck's editable source
liebstoeckel pack [dir]          # inspect/emit the source a build embeds
liebstoeckel live <deck|dir>     # present live (LAN, or through a --relay)
liebstoeckel relay               # run a public relay server for WAN presenting
liebstoeckel thumbs <deck.html>  # (re)generate thumbnails for a built deck
liebstoeckel export [deck|dir]   # export slides to PNG or PDF
liebstoeckel skill install       # install the agent skill for deck authoring
liebstoeckel login|push|orgs|decks|brand   # liebstoeckel cloud (upload, share, brands)

liebstoeckel <deck|dir>          # shorthand for `liebstoeckel live <deck>`
```

There's no `dev` subcommand — for the hot-reloading dev server, run `bun run dev` inside the deck (the scaffold wires the script), or use `liebstoeckel live`.

Installed as both `liebstoeckel` and the short alias `lst`. Each command wraps the matching package (`engine`, `live-server`, `present-relay`, `thumbnails`, `registry`). Run a command with `--help`, or see the reference, for its flags. The full, authoritative command + flag reference is **[liebstoeckel.app/reference/cli](https://liebstoeckel.app/reference/cli/)**.

## Architecture

A thin, dependency-free dispatcher. The CLI owns no presentation logic of its own — it parses `argv[2]` and lazily `import()`s the matching sibling package, so unused subsystems (headless Chromium, the relay, the live server) are never loaded.

| File | Role |
|---|---|
| `src/cli.ts` | The `liebstoeckel`/`lst` bin. A `switch` over the first arg routes to each command; `--help`/no-arg prints `HELP`. Tiny helpers: `flag()` reads `--name value` pairs, `looksLikeDeck()` decides the bare-arg shorthand, `resolveDeck()` applies the deck-targeting convention (positional · `--dir` · cwd). |
| `src/new.ts` | `scaffold()` validates the name against `VALID_NAME`, refuses an existing dir, and writes the file map from the pure `deckFiles()` template (`package.json`, `index.html` + `data-brand`, `bunfig.toml`, `server.ts`, `build.ts`, `main.tsx`, `slides/01-intro.tsx`). |
| `src/add.ts` · `src/registry.ts` | Scaffold registry items into a deck as owned source, and browse the registry. |
| `src/skill.ts` | `skill install` — write the agent skill into a deck for each agent target. |
| `src/cloud.ts` · `src/creds.ts` | The cloud path: `login` (RFC 8628 device flow), `push`, `orgs`, `decks`, `brand`, and credential storage. |

Control flow per command:

- **`new`** → `scaffold()` (local). **`add`/`registry`/`skill`** and the cloud commands (**`login`/`push`/`orgs`/`decks`/`brand`**) are implemented in-package (`add.ts`/`registry.ts`/`skill.ts`/`cloud.ts`).
- **`build`** → dynamic `import("@liebstoeckel/thumbnails/build")`, `chdir` into the target, then `buildDeck({ entry: "./index.html", outdir: "./dist" })`.
- **`eject`/`pack`** → `@liebstoeckel/engine/build/source-package`.
- **`live`** / bare-deck shorthand → `@liebstoeckel/live-server/cli` `runLive`.
- **`relay`** → `@liebstoeckel/present-relay/cli` `runRelay`.
- **`thumbs`/`export`** → `@liebstoeckel/thumbnails/cli` `runThumbs` / `runExport`.

Each wrapped package does its own flag parsing (including `--help`), so the CLI forwards `rest` (the remaining argv) untouched.

## Docs

**[liebstoeckel.app/reference/cli](https://liebstoeckel.app/reference/cli/)** · [getting started](https://liebstoeckel.app/guides/getting-started/)

## License

[MPL-2.0](https://github.com/limond/liebstoeckel-app-public/blob/main/LICENSE)
