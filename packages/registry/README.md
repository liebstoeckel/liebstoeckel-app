# @liebstoeckel/registry

> The default registry of charts, hooks, and other building blocks that `liebstoeckel add` copies into a deck as owned source.

Part of [liebstoeckel](https://liebstoeckel.app), a code-first presentation framework. You write decks in MDX and TSX and build them into a single self-contained HTML file with no server or runtime dependencies. The same file works offline, and when you host it the deck runs a live session between the presenter and the audience. Built on Bun, React 19, Motion, and Tailwind v4.

> **Status: experimental, pre-1.0.** liebstoeckel is an evolving experiment, not yet production-ready. Before 1.0, breaking changes can land in any release without a major-version bump, so pin an exact version if you depend on it.

This package is data and a contract, not a runtime dependency of any deck. When you run `liebstoeckel add <name>`, the item's source files are copied into your deck and you own them from then on, to edit like any other file. Only an item's leaf npm dependencies (for example `@visx/scale`) are added to the deck's `package.json`.

```sh
liebstoeckel add bar-chart        # copy the chart's source into ./charts and install its deps
liebstoeckel registry list        # browse the catalog
liebstoeckel registry view bar-chart   # one item: exports, props, dataShape, example
```

See the [`add`](https://docs.liebstoeckel.app/reference/cli/#add) and [`registry`](https://docs.liebstoeckel.app/reference/cli/#registry) commands in the CLI reference for the full surface.

## Layout

```
registry.json          # the index of every item by name/type/version (generated)
items/<name>.json      # per-item manifest: deps, registryDependencies, files (generated)
files/charts/…         # the actual source copied into decks (hand-authored)
src/gen.ts             # generator: derives the manifests + registry.json from files/
src/schema.ts          # the published item contract + validators (validateItem, assertSafeTarget)
src/verify.ts          # bundler-safety gate: an item is safe iff its source actually bundles
src/index.ts           # REGISTRY_ROOT + schema re-export
```

`items/<name>.json` and `registry.json` are generated, never hand-edited. `gen.ts` derives each item's npm deps (from its `@visx/*` imports) and its `registryDependencies` (from relative imports) straight off the source, so a manifest can't drift from the code it ships.

## Adding an item

1. Drop the source under `files/charts/`. It must be bundler-safe, meaning it actually bundles under a deck's `target: "browser"` and `minify` build. `src/verify.ts` checks this with a real bundle (not a static denylist), and the package tests exercise it.
2. Add a catalog entry to `src/gen.ts`, including its hand-authored agent `meta` (the machine-readable description that agents read before scaffolding).
3. Run `bun run packages/registry/src/gen.ts`. It rewrites `items/<name>.json` and `registry.json`, deriving deps from the source's imports.

Item versions are pinned through the single `VERSION` constant in `gen.ts`, which applies to every item. Bump it when item sources change.

## Links

- [The `add` and `registry` commands](https://docs.liebstoeckel.app/reference/cli/#add)
- [Scaffolding guide](https://docs.liebstoeckel.app/guides/scaffolding/)
- [Homepage](https://liebstoeckel.app)
- [Source and issues](https://github.com/liebstoeckel/liebstoeckel-app)

Licensed under [MPL-2.0](https://github.com/liebstoeckel/liebstoeckel-app/blob/main/LICENSE).
