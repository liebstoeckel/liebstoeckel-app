# Brands (custom themes & fonts)

A **brand** is one typed token object — colors, fonts, a chart palette — and the
whole deck derives its look from it. Slides use role tokens (`text-primary`,
`bg-surface`, `text-accent`, `font-heading`), never literal hex/hue, so the same
slide is correct under any brand.

Do **not** hand-roll a raw `[data-brand="…"] { --brand-*: … }` CSS block. That
re-implements, by hand, what `defineTheme` + `brandThemes` generate for you (and
is how a past session drifted). Use the typed path below.

## Pick a brand

- **Built-in** — `liebstoeckel`, `nocturne`, `acme`, `sunset`. Scaffold with one:
  ```bash
  liebstoeckel new <name> --dir presentations --brand nocturne
  ```
  Built-ins need no font work (their fonts are already bundled).

- **Custom** — define your own typed brand as owned source in the deck (below).
  `--brand <id>` alone does **not** create the brand; an unknown id silently
  renders with the default tokens. To brand a deck in something custom, add a
  `brands/<name>.ts` and wire it in `main.tsx` as shown next.

## Create a custom brand

1. **Write `brands/<name>.ts`** with `defineTheme` (full token list in the table):
   ```ts
   import { defineTheme } from "@liebstoeckel/theme";

   export default defineTheme({
     name: "acme",                      // must match data-brand + the brands={[…]} entry
     colors: {
       bg: "#0b0e14", surface: "#141925", border: "#222a3a",
       text: "#e6eaf2", muted: "#8a93a6",
       primary: "#3b82f6",              // brand
       accent: "#22d3ee",               // accent
       accent2: "#f0abfc",              // optional secondary accent
       onPrimary: "#ffffff",            // text/icons on a primary fill
     },
     fonts: {
       // House families (already bundled, zero font work): "Schibsted Grotesk Variable",
       // "Hanken Grotesk Variable", "Fraunces Variable", "JetBrains Mono Variable".
       heading: '"Schibsted Grotesk Variable", system-ui, sans-serif',
       body: '"Schibsted Grotesk Variable", system-ui, sans-serif',
       mono: '"JetBrains Mono Variable", ui-monospace, monospace',
     },
     viz: ["#3b82f6", "#22d3ee", "#f0abfc", "#a3e635", "#fbbf24"], // optional chart palette
     glow: { a: "#10233f", b: "#0b2530" },                         // optional atmosphere gradient
   });
   ```

2. **Wire it in `main.tsx`** — import the theme, pass it via `brandThemes`, and
   name it the active brand:
   ```tsx
   import "@liebstoeckel/theme/styles.css";
   import { Present } from "@liebstoeckel/engine";
   import acme from "./brands/acme";

   <Present title="…" brands={["acme"]} brandThemes={[acme]} slides={[…]} />
   ```

3. **Match `index.html`** — `<body data-brand="acme">`.

4. Run the `build --check` loop as always.

### Tokens

| Token (`--brand-*`) | Tailwind | Meaning | Required |
| --- | --- | --- | --- |
| `bg` / `surface` | `bg-bg` / `bg-surface` | page + panel backgrounds | ✓ |
| `text` / `muted` | `text-text` / `text-muted` | primary + secondary text | ✓ |
| `primary` / `accent` | `text-primary` / `text-accent` | brand + accent | ✓ |
| `on-primary` | `text-on-primary` | content on a primary fill | ✓ |
| `font-heading/body/mono` | `font-heading/body/mono` | typefaces | ✓ |
| `border` | `border-border` | hairlines | optional |
| `accent2` | `text-accent2` | secondary accent | optional |
| `viz-0…n` | (read by charts) | chart-series palette (`viz`) | optional |
| `glow-a/b` | (none) | atmosphere gradient stops (`glow`) | optional |

Charts read `viz` via `useBrandColors()` — set it for on-brand series instead of
hardcoding colors in the chart.

## Fonts — bundle them or they silently fall back

A brand's `fonts.*` values are just `font-family` **strings**. The glyphs only
ship if a matching `@font-face` is **bundled** (the build inlines its woff2 into
the single file). Naming a font in the brand does **not** load it.

The trap: if you name a `"… Variable"` family that nothing bundles, the browser
**silently** falls back to a system font — no error, and the deck won't match what
you saw in dev (a past session shipped Noto Sans this way). The build now warns:

```
⚠ brand font not bundled: "Nunito Sans Variable"
```

Treat that warning as **must-fix**. Two correct options:

- **Use a house family** (no font work): `"Schibsted Grotesk Variable"`,
  `"Hanken Grotesk Variable"`, `"Fraunces Variable"`, `"JetBrains Mono Variable"`
  are already bundled by `@liebstoeckel/theme/styles.css`.

- **Add another font** — install its Fontsource package and bundle **one latin
  variable face**, mirroring `@liebstoeckel/theme`'s `fonts.css`:
  ```bash
  bun add @fontsource-variable/<id>          # e.g. nunito-sans, inter, manrope
  ```
  Create `brands/<name>.css`:
  ```css
  @font-face {
    font-family: "Nunito Sans Variable";     /* exact family used in the brand, incl. "Variable" */
    src: url("@fontsource-variable/nunito-sans/files/nunito-sans-latin-wght-normal.woff2") format("woff2");
    font-weight: 200 1000;                    /* the package's variable range */
    font-style: normal;
    font-display: swap;
  }
  ```
  Import it in `main.tsx` (above the slides): `import "./brands/<name>.css";`. Bun
  resolves the bare `@fontsource-variable/…` `url()` and base64-inlines the woff2 —
  no CDN, no `<link>`, still one self-contained file.

  **Do not** `import "@fontsource-variable/<id>"` or its `/index.css`. That pulls
  ~5 `unicode-range`-subset faces that do **not** survive the build's inlining and
  silently fall back. Reference the single `…-latin-wght-normal.woff2` directly.

### Gotchas

- **Family name must match exactly**, including a `Variable` suffix. `"Nunito
  Sans Variable"` ≠ the system `"Nunito Sans"`; a mismatch falls back.
- **Verify** after building, especially before exporting a PDF:
  ```bash
  liebstoeckel export <deck> --format pdf -o /tmp/d.pdf
  pdffonts /tmp/d.pdf        # the brand family should appear; no Noto/system fallback
  ```
- Fonts/PNG/PDF export need a Chromium — see `references/troubleshooting.md`.
