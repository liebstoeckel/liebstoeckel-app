# steps.ts, four states

The weighted reveal slide's code: each fenced block is one state.

```ts
const total = steps.length
```

```ts
const total = steps.reduce((n, s) => n + s.weight, 0)
```

```ts
const total = steps.reduce((n, s) => n + s.weight, 0)
const shown = resolveStep(step, total)
```

```ts
const total = steps.reduce((n, s) => n + s.weight, 0)
const shown = resolveStep(step, total)
// entering backwards: shown === total
```
