# Editing an existing deck

Find the deck (a dir with `main.tsx` + `slides/`). The slide order is the `slides`
array in `main.tsx`.

## Trust: building runs the deck's code

A deck is **code**. Building it (`build`, `build --check`, the `eject` rebuild,
`licenses` from source) executes the deck's build-time modules on this machine with
full filesystem and network access. A deck scaffolded here via `liebstoeckel new` is
trusted automatically; a deck you did **not** create here (cloned, downloaded, handed
over) is **untrusted**, and a non-interactive build of it fails fast:

```json
{ "ok": false, "error": "untrusted deck", "hint": "…re-run with --trust…" }
```

**You MUST NOT silence this yourself.** Never pass `--trust` or set
`LIEBSTOECKEL_TRUST_BUILD=1` on your own initiative — that is a security decision the
user owns, not you. When you hit this error, **stop and ask the user** whether they
trust this specific deck, and only re-run with `--trust` after they explicitly say yes.
If they don't confirm, do not build it.

## Add a slide

1. Create `slides/NN-name.tsx` (pick `NN` for its position) with a default-exported
   component (see `authoring.md`).
2. Import it in `main.tsx` and insert it into the `slides` array at the right spot.
3. `liebstoeckel build --check` until clean.

## Replace / rewrite a slide

Edit the slide file in place. If you change what data a chart needs, keep the data
matching the chart's `dataShape` (`registry view <name> --json`).

## Add a chart to an existing slide

```bash
liebstoeckel registry view <name> --json
liebstoeckel add <name> --dir <deck>
```
Then import it from `../charts/` and pass data. If `add` reports the file as
`skipped`, the chart is already in the deck — just import and use it.

## Remove a slide

Delete the file and remove its import + array entry from `main.tsx`.

## Re-theme

Change the brand in `main.tsx`'s `<Present brands={["…"]}>` (and/or run with a
different brand). Every chart and token follows; don't hand-edit colors.

## Recover source from a built `.html` (eject)

`eject` reverses a `build`: it unpacks the editable project (the `main.tsx`, `slides/`,
`charts/`, assets) that was inlined into a single `.html`, so you can edit a deck you
only have as a built file. The result is a normal deck directory — edit it with the
workflows above, then rebuild.

```bash
liebstoeckel eject <deck.html> [outdir]   # default outdir: <deck>-source; --force to overwrite
cd <outdir>
bun install --ignore-scripts             # installs deps WITHOUT running npm lifecycle scripts
liebstoeckel build                       # rebuild to a single .html
```

`--ignore-scripts` only blocks npm lifecycle scripts — it does **not** sandbox the deck:
`build` still runs the deck's own macros and build plugins. An ejected deck is **not**
trusted (only `liebstoeckel new` auto-trusts), so this rebuild hits the trust gate. Per
the trust rule above: if it fails with `untrusted deck`, **ask the user** — never add
`--trust` yourself.

## Always finish with the check loop

```bash
liebstoeckel build --check --dir <deck>   # fix diagnostics, repeat until ok:true
```
