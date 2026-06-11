# Contributing to liebstoeckel

Thanks for your interest in improving liebstoeckel. Before you start, please read
how this repository works; it is a little unusual, and knowing the flow up front
saves you a surprise at merge time.

## How this repository works

This public repository is a **read-only mirror** of a private monorepo. Every
commit you see here is replayed from the private repository with its original
author, date, and message; internal infrastructure (the hosted control plane,
deployment manifests, internal design records) is not mirrored. Where a commit
message or comment says "(internal ADR)" or "(internal ticket)", it refers to a
design document that lives only in the private repository.

The practical consequence: **pull requests here are never merged with the merge
button.** The mirror pushes a full snapshot of the upstream tree, so anything
merged only here would be reverted by the next mirrored commit. Instead:

1. You open a pull request against `main` as usual. CI runs, review happens here.
2. Once approved, a maintainer cherry-picks your commits onto the private `main`,
   **preserving your authorship**. Your name and email appear in the public
   history when the change mirrors back out, usually within minutes.
3. The pull request is closed with a reference to the mirrored commit.

If the cherry-pick needs small adjustments (the private tree contains packages
that are not mirrored), the maintainer makes them and notes the difference on the
pull request.

## Before you write code

- **Bugs and small fixes:** open an issue or go straight to a pull request.
- **Features or anything that changes a public surface** (CLI flags, public APIs,
  config keys, defaults): please open an issue first so we can agree on the
  approach before you invest time.
- **Security issues:** do not open an issue. See [SECURITY.md](./SECURITY.md).

## Development setup

liebstoeckel runs on **Bun** (>= 1.3); there is no Node toolchain and no build
step for the packages themselves; they ship raw TypeScript executed by Bun.

```bash
bun install
bun run test           # unit/integration tests (bun test packages)
bun run typecheck      # tsc --noEmit
bun run docs:build     # docs site, if you touched packages/docs

bun run demo:dev       # example deck on http://localhost:3000
bun run showcase:dev   # data-viz example deck on http://localhost:3001
```

Some browser-dependent tests need Chromium and skip cleanly when it is absent.

## Conventions

- **Raw TypeScript under Bun.** Don't add a `dist/` or compile step. Bun-only
  APIs (`Bun.build`, `Bun.serve`, macros, `bun test`) are fine.
- **Tests are `*.test.ts`, colocated with the source**, run with `bun test`.
  Prefer pure, network-free logic cores that are unit-testable without a browser.
- **Imports** use the `@liebstoeckel/*` package names, `import type` for
  type-only imports, and explicit `.ts`/`.tsx` extensions where the existing
  code has them (the TS config is strict with `verbatimModuleSyntax`).
- **Theming is generated.** Brand tokens live in `packages/theme/src/brands/`;
  after editing them run `bun run gen` and commit the result. Never hand-edit
  generated CSS.
- **Docs are part of done.** A change to a user-facing surface (CLI command or
  flag, public API, config key, default, env var) updates the matching page
  under `packages/docs/src/content/docs/` in the same pull request.
- **Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)**
  (`feat(cli): …`, `fix(engine): …`, `docs: …`). Releases are cut automatically
  from these, so the type you pick matters.
- **Prose style** (docs, READMEs): plain and factual. Short sentences over
  clause chains, and no em dashes.

## Licensing

liebstoeckel is licensed under the [MPL-2.0](./LICENSE). By submitting a
contribution you agree that it is provided under the same license, and you
confirm you have the right to submit it.
