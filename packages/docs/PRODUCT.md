# Product

## Register

product

> The reference/guide pages are the primary surface and are product register (design
> serves reading and navigation). The one `template: splash` start page is a deliberate
> **brand**-register exception — it reuses the landing's typographic hero and install
> terminal. Treat it as brand when working on it specifically.

## Users

Two audiences read these docs, and the design serves both:

- **Developers and technical speakers** evaluating or using liebstoeckel — in a task:
  finding an API, learning a concept (authoring, theming, live sessions, plugins),
  copying a command, or unblocking a build. They read the way they read Linear/Stripe/
  Vercel docs: scanning for the answer, low patience for fluff.
- **Coding agents.** The docs are deliberately LLM-native: `/llms.txt`, per-page "Copy as
  Markdown" and "Open in ChatGPT/Claude" actions, and clean Markdown source. An agent
  driving the `liebstoeckel-deck` skill reads these pages to write correct decks.

The primary job to be done is *find the accurate answer fast* (human) and *consume the
page as clean, correct context* (agent).

## Product Purpose

The documentation site (docs.liebstoeckel.app) teaches and references liebstoeckel: a
code-first, single-file presentation framework. It is built on Astro Starlight (static
HTML, Pagefind search, zero-JS islands, dark/light) and themed with the house "Noir,
all-grotesk" brand. Success looks like: a reader finds the right page in one or two hops,
the example or command works verbatim, and an agent can ingest any page as accurate
Markdown. The docs are part of the product's credibility — the framework promises
agent-readable, code-first output, and the docs practice that.

## Brand Personality

Same house voice as the rest of liebstoeckel — **engineered, honest, terminal-adjacent** —
but expressed in product register: **earned familiarity**, the design disappears into the
reading. Calm, precise, scannable. The noir-and-gold identity is applied through Starlight's
token system (gold accent, forest-charcoal dark default, derived cream light pairing) rather
than through expressive layout. Copy avoids em-dashes and middots (house "less AI" rule).
The brand name is always lowercase **liebstoeckel**.

**Honesty guardrail (shared):** the agent writes real MDX/TSX you own; the deterministic
builder renders it. Never describe the product as "AI generates/designs your slides", a
no-code AI deck builder, an MCP server, marketplace-available, or production-ready.

## Anti-references

- **Generic AI-tool docs** — purple-gradient hero, glassmorphism, decorative motion,
  hero-metric strips.
- **Over-styling Starlight against its grain.** Reinventing standard doc affordances
  (custom nav, weird code blocks, non-standard search) for flavor. Earned familiarity beats
  novelty here; the tool should disappear into the reading.
- **Starlight's default rainbow card chips** — already pinned to one gold brand chip;
  don't reintroduce the per-card hue rotation.
- **Inter / DM Sans default-docs look.** The house face is Schibsted Grotesk.
- **Marketing fluff in reference pages.** The start/splash page may sell; guide and
  reference pages inform.

## Design Principles

- **Findability first.** A reader should reach the right page in one or two hops and scan
  it for the answer. Structure, headings, and the sidebar serve retrieval, not decoration.
- **Agent-readable is a feature.** Clean Markdown, llms.txt, and the copy/open actions are
  load-bearing; keep pages parseable and accurate for machine consumption.
- **Earned familiarity over novelty.** Work with Starlight's conventions; brand through
  tokens (color, type, the gold accent), not by fighting the framework's layout.
- **Practice what you preach.** The docs should feel like the product: code-first, precise,
  honest. Examples and commands must work verbatim.
- **One brand voice, two themes.** Dark-first noir with a real, contrast-correct cream
  light pairing — both ship, both pass AA.

## Accessibility & Inclusion

WCAG AA in **both** dark and light themes (the light pairing exists specifically for
readers who prefer it). AA contrast on body, headings, links, and code blocks on each
ground. Keyboard navigation and focus states come from Starlight; don't regress them.
Respect `prefers-reduced-motion` (the atmosphere glow is static; the splash hero's motion
already honors it). Code blocks must stay legible (JetBrains Mono, sufficient contrast) on
both grounds.
