/** RadarChart — scaffolded via `liebstoeckel add radar-chart`. Owned source: edit data, palette, motion freely. */
import { useMemo } from "react";
import { motion } from "motion/react";
import { scaleLinear } from "@visx/scale";
import { Group } from "@visx/group";
import { useBrandColors } from "./useBrandColors";

export interface RadarDatum {
  axis: string;
  value: number;
}

export interface RadarSeries {
  name: string;
  data: RadarDatum[];
}

const DEFAULT_DATA: RadarSeries[] = [
  {
    name: "This release",
    data: [
      { axis: "Speed", value: 82 },
      { axis: "Reliability", value: 90 },
      { axis: "Cost", value: 58 },
      { axis: "DX", value: 74 },
      { axis: "Coverage", value: 67 },
      { axis: "Security", value: 88 },
    ],
  },
  {
    name: "Baseline",
    data: [
      { axis: "Speed", value: 60 },
      { axis: "Reliability", value: 70 },
      { axis: "Cost", value: 80 },
      { axis: "DX", value: 52 },
      { axis: "Coverage", value: 45 },
      { axis: "Security", value: 64 },
    ],
  },
];

const LEVELS = 4;
const MAX = 100;

/**
 * RadarChart — a radar/spider chart. Each axis is spaced evenly around the
 * circle; concentric polygon gridlines + radial spokes form the grid, and each
 * series is a polygon that scales in from the center. Supports 1–2 series.
 * Colors come from the brand palette. Owned source — edit freely.
 */
export function RadarChart({
  data = DEFAULT_DATA,
  width = 440,
  height = 440,
}: {
  data?: RadarSeries[];
  width?: number;
  height?: number;
}) {
  const c = useBrandColors();

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 56;

  const series = data.slice(0, 2);
  const axes = series[0]?.data.map((d) => d.axis) ?? [];
  const N = axes.length;

  const r = useMemo(
    () => scaleLinear<number>({ domain: [0, MAX], range: [0, radius] }),
    [radius],
  );

  const angleOf = (i: number) => (i / N) * 2 * Math.PI - Math.PI / 2;
  const pointAt = (i: number, value: number): [number, number] => {
    const a = angleOf(i);
    const rad = r(value);
    return [Math.cos(a) * rad, Math.sin(a) * rad];
  };

  const gridPolygon = (level: number) =>
    axes
      .map((_, i) => {
        const [x, y] = pointAt(i, (MAX / LEVELS) * level);
        return `${x},${y}`;
      })
      .join(" ");

  const seriesColor = (i: number) =>
    i === 0 ? c.primary : c.accent;

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`Radar chart comparing ${series.length} series across ${N} axes: ${axes.join(", ")}`}
    >
      <Group top={cy} left={cx}>
        {/* concentric polygon gridlines */}
        {Array.from({ length: LEVELS }, (_, l) => (
          <polygon
            key={`grid-${l}`}
            points={gridPolygon(l + 1)}
            fill="none"
            stroke={c.border}
            strokeWidth={1}
          />
        ))}

        {/* radial spokes + axis labels */}
        {axes.map((axis, i) => {
          const [ex, ey] = pointAt(i, MAX);
          const [lx, ly] = pointAt(i, MAX + 16);
          const anchor =
            Math.abs(lx) < 1 ? "middle" : lx > 0 ? "start" : "end";
          return (
            <g key={`axis-${axis}`}>
              <line
                x1={0}
                y1={0}
                x2={ex}
                y2={ey}
                stroke={c.border}
                strokeWidth={1}
              />
              <text
                x={lx}
                y={ly}
                textAnchor={anchor}
                dominantBaseline="middle"
                fill={c.muted}
                fontFamily="var(--brand-font-body)"
                fontSize={12}
              >
                {axis}
              </text>
            </g>
          );
        })}

        {/* data polygons */}
        {series.map((s, si) => {
          const color = seriesColor(si);
          const points = s.data
            .map((d, i) => {
              const [x, y] = pointAt(i, d.value);
              return `${x},${y}`;
            })
            .join(" ");
          return (
            <motion.g
              key={`series-${s.name}`}
              style={{ transformOrigin: "0px 0px" }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                delay: si * 0.18,
                type: "spring",
                stiffness: 120,
                damping: 16,
              }}
            >
              <polygon
                points={points}
                fill={color}
                fillOpacity={si === 0 ? 0.32 : 0.2}
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                style={{ filter: `drop-shadow(0 4px 16px ${color}33)` }}
              />
              {s.data.map((d, i) => {
                const [x, y] = pointAt(i, d.value);
                return (
                  <circle
                    key={`dot-${s.name}-${d.axis}`}
                    cx={x}
                    cy={y}
                    r={3.5}
                    fill={color}
                    stroke={c.surface}
                    strokeWidth={1.5}
                  />
                );
              })}
            </motion.g>
          );
        })}
      </Group>

      {/* legend */}
      <Group top={18} left={16}>
        {series.map((s, si) => (
          <motion.g
            key={`legend-${s.name}`}
            transform={`translate(0, ${si * 22})`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 + si * 0.1 }}
          >
            <rect width={11} height={11} rx={3} y={-9} fill={seriesColor(si)} />
            <text
              x={18}
              y={1}
              fill={c.text}
              fontFamily="var(--brand-font-body)"
              fontSize={13}
            >
              {s.name}
            </text>
          </motion.g>
        ))}
      </Group>
    </svg>
  );
}
