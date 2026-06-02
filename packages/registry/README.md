# @liebstoeckel/registry

The **default registry** — building blocks (`charts`, hooks, …) that
`liebstoeckel add <name>` scaffolds as **owned source** into a deck.
See [ADR 0040](../../docs/adr/0040-scaffolded-component-registry-ownership.mdx)
(ownership) and [ADR 0041](../../docs/adr/0041-registry-protocol-transports-and-third-party.mdx)
(protocol).

This package is **data + a contract**, not a runtime dependency of any deck. When
you `add` an item, its source files are copied into your deck and you own them;
only the item's *leaf* npm deps (e.g. `@visx/scale`) are added to the deck's
`package.json`.

## Layout

```
registry.json          # the index — every item by name/type/version (generated)
items/<name>.json      # per-item manifest: deps, registryDependencies, files (generated)
files/charts/…         # the actual source copied into decks (hand-authored)
src/gen.ts             # generator: derives the manifests + registry.json from files/
src/schema.ts          # the published item contract + validators (validateItem, assertSafeTarget)
src/verify.ts          # bundler-safety gate: an item is safe iff its source actually bundles
src/index.ts           # REGISTRY_ROOT + schema re-export
```

`items/<name>.json` and `registry.json` are **generated, never hand-edited** —
`gen.ts` derives each item's npm deps (from `@visx/*` imports) and
`registryDependencies` (from relative imports) straight off the source, so a
manifest can't drift from the code it ships.

## Adding an item

1. Drop the source under `files/charts/`. It must be **bundler-safe** — i.e. it
   actually bundles under a deck's `target:"browser"` + `minify` build. This is
   checked by `src/verify.ts` (a real bundle, not a static denylist), exercised in
   the package tests.
2. Add a catalog entry — with its hand-authored agent `meta` (ADR 0045) — to the
   catalog in `src/gen.ts`.
3. Run `bun run packages/registry/src/gen.ts` — it (re)writes `items/<name>.json`
   + `registry.json`, deriving deps from the source's imports.

Item `version`s are pinned via the single `VERSION` constant in `gen.ts` (applied
to every item); bump it when item sources change.
