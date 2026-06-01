<!-- liebstoeckel:start -->
## Presentations (liebstoeckel)

This project builds presentation decks with **liebstoeckel** (code-first slides → one
self-contained HTML). To create or edit a deck, drive the `liebstoeckel` CLI:

- Discover charts: `liebstoeckel registry list --json`, then `liebstoeckel registry view <name> --json` for a component's exact `exports`, `props`, and `dataShape`.
- New deck: `liebstoeckel new <name> [--brand <brand>]`.
- Scaffold a chart into a deck (owned source + deps): `liebstoeckel add <name> --dir <deck>`.
- Validate (run in a loop until `ok:true`): `liebstoeckel build --check --dir <deck>`.
- Build / export: `liebstoeckel build <deck>` · `liebstoeckel export <deck> --format pdf -o deck.pdf`.

Slides are MDX/TSX files in `<deck>/slides/`, listed in order in `main.tsx`; charts are
owned source in `<deck>/charts/`. Never invent component names or data shapes — read
them from `registry view`. Don't hand-write the final HTML; author slides and let
`build` render. Full guide: the `liebstoeckel-deck` skill, or https://liebstoeckel.app/llms.txt
<!-- liebstoeckel:end -->
