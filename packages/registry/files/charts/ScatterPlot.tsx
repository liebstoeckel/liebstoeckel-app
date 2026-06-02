// liebstoeckel add scatter-plot
import { useMemo } from "react";
import { motion } from "motion/react";
import { scaleLinear } from "@visx/scale";
import { Group } from "@visx/group";
import { GridRows, GridColumns } from "@visx/grid";
import { BrandAxisBottom, BrandAxisLeft } from "./BrandAxis";
import { useBrandColors } from "./useBrandColors";

export interface ScatterDatum {
  x: number;
  y: number;
  /** Optional third dimension — encoded as point radius. */
  z?: number;
}

const DEFAULT_DATA: ScatterDatum[] = [
  { x: 12, y: 34, z: 8 },
  { x: 24, y: 52, z: 14 },
  { x: 31, y: 41, z: 6 },
  { x: 38, y: 67, z: 22 },
  { x: 45, y: 58, z: 11 },
  { x: 52, y: 79, z: 17 },
  { x: 58, y: 64, z: 9 },
  { x: 66, y: 88, z: 26 },
  { x: 71, y: 72, z: 13 },
  { x: 79, y: 95, z: 19 },
  { x: 85, y: 81, z: 7 },
  { x: 92, y: 104, z: 30 },
];

/**
 * ScatterPlot — scaffolded via `liebstoeckel add scatter-plot`.
 *
 * Points on linear x/y scales with brand-styled axes (via `BrandAxis`) and faint
 * gridlines. Each point is a plain `motion.circle` that fades + scales in,
 * staggered by index. An optional `z` value on a datum is encoded as the point
 * radius. Points are filled from the brand accent. Owned source: edit the data,
 * scales, palette, or motion freely.
 */
export function ScatterPlot({
  data = DEFAULT_DATA,
  width = 560,
  height = 360,
}: {
  data?: ScatterDatum[];
  width?: number;
  height?: number;
}) {
  const c = useBrandColors();
  const m = { top: 24, right: 24, bottom: 44, left: 48 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;

  const x = useMemo(
    () =>
      scaleLinear({
        domain: [0, Math.max(...data.map((d) => d.x)) * 1.08],
        range: [0, iw],
        nice: true,
      }),
    [data, iw],
  );
  const y = useMemo(
    () =>
      scaleLinear({
        domain: [0, Math.max(...data.map((d) => d.y)) * 1.1],
        range: [ih, 0],
        nice: true,
      }),
    [data, ih],
  );
  const r = useMemo(() => {
    const zs = data.map((d) => d.z ?? 0);
    const hasZ = zs.some((z) => z > 0);
    const rScale = scaleLinear({ domain: [0, Math.max(...zs, 1)], range: [4, 13] });
    return (d: ScatterDatum) => (hasZ ? rScale(d.z ?? 0) : 5);
  }, [data]);

  return (
    <svg width={width} height={height} role="img" aria-label="Scatter plot of points on an x and y axis">
      <Group left={m.left} top={m.top}>
        <GridRows scale={y} width={iw} numTicks={5} stroke={c.border} strokeOpacity={0.15} />
        <GridColumns scale={x} height={ih} numTicks={6} stroke={c.border} strokeOpacity={0.12} />

        <BrandAxisLeft scale={y} numTicks={5} hideAxisLine tickLength={4} />
        <BrandAxisBottom top={ih} scale={x} numTicks={6} />

        {data.map((d, i) => (
          <motion.circle
            key={`pt-${i}`}
            cx={x(d.x)}
            cy={y(d.y)}
            fill={c.accent}
            fillOpacity={0.78}
            stroke={c.surface}
            strokeWidth={1.5}
            style={{
              transformBox: "fill-box",
              transformOrigin: "center",
              filter: `drop-shadow(0 0 6px ${c.accent}55)`,
            }}
            initial={{ opacity: 0, scale: 0, r: 0 }}
            animate={{ opacity: 1, scale: 1, r: r(d) }}
            transition={{
              delay: i * 0.05,
              type: "spring",
              stiffness: 220,
              damping: 16,
            }}
          />
        ))}
      </Group>
    </svg>
  );
}
