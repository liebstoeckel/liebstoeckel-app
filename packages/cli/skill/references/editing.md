# Editing an existing deck

Find the deck (a dir with `main.tsx` + `slides/`). The slide order is the `slides`
array in `main.tsx`.

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

## Recover source from a built `.html`

If you only have a built deck, get an editable project back:

```bash
liebstoeckel eject <deck.html> [outdir]
cd <outdir> && bun install --ignore-scripts && bun run build
```

## Always finish with the check loop

```bash
liebstoeckel build --check --dir <deck>   # fix diagnostics, repeat until ok:true
```
