import { useMemo } from "react";
import { motion } from "motion/react";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Group } from "@visx/group";
import { useBrandColors } from "./useBrandColors";

export interface HelloChartDatum {
  label: string;
  value: number;
}

const DEFAULT_DATA: HelloChartDatum[] = [
  { label: "Mon", value: 42 },
  { label: "Tue", value: 58 },
  { label: "Wed", value: 35 },
  { label: "Thu", value: 71 },
  { label: "Fri", value: 49 },
];

/**
 * HelloChart — the "hello world" of the liebstoeckel registry.
 *
 * Scaffolded into your deck via `liebstoeckel add hello-chart`. From here it is
 * YOUR source: change the data, palette, geometry, or motion freely — nothing
 * imports this from a package.
 *
 * Uses only single-file-bundler-safe visx packages (scale / group / shape) and
 * draws its own baseline. `@visx/axis` is intentionally avoided — the bundler
 * mangles it (DESIGN.md:395), which is why the registry ships axes as source.
 */
export function HelloChart({
  data = DEFAULT_DATA,
  width = 560,
  height = 360,
}: {
  data?: HelloChartDatum[];
  width?: number;
  height?: number;
}) {
  const c = useBrandColors();
  const m = { top: 24, right: 16, bottom: 40, left: 16 };
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
    <svg width={width} height={height} role="img" aria-label="Hello chart">
      <Group left={m.left} top={m.top}>
        {data.map((d, i) => {
          const bw = x.bandwidth();
          const bx = x(d.label) ?? 0;
          const bh = ih - y(d.value);
          const fill = c.viz[i % c.viz.length] ?? c.primary;
          return (
            <g key={d.label}>
              <motion.rect
                x={bx}
                width={bw}
                rx={8}
                fill={fill}
                initial={{ height: 0, y: ih }}
                animate={{ height: bh, y: y(d.value) }}
                transition={{ delay: i * 0.08, type: "spring", stiffness: 120, damping: 18 }}
                style={{ filter: `drop-shadow(0 6px 20px ${fill}40)` }}
              />
              <motion.text
                x={bx + bw / 2}
                y={y(d.value) - 12}
                textAnchor="middle"
                fill={c.text}
                fontFamily="var(--brand-font-mono)"
                fontSize={15}
                fontWeight={600}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.08 + 0.3 }}
              >
                {d.value}
              </motion.text>
              <text
                x={bx + bw / 2}
                y={ih + 26}
                textAnchor="middle"
                fill={c.muted}
                fontFamily="var(--brand-font-body)"
                fontSize={15}
              >
                {d.label}
              </text>
            </g>
          );
        })}
        <line x1={0} x2={iw} y1={ih} y2={ih} stroke={c.border} strokeOpacity={0.6} />
      </Group>
    </svg>
  );
}
