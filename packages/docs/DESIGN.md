---
name: liebstoeckel docs
description: Astro Starlight documentation themed with the house "Noir, all-grotesk" brand — dark-first, gold-accented, agent-readable.
colors:
  brand-gold: "#c9a24b"
  brand-gold-text: "#e0c580"
  brand-gold-tint: "#352a10"
  heading-paper: "#f4f1e6"
  body-bone: "#e9e6d7"
  muted-sage-gray: "#9da28c"
  hairline-olive: "#2c3326"
  surface-forest: "#1a2014"
  ground-forest-charcoal: "#10140e"
typography:
  display:
    fontFamily: "Schibsted Grotesk Variable, system-ui, sans-serif"
    fontWeight: 700
    letterSpacing: "-0.035em"
  heading:
    fontFamily: "Schibsted Grotesk Variable, system-ui, sans-serif"
    fontWeight: 600
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Schibsted Grotesk Variable, system-ui, sans-serif"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  code:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    letterSpacing: "0.01em"
components:
  card-brand:
    backgroundColor: "{colors.brand-gold-tint}"
    textColor: "{colors.body-bone}"
  step-marker:
    textColor: "{colors.brand-gold}"
    rounded: "999px"
    size: "26px"
---

# Design System: liebstoeckel docs

## 1. Overview

**Creative North Star: "The Lit Reading Room"**

These are reference docs, not a billboard. The design is **Astro Starlight wearing the
house brand**: a dark-first forest-charcoal reading surface lit by a single brass gold,
set in the house grotesk, that gets out of the way so a developer (or their agent) can
find an answer and trust it. Brand lives in Starlight's **token system** — gold accent,
ink tiers, the gold card chip, the dark-only wordmark gradient — never in fighting the
framework's layout, navigation, or search. Earned familiarity is the whole point: anyone
who reads Linear, Stripe, or Vercel docs should feel at home immediately.

Two themes ship and both are first-class: dark (Noir) is the default; a derived warm-cream
light pairing exists for readers who prefer it, and both pass AA. The docs are also
**agent-readable** by design (clean Markdown, `/llms.txt`, Copy-as-Markdown / Open-in-LLM
actions), so the visual system must never come at the cost of parseable structure.

This system explicitly rejects: generic AI-tool docs (purple-gradient hero, glassmorphism,
decorative motion), Starlight's default rainbow card chips, the Inter / DM-Sans default-docs
look, and any reinvention of standard doc affordances for flavor.

**Key Characteristics:**
- Brand through tokens, not layout overrides — work with Starlight, not against it.
- Dark-first noir + a real, AA-correct cream light pairing.
- One brass-gold accent; one gold card chip (no rainbow rotation).
- Schibsted Grotesk everywhere; JetBrains Mono for code and data.
- Findability and agent-readability are design constraints, not afterthoughts.

## 2. Colors

A near-black forest reading ground lit by a single brass gold, mapped onto Starlight's
`--sl-color-*` token scale. The frontmatter carries the **dark (default) theme** as
canonical; the light pairing is the same brand re-grounded on warm cream.

### Primary
- **Brass Gold** (#c9a24b → `--sl-color-accent`): buttons, focus rings, rules, the card chip, step markers.
- **Gold Text** (#e0c580 → `--sl-color-accent-high`): links and accent text on the dark ground (higher lightness so gold reads as type).
- **Gold Tint** (#352a10 → `--sl-color-accent-low`): subtle accent backgrounds (the card chip fill).

### Neutral (dark, default)
- **Heading Paper** (#f4f1e6 → `--sl-color-white`): headings, warm near-white.
- **Body Bone** (#e9e6d7 → `--sl-color-gray-1`): body text.
- **Muted Sage-Gray** (#9da28c → `--sl-color-gray-3`): muted / secondary text.
- **Hairline Olive** (#2c3326 → `--sl-color-gray-5`): borders and dividers.
- **Surface Forest** (#1a2014 → `--sl-color-gray-6`): raised surfaces and code-block backgrounds.
- **Forest Charcoal** (#10140e → `--sl-color-black`): the page reading ground.

### Light pairing (re-grounded, prose-only)
The same brand on warm cream: ground **#f6f2e6**, ink **#1b2418**, accent **#9a7414**
(darkened gold for AA on cream), accent text **#6b5210**. Mapped onto the same Starlight
tokens under `:root[data-theme="light"]`.

### Named Rules
**The Tokens-Not-Layout Rule.** Brand by remapping Starlight's `--sl-color-*` / `--sl-font*`
tokens. Never override Starlight's layout, nav, or component structure to force a look; if
you're fighting the framework, stop.

**The Dark-Only-Gradient Rule.** The wordmark white→gold gradient is **dark grounds only**
(per the brand book). Light mode renders the wordmark in plain ink. Never put the gradient
on a light ground.

**The One-Gold-Chip Rule.** Card icon chips are pinned to the gold accent. Starlight's
default per-card rainbow rotation (purple/orange/green/red/blue) is forbidden — the grid
must read as one brand.

## 3. Typography

**Display / Body Font:** Schibsted Grotesk Variable (with system-ui, sans-serif) — `--sl-font`
**Code / Mono Font:** JetBrains Mono Variable (with ui-monospace) — `--sl-font-mono` and Expressive Code's `--ec-codeFontFamily`

**Character:** One grotesk carries everything (headings, body, UI, sidebar); JetBrains Mono
carries code and data. No display/body pairing — product register. The house face is
identity, not an Inter default.

### Hierarchy
- **Display** (700, ls -0.035em): the site-title wordmark and the splash hero only.
- **Heading** (600, ls -0.02em): markdown `h1`–`h3`, tracked tighter to match the grotesk display feel.
- **Body** (400, lh 1.6): prose; Starlight's measure (~65–75ch) applies.
- **Code** (JetBrains Mono, ls 0.01em): Expressive Code blocks and inline `code`.

### Named Rules
**The Mono-Is-Code Rule.** JetBrains Mono is for code and data, not for decorative
"technical" flavor in prose or headings.

## 4. Elevation

Flat, like Starlight. There are **no drop shadows**: depth on the dark theme comes from one
fixed, very low-opacity radial **gold-and-forest atmosphere** behind the content
(`--pi-atmosphere`, `background-attachment: fixed`, dark only), and separation comes from
**olive hairlines** (`--sl-color-gray-5`) and the surface step to `--sl-color-gray-6` for
code blocks and raised panels.

### Named Rules
**The Flat-Reading Rule.** Reading surfaces are flat. No card shadows, no glassmorphism.
The atmosphere glow (dark only) and hairlines carry all depth; if you add a `box-shadow` to
a doc reading surface, it's wrong. The **one** sanctioned exception is the splash page's
(brand-register) install terminal, which lifts off the cream light ground with a soft drop
shadow — the same light-section terminal lift the landing's Tonal-Elevation rule allows.

## 5. Components

Only the components that are **ours** are documented here; stock Starlight components
(nav, sidebar, search, pagination, TOC) are inherited as-is and intentionally not restyled.

### Cards (Starlight `<Card>` / `<CardGrid>`)
- **Chip:** pinned to the gold accent (border `--sl-color-accent`, fill `--sl-color-accent-low`, icon `--sl-color-accent`). One brand chip, never the default rainbow.
- **Shape & layout:** Starlight defaults; do not restyle beyond the chip color.

### Code blocks (Expressive Code)
- JetBrains Mono via `--ec-codeFontFamily`; background on the `--sl-color-gray-6` surface step. Keep contrast AA on both themes. Don't replace the code-block component.

### Splash ledger (`.home-ledger`, start page only)
- Landing-derived: `dt`/`dd` rows separated by top/bottom **olive hairlines** (no card grid), three-column grid (`label · description · mono link`) collapsing to one column under 50rem. `dt` 1.3rem/600/-0.02em in heading paper; `dd` in gray-2; the link in mono gold-text.

### Splash steps (`.home-steps`, start page only)
- Numbered path: a 26px circular **step marker** (gold border + gold mono numeral) beside each step's text. Numbers are used here because the start page describes a real ordered sequence, not as decorative section scaffolding.

### Site-title wordmark
- Mark + wordmark lockup; the wordmark carries the canonical white→gold gradient on dark grounds only (the Dark-Only-Gradient Rule), plain ink on light.

## 6. Do's and Don'ts

### Do:
- **Do** brand by remapping Starlight's `--sl-color-*` and `--sl-font*` tokens (the Tokens-Not-Layout Rule).
- **Do** keep both themes AA on body, headings, links, and code blocks — the light pairing is first-class, not a fallback.
- **Do** pin every card chip to the gold accent (the One-Gold-Chip Rule).
- **Do** reserve JetBrains Mono for code and data.
- **Do** keep pages clean Markdown and structurally parseable — agent-readability is a design constraint (`/llms.txt`, Copy-as-Markdown).
- **Do** keep the wordmark gradient to dark grounds only.

### Don't:
- **Don't** override Starlight's layout, nav, or search for flavor (earned familiarity over novelty).
- **Don't** reintroduce Starlight's rainbow card-chip rotation.
- **Don't** add drop shadows or glassmorphism to reading surfaces (the Flat-Reading Rule).
- **Don't** put the wordmark gradient on a light ground.
- **Don't** replace Schibsted Grotesk with Inter, DM Sans, or another default sans.
- **Don't** add generic AI-tool-docs decoration: purple-gradient hero, decorative motion, hero-metric strips.
- **Don't** let marketing fluff into reference pages; the splash page sells, guide pages inform.
