// liebstoeckel add donut-chart
import { useMemo } from "react";
import { motion } from "motion/react";
import { Pie } from "@visx/shape";
import { Group } from "@visx/group";
import { useBrandColors } from "./useBrandColors";

export interface DonutDatum {
  label: string;
  value: number;
}

const DEFAULT_DATA: DonutDatum[] = [
  { label: "Direct", value: 38 },
  { label: "Organic", value: 27 },
  { label: "Referral", value: 18 },
  { label: "Social", value: 11 },
  { label: "Email", value: 6 },
];

/**
 * DonutChart — scaffolded via `liebstoeckel add donut-chart`.
 *
 * A donut (a `Pie` with an inner radius) where each arc scales + rotates in,
 * staggered by index, fading from transparent. The running total is centered in
 * the hole; a swatch + label + value legend sits to the right **when there's
 * room** (wide enough). Center text and the hole scale with the donut radius, so
 * it stays clean from a small gallery tile up to a full slide. Arc colors come
 * from the brand viz palette. Owned source: edit the data, palette, hole size,
 * legend breakpoint, or motion freely — nothing imports this from a package.
 */
export function DonutChart({
  data = DEFAULT_DATA,
  width = 420,
  height = 420,
}: {
  data?: DonutDatum[];
  width?: number;
  height?: number;
}) {
  const c = useBrandColors();

  // Only reserve a side legend when the chart is wide enough to keep the donut
  // legible; otherwise center a full-size donut and drop the legend.
  const showLegend = width >= 360;
  const legendW = showLegend ? 132 : 0;
  const chartW = width - legendW;

  const pad = 10;
  const radius = Math.max(12, Math.min(chartW, height) / 2 - pad);
  const cx = chartW / 2;
  const cy = height / 2;
  const innerRadius = radius * 0.62;

  // Scale the centered total + caption to the radius (capped so big donuts don't shout).
  const totalFont = Math.min(40, Math.max(13, Math.round(radius * 0.5)));
  const captionFont = Math.min(13, Math.max(7, Math.round(radius * 0.16)));

  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  const colorOf = (i: number) => c.viz[i % c.viz.length] ?? c.primary;

  const rowH = 26;
  const legendX = chartW + 8;
  const legendTop = height / 2 - (data.length * rowH) / 2 + rowH / 2;

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`Donut chart of ${data.length} categories totaling ${total}`}
    >
      <Group top={cy} left={cx}>
        <Pie
          data={data}
          pieValue={(d) => d.value}
          outerRadius={radius}
          innerRadius={innerRadius}
          padAngle={0.02}
          cornerRadius={3}
        >
          {(pie) =>
            pie.arcs.map((arc, i) => {
              const path = pie.path(arc) ?? undefined;
              const fill = colorOf(i);
              return (
                <motion.path
                  key={`arc-${arc.data.label}`}
                  d={path}
                  fill={fill}
                  stroke={c.surface}
                  strokeWidth={2}
                  style={{
                    transformOrigin: "0px 0px",
                    filter: `drop-shadow(0 4px 16px ${fill}33)`,
                  }}
                  initial={{ opacity: 0, scale: 0.6, rotate: -8 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  transition={{
                    delay: i * 0.1,
                    type: "spring",
                    stiffness: 140,
                    damping: 18,
                  }}
                />
              );
            })
          }
        </Pie>

        <motion.g
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: data.length * 0.1 + 0.1, type: "spring", stiffness: 160, damping: 16 }}
          style={{ transformOrigin: "0px 0px" }}
        >
          <text
            textAnchor="middle"
            dy={-captionFont * 0.4}
            fill={c.text}
            fontFamily="var(--brand-font-mono)"
            fontSize={totalFont}
            fontWeight={600}
          >
            {total}
          </text>
          <text
            textAnchor="middle"
            dy={totalFont * 0.62}
            fill={c.muted}
            fontFamily="var(--brand-font-body)"
            fontSize={captionFont}
            letterSpacing={1}
          >
            TOTAL
          </text>
        </motion.g>
      </Group>

      {showLegend && (
        <Group left={legendX} top={legendTop}>
          {data.map((d, i) => {
            const fill = colorOf(i);
            return (
              <motion.g
                key={`legend-${d.label}`}
                transform={`translate(0, ${i * rowH})`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.1 + 0.2 }}
              >
                <rect x={0} y={-9} width={11} height={11} rx={3} fill={fill} />
                <text x={18} y={1} fill={c.text} fontFamily="var(--brand-font-body)" fontSize={13}>
                  {d.label}
                </text>
                <text
                  x={legendW - 16}
                  y={1}
                  textAnchor="end"
                  fill={c.muted}
                  fontFamily="var(--brand-font-mono)"
                  fontSize={13}
                >
                  {d.value}
                </text>
              </motion.g>
            );
          })}
        </Group>
      )}
    </svg>
  );
}
