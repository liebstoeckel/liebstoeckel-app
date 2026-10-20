---
id: 0003-scaffold-tooling-files
title: The scaffold's Bun tooling files go
since: 0.4.0
surface: tooling
reason: liebstoeckel dev and liebstoeckel build now do what the scaffold's bunfig.toml, server.ts and build.ts did (Bun's dev server and Bun.build), so those files and the scripts that ran them are no longer needed
---

# The scaffold's Bun tooling files go

## Why

Decks scaffolded before 0.4 carry three files for Bun's own tooling:

- `bunfig.toml`: Bun bundler plugins (Tailwind, MDX, a visx fix) under
  `[serve.static] plugins`, for Bun's dev server.
- `server.ts`: Bun's dev server with HTML routes and HMR, run by `bun run dev`.
- `build.ts`: the single-file build, run by `bun run build`.

liebstoeckel now builds and serves decks with its own build core (on
esbuild): `liebstoeckel dev` is the dev server, with hot reload that keeps
component state, and `liebstoeckel build` is the build. The core compiles MDX,
generates Tailwind's CSS and highlights code itself and never runs Bun
plugins, so the three files do nothing anymore, and the scripts that ran them
run an old path.

## What `liebstoeckel dev` does

On start, for each of the three files that is still byte-for-byte what some
release scaffolded (line endings and trailing spaces aside):

- it deletes the file,
- sets the `package.json` script that ran it to the CLI (`dev`:
  `liebstoeckel dev`, `build`: `liebstoeckel build`), and
- drops the file from the `files` allowlist.

It prints what it did, for example
`↻ migrated removed bunfig.toml, removed server.ts, removed build.ts, scripts.dev = "liebstoeckel dev", ... (0003-scaffold-tooling-files)`.
A deleted file explains nothing in the tree, so this line and this guide are
the record; `git status` shows the deletions.

## A file you changed

A changed file is never touched, and neither is the script that runs it. `dev`
and `doctor` print the next step for it:

- `server.ts` differs from the scaffold: `liebstoeckel dev` replaces it. Move
  what you added elsewhere (a route of your own belongs in a separate server),
  then delete it and set `scripts.dev` to `"liebstoeckel dev"`.
- `build.ts` differs from the scaffold: `liebstoeckel build` replaces it. Move
  what you added (a post-processing step) into a script that runs after
  `liebstoeckel build`, then delete it and set `scripts.build` to
  `"liebstoeckel build"`. A `build.ts` that calls `bundleDeck` from
  `@liebstoeckel/engine/build` keeps building this release (deprecated); the
  same function in `@liebstoeckel/build` takes the same options, apart from
  `plugins`.
- `bunfig.toml` differs from the scaffold: remove the `[serve.static]` section
  and keep anything else you set there (an install registry, say). A Bun
  plugin of your own listed there no longer runs: `dev` and `doctor` name it
  (`pluginProblems`); do in the deck's source what it did.

The scripts call `liebstoeckel`: new decks list `@liebstoeckel/cli` as a dev
dependency so `npm run dev` (or `bun run dev`) finds it; an older deck uses the CLI
you run `dev` with, or add the dependency (`liebstoeckel install --dev @liebstoeckel/cli`).

A deck that keeps its own `server.ts` or `build.ts` for now runs them on the
deprecated Bun pipeline, which needs `bun-plugin-tailwind` in the deck
(`liebstoeckel install --dev bun-plugin-tailwind`): the engine no longer brings it.

## Opting out

To keep the files deliberately, suppress the migration with a reason in the
deck's `package.json`:

```json
"liebstoeckel": {
  "migrationOptOut": {
    "0003-scaffold-tooling-files": "we run our own server.ts next to dev mode"
  }
}
```
