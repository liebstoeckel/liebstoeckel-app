# @liebstoeckel/dev-server

> Local dev mode for liebstoeckel decks: hot reload plus a shell page with an annotation sidebar beside the framed deck, and an agent poll loop.

Part of [liebstoeckel](https://liebstoeckel.app), a code-first presentation framework. You write decks in MDX and TSX and build them into a single self-contained HTML file with no server or runtime dependencies. The same file works offline, and when you host it the deck runs a live session between the presenter and the audience. Built on Bun, React 19, Motion, and Tailwind v4.

> **Status: experimental, pre-1.0.** liebstoeckel is an evolving experiment, not yet production-ready. Before 1.0, breaking changes can land in any release without a major-version bump, so pin an exact version if you depend on it.

It serves a shell page at `/` (the annotation sidebar beside the deck, which it frames from a per-session token path; `/deck` redirects there) where you annotate slides directly in the browser (comments, strokes, a screenshot with your marks baked in). The plain deck is served by the dev server of [@liebstoeckel/build](https://www.npmjs.com/package/@liebstoeckel/build), with hot reload that keeps the slide, the step and the components' state; a small loader tag in the deck's `index.html` pulls in the bridge script that connects the framed deck to the sidebar. An AI agent picks those annotations up through a long-poll loop (`liebstoeckel dev poll`), applies them to the slide source, and hot reload shows the edit without losing your place in the deck. On boot it also applies any pending scaffold migrations for the deck. Everything is local: the API binds `127.0.0.1` by default and every mutating request needs a per-session token.

Most people drive it through `liebstoeckel dev` in [@liebstoeckel/cli](https://www.npmjs.com/package/@liebstoeckel/cli), which depends on this package. Use it directly only when you want to embed the dev server. Exports: `.` (`startDevServer`, the local backend, the store types), `./protocol` (the host-agnostic `/__dev/*` handler behind a `DevBackend`), `./ui` (the React `DevShell` / `DevSidebar`), `./bridge` (the in-frame half of the shell bridge), `./cli` (the `dev` and `dev poll` commands).

## Install

```sh
bun add @liebstoeckel/dev-server
```

> Bun-only, built on `Bun.serve`.

## Usage

```sh
liebstoeckel dev                # serve the deck in the current directory
liebstoeckel dev poll           # agent side: wait for an annotation batch
```

See the [dev mode guide](https://docs.liebstoeckel.app/guides/dev-mode/) for the full annotation loop, the reply contract, and housekeeping details.

## Upgrading from 0.3

Move every `@liebstoeckel/*` package of a deck to 0.4 together with `liebstoeckel update` (a plain `bun update` stays on 0.3). A deck bundles one copy of each package, so a deck that mixes 0.3 and 0.4 copies fails to build. What changed: [Upgrading to 0.4](https://docs.liebstoeckel.app/guides/upgrading-to-0-4/).

## License

MPL-2.0
