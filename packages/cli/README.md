# @liebstoeckel/cli

> The `liebstoeckel` command. Scaffold, develop, build, and present decks.

Part of [liebstoeckel](https://liebstoeckel.app), a code-first presentation framework. You write decks in MDX and TSX and build them into a single self-contained HTML file with no server or runtime dependencies. The same file works offline, and when you host it the deck runs a live session between the presenter and the audience. Built on Bun, React 19, Motion, and Tailwind v4.

> **Status: experimental, pre-1.0.** liebstoeckel is an evolving experiment, not yet production-ready. Before 1.0, breaking changes can land in any release without a major-version bump, so pin an exact version if you depend on it.

This is the umbrella CLI. One binary scaffolds a deck, runs a hot-reloading dev server, builds the single-file HTML, captures thumbnails, and drives live presenter mode.

## Install

```sh
bun add -d @liebstoeckel/cli
# …or run it without installing:
bunx @liebstoeckel/cli <command>
```

> Requires **Bun ≥ 1.3**.

## Commands

```sh
liebstoeckel new <name>          # scaffold a new deck in ./<name>
liebstoeckel add <name>...       # copy registry items (charts, …) into a deck as owned source
liebstoeckel registry list|view  # browse the chart/component registry (--json for agents)
liebstoeckel build [dir]         # build a deck into one self-contained .html (+ thumbnails)
liebstoeckel eject <deck.html>   # recover a built deck's editable source
liebstoeckel pack [dir]          # inspect or emit the source a build embeds
liebstoeckel licenses [dir]      # report the third-party licenses bundled into a deck
liebstoeckel live <deck|dir>     # present live (LAN, or through a --relay)
liebstoeckel relay               # run a public relay server for WAN presenting
liebstoeckel thumbs <deck.html>  # (re)generate thumbnails for a built deck
liebstoeckel export [deck|dir]   # export slides to PNG or PDF
liebstoeckel skill install       # install the agent skill for deck authoring
liebstoeckel login|push|orgs|decks|brand   # liebstoeckel cloud (coming soon)

liebstoeckel <deck|dir>          # shorthand for: liebstoeckel live <deck>
```

There's no `dev` subcommand. For the hot-reloading dev server, run `bun run dev` inside the deck (the scaffold wires the script), or use `liebstoeckel live`.

The bin is installed as both `liebstoeckel` and the short alias `lst`. `live`, `relay`, `thumbs`, and `export` hand off to a sibling package; the rest are implemented here. Every command has its own `--help`. The authoritative command and flag reference lives at [docs.liebstoeckel.app/reference/cli](https://docs.liebstoeckel.app/reference/cli/).

## Architecture

The CLI is a [citty](https://github.com/unjs/citty) dispatcher. `src/cli.ts` defines one root command whose `subCommands` are lazy `() => import(…)` thunks, so a command only pulls in what it needs. `build` never loads the live server, and `live` never loads the bundler. The CLI itself holds almost no logic. It routes, and each command module does the work or hands off to a sibling package.

| File | Role |
|---|---|
| `src/cli.ts` | The `liebstoeckel`/`lst` bin. It builds the root citty command, prints best-effort update and skill reminders, and resolves the bare-path shorthand (`liebstoeckel <deck>` becomes `live`) before calling `runMain`. |
| `src/targeting.ts` | `looksLikeDeck()` decides whether a leading positional is a deck path, so the shorthand kicks in instead of citty reporting an unknown command. |
| `src/new.ts` | `new` scaffolds a deck from a template (`index.html`, `main.tsx`, `build.ts`, `server.ts`, `bunfig.toml`, `slides/01-intro.tsx`) and bakes in the org's default brand when you're logged in. |
| `src/build.ts` | Holds `build`, `eject`, `pack`, and `licenses`. Each one calls into `@liebstoeckel/engine` or `@liebstoeckel/thumbnails`. |
| `src/add.ts`, `src/registry.ts` | Copy registry items into a deck as owned source, and browse the registry. |
| `src/skill.ts` | `skill install` and `skill update` write the version-pinned agent skill into a deck for each agent target. |
| `src/cloud.ts`, `src/creds.ts` | The cloud commands (`login` over the RFC 8628 device flow, plus `push`, `orgs`, `decks`, `brand`) and credential storage. |
| `src/update.ts` | The once-a-day update check and the "deck skill older than the CLI" reminder. Both write to stderr only, and stay quiet for `--json`, pipes, and CI. |

Where each command runs:

- Local commands are implemented in this package: `new`, `add`, `registry`, `skill`, the cloud commands, and `build`/`eject`/`pack`/`licenses`. `build` drives `buildDeck` from `@liebstoeckel/thumbnails/build`; `--check` uses `checkDeck`, `eject` and `pack` use `@liebstoeckel/engine/build/source-package`, and `licenses` reads `collectDeckLicenses` and `extractLicenses`.
- Delegated commands re-export a citty command straight out of a sibling package, so that package owns its own flags and `--help`: `live` (and the bare-deck shorthand) and `thumbs`/`export` come from `@liebstoeckel/live-server` and `@liebstoeckel/thumbnails`, and `relay` comes from `@liebstoeckel/present-relay`.

## Links

- [CLI reference](https://docs.liebstoeckel.app/reference/cli/) lists every command and flag
- [Getting started](https://docs.liebstoeckel.app/guides/getting-started/)
- [Homepage](https://liebstoeckel.app)
- [Source and issues](https://github.com/liebstoeckel/liebstoeckel-app)

Licensed under [MPL-2.0](https://github.com/liebstoeckel/liebstoeckel-app/blob/main/LICENSE).
