import { useId, useMemo } from "react";
import { motion } from "motion/react";
import { scaleLinear } from "@visx/scale";
import { Group } from "@visx/group";
import { LinePath } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { useBrandColors } from "./useBrandColors";
import { axisNumber, pointNumber, widestWidth } from "./chartText";

export interface LineSeries {
  label: string;
  points: { x: number; y: number }[];
}

const DEFAULT_DATA: LineSeries[] = [
  {
    label: "Organic",
    points: [
      { x: 0, y: 28 },
      { x: 1, y: 34 },
      { x: 2, y: 31 },
      { x: 3, y: 45 },
      { x: 4, y: 52 },
      { x: 5, y: 61 },
      { x: 6, y: 68 },
    ],
  },
  {
    label: "Referral",
    points: [
      { x: 0, y: 18 },
      { x: 1, y: 22 },
      { x: 2, y: 26 },
      { x: 3, y: 24 },
      { x: 4, y: 33 },
      { x: 5, y: 38 },
      { x: 6, y: 49 },
    ],
  },
  {
    label: "Paid",
    points: [
      { x: 0, y: 12 },
      { x: 1, y: 14 },
      { x: 2, y: 19 },
      { x: 3, y: 23 },
      { x: 4, y: 21 },
      { x: 5, y: 29 },
      { x: 6, y: 31 },
    ],
  },
];

/**
 * LineChart — scaffolded via `liebstoeckel add line-chart`.
 *
 * Multi-series trend chart: smooth monotone curves, x + y axes, faint
 * horizontal gridlines, an animated left-to-right reveal (a clip-path that
 * grows in width), and an end-point dot per series. Owned source: edit the
 * data, palette, curve, or motion freely.
 */
export function LineChart({
  data = DEFAULT_DATA,
  width = 560,
  height = 360,
}: {
  data?: LineSeries[];
  width?: number;
  height?: number;
}) {
  const c = useBrandColors();
  const allX = useMemo(() => data.flatMap((s) => s.points.map((p) => p.x)), [data]);
  const allY = useMemo(() => data.flatMap((s) => s.points.map((p) => p.y)), [data]);

  // The left margin is sized to the widest tick label the y-axis will render
  // (compact from 10k, so "1.2M" instead of a clipped "1,200,000").
  const tickFont = 12;
  const yTickLabels = scaleLinear({ domain: [0, Math.max(...allY) * 1.1], nice: true }).ticks(5).map(axisNumber);
  const m = { top: 24, right: 24, bottom: 40, left: Math.max(40, Math.ceil(widestWidth(yTickLabels, tickFont)) + 14) };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;

  const x = useMemo(
    () => scaleLinear({ domain: [Math.min(...allX), Math.max(...allX)], range: [0, iw] }),
    [allX, iw],
  );
  const y = useMemo(
    () => scaleLinear({ domain: [0, Math.max(...allY) * 1.1], range: [ih, 0], nice: true }),
    [allY, ih],
  );

  // Integer-x data (periods, years) gets integer ticks; a unique clip id keeps
  // several charts on screen (overview grid) from sharing one reveal clip.
  const allInt = allX.every(Number.isInteger);
  const xTickValues = allInt ? x.ticks(Math.min(7, new Set(allX).size)).filter(Number.isInteger) : undefined;
  // useId's colons are stripped: they are illegal inside an unquoted url(#...).
  const clipId = `line-reveal-clip-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;

  return (
    <svg width={width} height={height} role="img" aria-label="Multi-series line chart of weekly trends">
      <defs>
        <clipPath id={clipId}>
          <motion.rect
            x={0}
            y={0}
            height={ih}
            initial={{ width: 0 }}
            animate={{ width: iw }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
          />
        </clipPath>
      </defs>
      <Group left={m.left} top={m.top}>
        <GridRows scale={y} width={iw} numTicks={5} stroke={c.border} strokeOpacity={0.15} />
        <AxisLeft
          scale={y}
          numTicks={5}
          hideAxisLine
          tickStroke={c.muted}
          tickLength={4}
          tickFormat={(v) => axisNumber(Number(v))}
          tickLabelProps={() => ({
            fill: c.muted,
            fontFamily: "var(--brand-font-mono)",
            fontSize: tickFont,
            textAnchor: "end",
            dx: -4,
            dy: 4,
          })}
        />
        <AxisBottom
          top={ih}
          scale={x}
          numTicks={7}
          tickValues={xTickValues}
          stroke={c.border}
          tickStroke={c.muted}
          tickFormat={(v) => pointNumber(Number(v))}
          tickLabelProps={() => ({
            fill: c.muted,
            fontFamily: "var(--brand-font-body)",
            fontSize: 12,
            textAnchor: "middle",
            dy: 4,
          })}
        />
        <g clipPath={`url(#${clipId})`}>
          {data.map((s, i) => {
            const color = c.viz[i % c.viz.length] ?? c.primary;
            return (
              <LinePath
                key={s.label}
                data={s.points}
                x={(p) => x(p.x)}
                y={(p) => y(p.y)}
                curve={curveMonotoneX}
                stroke={color}
                strokeWidth={2.5}
                strokeLinecap="round"
                fill="none"
              />
            );
          })}
        </g>
        {data.map((s, i) => {
          const color = c.viz[i % c.viz.length] ?? c.primary;
          const last = s.points[s.points.length - 1];
          if (!last) return null;
          return (
            <motion.circle
              key={s.label}
              cx={x(last.x)}
              cy={y(last.y)}
              r={4.5}
              fill={color}
              stroke={c.surface}
              strokeWidth={2}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.0 + i * 0.08, type: "spring", stiffness: 200, damping: 14 }}
              style={{ filter: `drop-shadow(0 0 8px ${color}80)` }}
            />
          );
        })}
      </Group>
    </svg>
  );
}
