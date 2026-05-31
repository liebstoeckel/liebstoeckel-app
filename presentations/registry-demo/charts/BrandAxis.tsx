// liebstoeckel add brand-axis
import type { ComponentProps } from "react";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { useBrandColors } from "./useBrandColors";

/**
 * BrandAxis — styled-axis primitives scaffolded via `liebstoeckel add brand-axis`.
 *
 * Thin wrappers around `AxisBottom` / `AxisLeft` from `@visx/axis` that bake in
 * the active brand's styling: axis line = `border`, ticks = `muted`, and tick
 * labels in `muted` with the brand body font. Everything else (`scale`,
 * `top`/`left`, `numTicks`, `label`, `tickFormat`, …) forwards straight through,
 * so other charts can adopt these instead of repeating axis style props.
 *
 * Owned source: tweak the shared styling here and every chart that uses these
 * follows. Per-call overrides still win — anything you pass in props is spread
 * after the defaults.
 */

type BottomProps = ComponentProps<typeof AxisBottom>;
type LeftProps = ComponentProps<typeof AxisLeft>;

const TICK_LABEL_BASE = {
  fontFamily: "var(--brand-font-body)",
  fontSize: 12,
} as const;

export function BrandAxisBottom(props: BottomProps) {
  const c = useBrandColors();
  return (
    <AxisBottom
      stroke={c.border}
      tickStroke={c.muted}
      tickLabelProps={() => ({
        ...TICK_LABEL_BASE,
        fill: c.muted,
        textAnchor: "middle",
        dy: 4,
      })}
      labelProps={{
        fill: c.muted,
        fontFamily: "var(--brand-font-body)",
        fontSize: 13,
        textAnchor: "middle",
      }}
      {...props}
    />
  );
}

export function BrandAxisLeft(props: LeftProps) {
  const c = useBrandColors();
  return (
    <AxisLeft
      stroke={c.border}
      tickStroke={c.muted}
      tickLabelProps={() => ({
        ...TICK_LABEL_BASE,
        fill: c.muted,
        textAnchor: "end",
        dx: -4,
        dy: 4,
      })}
      labelProps={{
        fill: c.muted,
        fontFamily: "var(--brand-font-body)",
        fontSize: 13,
        textAnchor: "middle",
      }}
      {...props}
    />
  );
}
