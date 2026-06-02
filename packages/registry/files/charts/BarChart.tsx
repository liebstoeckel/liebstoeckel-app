// liebstoeckel add bar-chart
import { useMemo } from "react";
import { motion } from "motion/react";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Group } from "@visx/group";
import { Bar } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { useBrandColors } from "./useBrandColors";

export interface BarChartDatum {
  label: string;
  value: number;
}

const DEFAULT_DATA: BarChartDatum[] = [
  { label: "Q1", value: 128 },
  { label: "Q2", value: 174 },
  { label: "Q3", value: 96 },
  { label: "Q4", value: 211 },
  { label: "Q5", value: 152 },
];

/**
 * BarChart — vertical categorical bars with axes, gridlines and value labels.
 *
 * Scaffolded into your deck via `liebstoeckel add bar-chart`. From here it is
 * YOUR source: change the data, palette, geometry, or motion freely — nothing
 * imports this from a package.
 *
 * Bars spring up from the baseline staggered by index; each is filled from the
 * brand viz palette and carries a same-color drop-shadow.
 */
export function BarChart({
  data = DEFAULT_DATA,
  width = 560,
  height = 360,
}: {
  data?: BarChartDatum[];
  width?: number;
  height?: number;
}) {
  const c = useBrandColors();
  const m = { top: 28, right: 20, bottom: 40, left: 44 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;

  const x = useMemo(
    () => scaleBand({ domain: data.map((d) => d.label), range: [0, iw], padding: 0.32 }),
    [data, iw],
  );
  const y = useMemo(
    () => scaleLinear({ domain: [0, Math.max(...data.map((d) => d.value)) * 1.1], range: [ih, 0] }),
    [data, ih],
  );

  return (
    <svg width={width} height={height} role="img" aria-label="Vertical bar chart of values by category">
      <Group left={m.left} top={m.top}>
        <GridRows scale={y} width={iw} numTicks={5} stroke={c.border} strokeOpacity={0.15} />
        <AxisLeft
          scale={y}
          hideAxisLine
          tickStroke={c.muted}
          numTicks={5}
          tickLabelProps={() => ({
            fill: c.muted,
            fontFamily: "var(--brand-font-mono)",
            fontSize: 11,
            textAnchor: "end",
            dx: -4,
            dy: 4,
          })}
        />
        {data.map((d, i) => {
          const bw = x.bandwidth();
          const bx = x(d.label) ?? 0;
          const bh = ih - y(d.value);
          const fill = c.viz[i % c.viz.length] ?? c.primary;
          return (
            <g key={d.label}>
              <motion.g
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: i * 0.08, type: "spring", stiffness: 120, damping: 18 }}
                style={{ transformOrigin: `${bx + bw / 2}px ${ih}px` }}
              >
                <Bar
                  x={bx}
                  y={y(d.value)}
                  width={bw}
                  height={bh}
                  rx={8}
                  fill={fill}
                  style={{ filter: `drop-shadow(0 6px 20px ${fill}40)` }}
                />
              </motion.g>
              <motion.text
                x={bx + bw / 2}
                y={y(d.value) - 12}
                textAnchor="middle"
                fill={c.text}
                fontFamily="var(--brand-font-mono)"
                fontSize={14}
                fontWeight={600}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 + 0.32 }}
              >
                {d.value}
              </motion.text>
            </g>
          );
        })}
        <AxisBottom
          top={ih}
          scale={x}
          stroke={c.border}
          tickStroke={c.muted}
          tickLabelProps={() => ({
            fill: c.muted,
            fontFamily: "var(--brand-font-body)",
            fontSize: 12,
            textAnchor: "middle",
          })}
        />
      </Group>
    </svg>
  );
}
