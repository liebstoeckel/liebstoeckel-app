# @liebstoeckel/release-tests

> The release tests: what has to keep working on Linux, Windows and macOS before a release reaches npm.

Part of **[liebstoeckel](https://liebstoeckel.app)**, a code-first presentation framework: author decks in **MDX + TSX**, get one self-contained HTML file that's animated, interactive, and live-shareable.

> **Not published.** This package is `private: true`. The repository's release matrix
> (`.github/workflows/os-matrix.yml`) runs it on `ubuntu-latest`, `windows-latest` and
> `macos-latest` for every release, every Monday and by hand.

## What is here

- **`src/cli-install.test.ts`**, the registry install tier: installs `@liebstoeckel/cli` from a
  registry into a clean sandbox and walks the offline surface a new user meets (`--version` on the
  pinned Bun, `new`, `install`, `build --check`, `build`, `registry`, `add`, `pack`, `eject`,
  `skill`, `live`, `dev`, `export`, the cloud commands' "coming soon"). It skips unless
  `LIEBSTOECKEL_E2E_REGISTRY` is set.
- **`src/dev-hot-reload.test.ts`**, **`export-paper.test.ts`**, **`live.test.ts`**,
  **`poll.test.ts`**: `liebstoeckel dev` with hot reload in a browser, paper PDF export through the
  CLI, live presenting through a relay, a poll over the live server. They build **`fixture/`**, a
  small deck, with **`src/harness.ts`**.
- **`release-fixture/`**: a deck that uses every authoring feature (its README lists them and the
  golden hashes), installed from a registry like a user's deck.
- **`scripts/`**: drivers for the fixture, runnable under Bun or Node 22.18+:
  `release-fixture.ts` (copy it out at a version or dist-tag), `release-hot-reload.ts` (edits
  under `liebstoeckel dev` in Chrome or WebKit), `release-live.ts` (a presenter and phones through
  a relay), `release-screens.ts` (every slide from `file://` in one engine).
- **`matrix/`**: plain Node helpers the release matrix runs: the hot reload and live runners, the
  install variants (`npx`, `pnpm dlx`, `pnpm add -g`, `bunx`, `bun add -g`), checks of what a build
  or an export wrote, the per-job result and the summary.

## Run

```sh
bun run test:browser                      # the browser tests (needs Chrome or Chromium)
LIEBSTOECKEL_CHROMIUM=/path/to/chrome bun run test:browser
LIEBSTOECKEL_E2E_REGISTRY=http://127.0.0.1:4873/ bun run test:e2e:install
```

The browser tests use `LIEBSTOECKEL_CHROMIUM` when it is set, else Playwright's own Chromium, and
skip without one; a skipped suite's name says why. Under Bun on Windows Playwright cannot reach a
browser, so there the matrix runs the drivers under Node instead.

## License

[MPL-2.0](https://github.com/liebstoeckel/liebstoeckel-app/blob/main/LICENSE)
