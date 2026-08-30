# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Register

product

## Users

Deck authors running `liebstoeckel dev` on their own machine, usually pairing with an
agent that edits the MDX/TSX while they look at the render: developers, technical
writers, the occasional designer. They are in a tight loop (mark the slide, send,
watch hot reload) and judge the chrome the way they judge DevTools, Storybook, or
Figma's side panels: it should stay out of the deck's way and behave exactly as a
panel is expected to.

The same sidebar is the parent-frame half of a future hosted editor: organization
members annotating and later authoring hosted decks in a hosted editor, with
the deck in a sandboxed iframe. Local and hosted share the component; only the wire
differs.

## Product Purpose

The dev-server package is liebstoeckel's authoring-time surface: it serves a deck with
hot reload and puts a tool sidebar beside it. The first tool is live annotations
(strokes and positioned comments on a slide, dispatched as a batch to a polling agent,
with one-click revert); the slide list is the second, where a **+** between rows queues a
described new slide for the agent to create and register; the sidebar also shows agent
presence.
Success looks like: an author never loses their place in the deck, the sidebar never
steals the stage, a change round-trips (annotate, send, hot reload) in seconds, and the
component later drops into the dashboard without a redesign.

Built decks contain none of this. The sidebar is dev tooling, not part of the artifact.

## Brand Personality

Same house identity as the rest of liebstoeckel, **engineered, honest,
terminal-adjacent**, in product register: **earned familiarity**. Noir/gold on the
greenish near-black, Schibsted Grotesk for UI text, JetBrains Mono for identifiers
(file names, slide numbers, ids). Dark-only: it is a working surface next to a
black stage. Calm and dense; gold marks the primary action, the current slide, and
focus, nothing else. Copy is plain and short, avoids em-dashes and middots, and names
the product lowercase **liebstoeckel**.

**Honesty guardrail (shared):** the agent writes real MDX/TSX the author owns; the
sidebar directs the agent and never generates or mutates slides itself. Do not describe
it as AI designing slides.

## Anti-references

- **Floating-widget chrome.** Pills, bubbles, and glassy panels hovering over the
  slide (the v1 drawer); the sidebar is a proper panel that reshapes the viewport.
- **Generic dev-tool gray.** Neutral #1e1e1e-on-system-ui that could be any VS Code
  extension; this surface belongs to the house palette.
- **Decorated motion.** Slide-in choreography, bouncing toasts, animated width; state
  changes are instant or 150-250 ms fades.
- **Display treatment in the panel.** No marketing headline sizes, no tracked eyebrows
  on every section; section labels are quiet.
- **Low-contrast muted text** on the dark ground, the recurring AA failure.

## Design Principles

- **The stage is the product.** The sidebar takes exactly the width it needs, collapses
  to a rail, and overlays instead of pushing on narrow hosts; it never scales the
  deck below usefulness without the author choosing to.
- **One component, two hosts.** Every visual decision must hold inside the dashboard
  as well as in the local shell; tokens, not raw values, and no dependency the CLI
  cannot bundle.
- **State is visible, not announced.** Agent presence, draft marks, batch status,
  and revertability show as quiet persistent indicators; toasts confirm, they do not
  narrate.
- **Standard panel grammar.** Sections, lists, chips, and buttons behave like the
  best side panels the author already knows; novelty is spent on nothing here.
- **Keyboard first.** Everything reachable and operable without the mouse, because
  the author's hands are on the keyboard in the editor next door.

## Accessibility & Inclusion

WCAG AA on the dark surface: body and muted text meet 4.5:1 against every ground they
sit on; gold carries dark ink (dark-on-gold). Visible `:focus-visible` rings on every
control, full keyboard operation (slide list as a list of buttons, sections reachable
in order, Escape leaves the draw/comment mode), `role="status"` for toasts, and
`aria-expanded` on the collapse control. `prefers-reduced-motion` removes every
transition. Touch targets are desktop-dense by default (the sidebar is a desktop
tool); the overlay mode on narrow hosts must still be operable by touch.
