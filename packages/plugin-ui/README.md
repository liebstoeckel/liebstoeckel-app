# @liebstoeckel/plugin-ui

> Brand-aware React UI primitives for liebstoeckel plugins.

Part of [liebstoeckel](https://liebstoeckel.app), a code-first presentation framework. You write decks in MDX and TSX and build them into a single self-contained HTML file with no server or runtime dependencies. The same file works offline, and when you host it the deck runs a live session between the presenter and the audience. Built on Bun, React 19, Motion, and Tailwind v4.

> **Status: experimental, pre-1.0.** liebstoeckel is an evolving experiment, not yet production-ready. Before 1.0, breaking changes can land in any release without a major-version bump, so pin an exact version if you depend on it.

Themed building blocks (`Card`, `Button`, `Bar`, `Stack`, `Eyebrow`), plus `useTheme()` for reading the active brand's tokens. The components style themselves against the deck's `--brand-*` CSS variables, so a plugin's UI matches whatever brand is active without bundling Tailwind into your package.

## Install

```sh
bun add @liebstoeckel/plugin-ui
```

Peer dep: `react`. (It pulls in `@liebstoeckel/plugin-sdk` for shared types.)

## Usage

```tsx
import { Card, Stack, Bar, Button, Eyebrow, useTheme } from "@liebstoeckel/plugin-ui";

function Results({ rows }: { rows: { label: string; pct: number }[] }) {
  const theme = useTheme(); // brand tokens; safe outside the browser (returns fallbacks)
  return (
    <Card>
      <Eyebrow>Results</Eyebrow>
      <Stack gap="0">
        {rows.map((r, i) => (
          <Bar key={r.label} label={r.label} pct={r.pct} color={theme.viz[i % theme.viz.length]} />
        ))}
      </Stack>
    </Card>
  );
}
```

## Exports

- `Card`, `Button`, `Bar`, `Stack`, and `Eyebrow` are the themed primitives
- `useTheme()` and `readTheme()` read brand tokens (`primary`, `text`, `viz[]`, fonts, …)
- `ThemeTokens` is the token type, re-exported from `@liebstoeckel/plugin-sdk`

The primitives are stateless and have no build step or Tailwind dependency of their own. Each one styles inline against `var(--brand-*, fallback)`, so it picks up the active `[data-brand]` without relying on Tailwind class generation inside `node_modules`. `useTheme()` reads the same variables off `document.body` and falls back to a built-in dark palette when there's no `document`, so it's safe in SSR and thumbnail capture. Override any primitive with `className` or `style`.

## Links

- [Building a plugin](https://docs.liebstoeckel.app/plugins/building-a-plugin/)
- [Theming guide](https://docs.liebstoeckel.app/guides/theming/)
- [Homepage](https://liebstoeckel.app)
- [Source and issues](https://github.com/liebstoeckel/liebstoeckel-app)

Licensed under [MPL-2.0](https://github.com/liebstoeckel/liebstoeckel-app/blob/main/LICENSE).
