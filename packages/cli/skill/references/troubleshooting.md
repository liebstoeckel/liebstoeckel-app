# The check loop & common errors

`liebstoeckel build --check` is your correctness gate. It validates the deck
**bundles** (imports resolve, MDX/TSX transforms, visx interop holds) and returns
structured diagnostics. It does **not** type-check.

```bash
liebstoeckel build --check --dir <deck>
# { "ok": true, "diagnostics": [] }
# or
# { "ok": false, "diagnostics": [ { "level": "error", "message": "...", "file": "...", "line": 12 } ] }
```

Loop: run it, fix each `diagnostic` (use `file`/`line`/`message`), re-run until
`ok` is `true`. Only then `build` / `export`.

## Common diagnostics

- **`Could not resolve "X"`** — a missing dependency. If `X` is a chart you used,
  run `liebstoeckel add <chart> --dir <deck>`. If it's a node module, run
  `bun install` in the deck. A relative path means a wrong import path to a slide or
  `charts/` file.
- **`Could not resolve "../charts/Foo"`** — you imported a chart you haven't
  scaffolded, or used the wrong export name. Check `registry view <name> --json`
  (the `exports` field is the symbol; the file is `charts/<Exports>.tsx`).
- **Element type is invalid / undefined component** — usually a wrong import name
  (default vs named) or a chart used before `add`. Confirm the export name from
  `registry view`.
- **A blank or mis-laid-out slide** — author to the 1280×720 canvas; don't rely on
  `vh`/`vw` for layout, and give charts a sized container or explicit `width`/`height`.

## Verifying the visual result

`build --check` proves it compiles, not that it looks right. To eyeball it, build and
export a slide to PNG:

```bash
liebstoeckel export <deck> --slides 1 -o ./out     # PNG of slide 1 at 2560×1440
```
