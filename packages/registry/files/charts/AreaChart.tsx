import { useId, useMemo } from "react";
import { motion } from "motion/react";
import { scaleLinear } from "@visx/scale";
import { Group } from "@visx/group";
import { AreaClosed, LinePath } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";
import { LinearGradient } from "@visx/gradient";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { useBrandColors } from "./useBrandColors";
import { axisNumber, pointNumber, widestWidth } from "./chartText";

export interface AreaPoint {
  x: number;
  y: number;
}

const DEFAULT_DATA: AreaPoint[] = [
  { x: 0, y: 120 },
  { x: 1, y: 145 },
  { x: 2, y: 138 },
  { x: 3, y: 172 },
  { x: 4, y: 196 },
  { x: 5, y: 188 },
  { x: 6, y: 224 },
  { x: 7, y: 251 },
  { x: 8, y: 243 },
  { x: 9, y: 288 },
];

/**
 * AreaChart — scaffolded via `liebstoeckel add area-chart`.
 *
 * Single-series gradient area with a crisp top line, x + y axes, faint
 * gridlines, and an animated left-to-right clip-path reveal. The fill is a
 * LinearGradient from the brand primary fading to transparent. Owned source:
 * edit the data, palette, curve, or motion freely.
 */
export function AreaChart({
  data = DEFAULT_DATA,
  width = 560,
  height = 360,
}: {
  data?: AreaPoint[];
  width?: number;
  height?: number;
}) {
  const c = useBrandColors();

  // The left margin is sized to the widest tick label the y-axis will render
  // (compact from 10k, so "1.2M" instead of a clipped "1,200,000").
  const tickFont = 12;
  const yTickLabels = scaleLinear({ domain: [0, Math.max(...data.map((d) => d.y)) * 1.1], nice: true })
    .ticks(5)
    .map(axisNumber);
  const m = { top: 24, right: 24, bottom: 40, left: Math.max(44, Math.ceil(widestWidth(yTickLabels, tickFont)) + 14) };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;

  const x = useMemo(
    () =>
      scaleLinear({
        domain: [Math.min(...data.map((d) => d.x)), Math.max(...data.map((d) => d.x))],
        range: [0, iw],
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

  // Integer-x data (periods, years) gets integer ticks; unique ids keep several
  // charts on screen (overview grid) from sharing one gradient/clip.
  const allInt = data.every((d) => Number.isInteger(d.x));
  const xTickValues = allInt ? x.ticks(Math.min(8, new Set(data.map((d) => d.x)).size)).filter(Number.isInteger) : undefined;
  // useId's colons are stripped: they are illegal inside an unquoted url(#...).
  const uid = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const gradientId = `area-fill-gradient-${uid}`;
  const clipId = `area-reveal-clip-${uid}`;

  return (
    <svg width={width} height={height} role="img" aria-label="Area chart of a single trend over time">
      <defs>
        <clipPath id={clipId}>
          <motion.rect
            x={0}
            y={0}
            height={ih}
            initial={{ width: 0 }}
            animate={{ width: iw }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
          />
        </clipPath>
      </defs>
      <LinearGradient
        id={gradientId}
        from={c.primary}
        to={c.primary}
        fromOpacity={0.45}
        toOpacity={0}
        vertical
      />
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
          numTicks={8}
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
          <AreaClosed
            data={data}
            x={(d) => x(d.x)}
            y={(d) => y(d.y)}
            yScale={y}
            curve={curveMonotoneX}
            fill={`url(#${gradientId})`}
          />
          <LinePath
            data={data}
            x={(d) => x(d.x)}
            y={(d) => y(d.y)}
            curve={curveMonotoneX}
            stroke={c.primary}
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
          />
        </g>
        {(() => {
          const last = data[data.length - 1];
          if (!last) return null;
          return (
            <motion.circle
              cx={x(last.x)}
              cy={y(last.y)}
              r={4.5}
              fill={c.primary}
              stroke={c.surface}
              strokeWidth={2}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.1, type: "spring", stiffness: 200, damping: 14 }}
              style={{ filter: `drop-shadow(0 0 8px ${c.primary}80)` }}
            />
          );
        })()}
      </Group>
    </svg>
  );
}
