# Adding live plugins to a deck

Plugins make a deck **interactive when presented live**: poll voting, an audience
Q&A queue, floating reactions. The same deck still builds to one self-contained
`.html` — offline it renders a static **fallback** preview of each plugin; in a live
session the real, synced UI takes over.

**Plugins are not in the registry.** Don't run `registry list/view` for them — that
catalog is charts/elements/hooks only. The built-ins and their props are listed here
and in `SKILL.md`; that is the contract.

## The built-ins

| id          | package                          | props                                  |
|-------------|----------------------------------|----------------------------------------|
| `poll`      | `@liebstoeckel/plugin-poll`      | `{ question: string; options: string[] }` |
| `qa`        | `@liebstoeckel/plugin-qa`        | `{ prompt?: string }` (default `"Ask a question"`) |
| `reactions` | `@liebstoeckel/plugin-reactions` | _none_                                 |

## Wiring is two steps (both required)

A `<Plugin>` tag alone does nothing. The plugin must also be a dependency **and**
registered on `<Present>`.

### 1. Depend + register in `main.tsx`

Scaffolded decks ship **no** plugin packages, so add the ones you use:

```bash
bun add @liebstoeckel/plugin-poll @liebstoeckel/plugin-qa @liebstoeckel/plugin-reactions
```

Then import each (default export) and pass the set to `<Present plugins={…}>`:

```tsx
// main.tsx
import { Present } from "@liebstoeckel/engine";
import poll from "@liebstoeckel/plugin-poll";
import qa from "@liebstoeckel/plugin-qa";
import reactions from "@liebstoeckel/plugin-reactions";

<Present
  title="Q4 Review"
  brands={["nocturne"]}
  plugins={[poll, qa, reactions]}   // ← register every plugin you place
  slides={[…]}
/>
```

### 2. Place `<Plugin>` on a slide

```tsx
import { Plugin } from "@liebstoeckel/engine";

// poll
<Plugin id="poll" props={{ question: "What should we build next?", options: ["A", "B", "C"] }} />

// q&a
<Plugin id="qa" props={{ prompt: "What should we dig into?" }} />

// reactions (no props)
<Plugin id="reactions" />
```

`<Plugin>` full signature:

```tsx
<Plugin
  id="poll"                 // required — matches the plugin's id
  instance="pace"           // optional — independent state slice (see below)
  title="…"                 // optional — presenter-tab label for sibling instances
  props={{ … }}             // optional — author config passed to the plugin
  components={{ … }}        // optional — per-placement surface overrides
/>
```

## Per-plugin notes

- **poll** — one shared poll per `id`. For **several independent polls**, give each a
  stable `instance` (their votes/options stay separate, and each gets its own presenter
  tab):
  ```tsx
  <Plugin id="poll" instance="pace" props={{ question: "How's the pace?", options: ["Slow", "Right", "Fast"] }} />
  ```
- **qa** — also exposes a deck-wide 💬 panel, so the audience can ask from **any
  slide**; a dedicated Q&A slide is optional. The presenter moderates (mark answered /
  dismiss) from the presenter console.
- **reactions** — emoji float deck-wide over **every** slide once placed; ephemeral
  (self-pruning, rate-limited). No configuration, no presenter tab.

## Validate: registration is not build-checked

`liebstoeckel build --check` catches a missing **import** (`Could not resolve
"@liebstoeckel/plugin-poll"`), but it does **not** catch a `<Plugin id="poll">` that
was never added to `<Present plugins>` — that placement silently falls back to the
offline preview. So after the check passes, confirm by eye: **every `id` you placed
appears in the `plugins={[…]}` array.**

## Present it live (how to see plugins activate)

Built or opened directly, a deck shows only fallbacks. Plugins go live with:

```bash
liebstoeckel live <deck-dir|deck.html>     # LAN: prints presenter + audience links
```

Open the **presenter** link yourself; share the **audience** link (or its QR). Slide
navigation and all plugin state sync in real time. Present to a remote audience through
a public relay:

```bash
liebstoeckel live <deck> --relay <https://relay-host> --relay-token <token>
```

**Trust model:** a deck's server-side plugin code (if any) runs **on the presenter's
machine** — never on the relay. `liebstoeckel live` prints a trust warning for this
reason; only run decks you trust.

## Building your own plugin

See `references/build-plugins.md` — only needed when no built-in fits.
