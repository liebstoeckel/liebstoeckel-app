// liebstoeckel add horizontal-bar-chart
import { useMemo } from "react";
import { motion } from "motion/react";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Group } from "@visx/group";
import { Bar } from "@visx/shape";
import { useBrandColors } from "./useBrandColors";

export interface HorizontalBarChartDatum {
  label: string;
  value: number;
}

const DEFAULT_DATA: HorizontalBarChartDatum[] = [
  { label: "TypeScript", value: 412 },
  { label: "Rust", value: 318 },
  { label: "Python", value: 286 },
  { label: "Go", value: 197 },
  { label: "Zig", value: 124 },
];

/**
 * HorizontalBarChart — a ranking chart, longest bar at the top.
 *
 * Scaffolded into your deck via `liebstoeckel add horizontal-bar-chart`. From
 * here it is YOUR source: change the data, palette, geometry, or motion freely
 * — nothing imports this from a package.
 *
 * Data is sorted descending so the ranking reads top-to-bottom; category labels
 * sit at the left, value labels at the end of each bar, and each bar grows in
 * from the left staggered by index, filled from the brand viz palette.
 */
export function HorizontalBarChart({
  data = DEFAULT_DATA,
  width = 560,
  height = 360,
}: {
  data?: HorizontalBarChartDatum[];
  width?: number;
  height?: number;
}) {
  const c = useBrandColors();
  const m = { top: 16, right: 56, bottom: 16, left: 104 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;

  const sorted = useMemo(() => [...data].sort((a, b) => b.value - a.value), [data]);

  const y = useMemo(
    () => scaleBand({ domain: sorted.map((d) => d.label), range: [0, ih], padding: 0.3 }),
    [sorted, ih],
  );
  const x = useMemo(
    () => scaleLinear({ domain: [0, Math.max(...sorted.map((d) => d.value)) * 1.05], range: [0, iw] }),
    [sorted, iw],
  );

  return (
    <svg width={width} height={height} role="img" aria-label="Horizontal ranking bar chart, highest value at top">
      <Group left={m.left} top={m.top}>
        {sorted.map((d, i) => {
          const bh = y.bandwidth();
          const by = y(d.label) ?? 0;
          const bw = x(d.value);
          const fill = c.viz[i % c.viz.length] ?? c.primary;
          return (
            <g key={d.label}>
              <text
                x={-12}
                y={by + bh / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fill={c.muted}
                fontFamily="var(--brand-font-body)"
                fontSize={13}
              >
                {d.label}
              </text>
              <motion.g
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: i * 0.08, type: "spring", stiffness: 120, damping: 18 }}
                style={{ transformOrigin: `0px ${by + bh / 2}px` }}
              >
                <Bar
                  x={0}
                  y={by}
                  width={bw}
                  height={bh}
                  rx={8}
                  fill={fill}
                  style={{ filter: `drop-shadow(0 6px 20px ${fill}40)` }}
                />
              </motion.g>
              <motion.text
                x={bw + 10}
                y={by + bh / 2}
                textAnchor="start"
                dominantBaseline="middle"
                fill={c.text}
                fontFamily="var(--brand-font-mono)"
                fontSize={14}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.08 + 0.32 }}
              >
                {d.value}
              </motion.text>
            </g>
          );
        })}
        <line x1={0} x2={0} y1={0} y2={ih} stroke={c.border} strokeOpacity={0.6} />
      </Group>
    </svg>
  );
}
