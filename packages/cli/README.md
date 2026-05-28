# @liebstoeckel/cli

> The `liebstoeckel` command — scaffold, develop, build, and present decks.

Part of **[liebstoeckel](https://liebstoeckel.app)** — a code-first presentation framework: author decks in **MDX + TSX**, get one self-contained HTML file that's animated, interactive, and live-shareable. Built on **Bun + React 19 + Motion + Tailwind v4**.

> ⚠️ Pre-release (`0.0.0`). APIs may change.

The umbrella CLI for liebstoeckel: create a deck, run a hot-reloading dev server, build the single-file HTML, capture thumbnails, and drive live presenter mode — all from one command.

## Install

```sh
bun add -d @liebstoeckel/cli
# …or run without installing:
bunx @liebstoeckel/cli <command>
```

> Requires **Bun ≥ 1.3**.

## Commands

```sh
liebstoeckel new <name>          # scaffold a new deck in ./<name>
liebstoeckel dev [dir]           # hot-reloading dev server (default: current dir)
liebstoeckel build [dir]         # build a deck to a single HTML file
liebstoeckel live <deck|dir>     # serve a built deck for presenter↔audience sync
liebstoeckel relay               # run a public relay server for WAN presenting
liebstoeckel thumbs <deck.html>  # capture slide thumbnails into a built deck
liebstoeckel present <deck|dir>  # build + serve in one step
```

Installed as both `liebstoeckel` and the short alias `lst`. Each command wraps the matching package (`engine`, `live-server`, `present-relay`, `thumbnails`). Run a command with `--help`, or see the reference, for its flags.

## Architecture

A thin, dependency-free dispatcher. The CLI owns no presentation logic of its own — it parses `argv[2]` and lazily `import()`s the matching sibling package, so unused subsystems (headless Chromium, the relay, the live server) are never loaded.

| File | Role |
|---|---|
| `src/cli.ts` | The `liebstoeckel`/`lst` bin. A `switch` over the first arg routes to each command; `--help`/no-arg prints `HELP`. Tiny helpers: `flag()` reads `--name value` pairs, `looksLikeDeck()` decides the bare-arg shorthand. |
| `src/new.ts` | The only command implemented in-package. `scaffold()` validates the name against `VALID_NAME`, refuses an existing dir, and writes the file map from the pure `deckFiles()` template (`package.json`, `index.html` + `data-brand`, `bunfig.toml`, `server.ts`, `build.ts`, `main.tsx`, `slides/01-intro.tsx`). |

Control flow per command:

- **`new`** → `scaffold()` (local).
- **`build`** → dynamic `import("@liebstoeckel/thumbnails/build")`, `chdir` into the target, then `buildDeckWithThumbnails({ entry: "./index.html", outdir: "./dist" })`.
- **`live`** / bare-deck shorthand → `@liebstoeckel/live-server/cli` `runLive`.
- **`relay`** → `@liebstoeckel/present-relay/cli` `runRelay`.
- **`thumbs`** → `@liebstoeckel/thumbnails/cli` `runThumbs`.

Each wrapped package does its own flag parsing, so the CLI forwards `rest` (the remaining argv) untouched.

## Docs

**[liebstoeckel.app/reference/cli](https://liebstoeckel.app/reference/cli/)** · [getting started](https://liebstoeckel.app/guides/getting-started/)

## License

[MPL-2.0](https://github.com/limond/liebstoeckel-app-public/blob/main/LICENSE)
