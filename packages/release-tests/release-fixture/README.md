# Release fixture

A deck that uses every authoring feature a release has to keep working, for the release tests
and the release QA. It is never a workspace: its
`@liebstoeckel/*` dependencies say `RELEASE`, and `../scripts/release-fixture.ts` copies it
out with a version or dist-tag in their place, so it installs from a registry the way a
user's deck does.

What it covers:

| Feature | Where |
| --- | --- |
| MDX slide with Markdown, a fenced code block and an image import | `slides/02-mdx.mdx` |
| A brand of the deck's own (`defineTheme`, `brandThemes`) | `brands/fixture.ts` |
| A font file inside the deck (`@font-face` with a relative `url()`) | `brands/fixture.css`, `assets/fonts/` (Fraunces italic, OFL-1.1) |
| A code file with `<CodeMagic>` | `slides/greet.code.md`, `slides/03-code-file.tsx` |
| The deprecated `codeStory` macro (and its name in JSX text) | `slides/04-code-story.tsx` |
| visx charts added with `liebstoeckel add` (bar, line, donut) | `charts/`, `slides/05-charts.tsx` |
| PNG and SVG images, an image as a CSS background | `assets/`, `slides/06-images.tsx` |
| The persistent layer (`<Slot>` and `persistent`) | `slides/07-persistent.tsx`, `main.tsx` |
| Poll, Q&A, reactions and a plugin defined inside the deck | `slides/08-live.tsx`, `plugins/applause.tsx`, `package.json` `liebstoeckel.plugins` |
| A dependency that ships only CommonJS (`ms`) | `slides/09-cjs.tsx` |
| The join card | `slides/10-join.tsx` |
| Steps, notes, a shared component and a component with state (hot reload) | `slides/01-intro.tsx`, `components/` |

## Use

```sh
bun packages/release-tests/scripts/release-fixture.ts /tmp/fx/release-fixture rc   # a dist-tag, or the released version once it is out
cd /tmp/fx/release-fixture
liebstoeckel install
LIEBSTOECKEL_NO_THUMBS=1 liebstoeckel build --trust     # thumbnails depend on the browser, so the hash leaves them out
sha256sum dist/release-fixture.html
```

The hash depends on the exact versions installed and on the registry URL the lockfile
records, so compare machines that installed from the same `bun.lock` through the same
registry address (copy the deck with its `bun.lock`, without `node_modules`).

The drivers next to the copy script run the fixture through the browser checks:

- `release-screens.ts <chromium|firefox|webkit> <deck.html> <outdir>`: every slide from `file://`;
- `release-hot-reload.ts <deck-dir> <dev-url>`: edits under `liebstoeckel dev`, with timings;
- `release-live.ts <relay-url> <token> <deck.html> --live-slide 8 --join-slide 10 --applause [--legal]`:
  a presenter and phones through a relay.

## Golden hashes

`sha256` of `dist/release-fixture.html` built with `LIEBSTOECKEL_NO_THUMBS=1`, prepared with
the dist-tag (`release-fixture.ts <dir> rc`) and installed from a registry holding the
candidate through `http://localhost:4873/`. Record one row per release (the 0.4.0 row is its last candidate;
after the npm release, add the row for the released version, installed from npmjs.com).

| Release | Linux x64 | Windows x64 | macOS arm64 |
| --- | --- | --- | --- |
| 0.4.0-rc.7 | `06aab817361088dec9bfd65670c93a346107c1e46a8e740f5463ada5ebba43b0` | the same | not run |
| 0.4.0-rc.8 (Bun 1.4.3) | `7282c79b4410619d583eecf369dd26a8e3ae8397fe73886e3832970c1f62e5fd` | the same | not run |
