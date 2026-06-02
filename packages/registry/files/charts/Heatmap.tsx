/** Heatmap — scaffolded via `liebstoeckel add heatmap`. Owned source: edit data, palette, motion freely. */
import { useMemo } from "react";
import { motion } from "motion/react";
import { HeatmapRect } from "@visx/heatmap";
import { scaleLinear } from "@visx/scale";
import { Group } from "@visx/group";
import { useBrandColors } from "./useBrandColors";

export interface HeatmapDatum {
  /** Column label (weekday). */
  day: string;
  /** One value per hour-block row, low → high. */
  values: number[];
}

/** Row labels, one per entry in each `HeatmapDatum.values`. */
const HOUR_BLOCKS = ["00–06", "06–12", "12–18", "18–24", "Late"];

const DEFAULT_DATA: HeatmapDatum[] = [
  { day: "Mon", values: [4, 18, 32, 27, 9] },
  { day: "Tue", values: [6, 22, 41, 30, 12] },
  { day: "Wed", values: [3, 26, 48, 36, 14] },
  { day: "Thu", values: [7, 24, 44, 39, 18] },
  { day: "Fri", values: [9, 30, 52, 47, 28] },
  { day: "Sat", values: [12, 16, 24, 41, 38] },
  { day: "Sun", values: [10, 12, 19, 33, 31] },
];

/** A single cell in the visx "bins" shape. */
type Bin = { bin: number; count: number };
/** A column of cells in the visx "bins" shape. */
type Bins = { bin: number; bins: Bin[] };

/**
 * Heatmap — a rectangular activity heatmap (weekday × hour-block).
 *
 * Cells are colored from the brand `accent` at an opacity scaled to their value
 * (faint = quiet, full = busy), and fade/scale in on a diagonal stagger. Axis
 * labels are plain SVG text. Owned source: edit the data, palette, or motion freely.
 */
export function Heatmap({
  data = DEFAULT_DATA,
  width = 560,
  height = 360,
}: {
  data?: HeatmapDatum[];
  width?: number;
  height?: number;
}) {
  const c = useBrandColors();
  const m = { top: 24, right: 20, bottom: 36, left: 56 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;

  const rows = HOUR_BLOCKS.length;
  const cols = data.length;
  const gap = 2;

  // visx "bins" shape: one entry per column, each holding one cell per row.
  const bins = useMemo<Bins[]>(
    () =>
      data.map((d, ci) => ({
        bin: ci,
        bins: d.values.map((count, ri) => ({ bin: ri, count })),
      })),
    [data],
  );

  const maxValue = useMemo(
    () => Math.max(1, ...data.flatMap((d) => d.values)),
    [data],
  );

  const binWidth = iw / cols;
  const binHeight = ih / rows;

  const xScale = useMemo(
    () => scaleLinear<number>({ domain: [0, cols], range: [0, iw] }),
    [cols, iw],
  );
  const yScale = useMemo(
    () => scaleLinear<number>({ domain: [0, rows], range: [0, ih] }),
    [rows, ih],
  );
  const colorScale = useMemo(
    () => scaleLinear<string>({ domain: [0, maxValue], range: [c.accent, c.accent] }),
    [maxValue, c.accent],
  );
  const opacityScale = useMemo(
    () => scaleLinear<number>({ domain: [0, maxValue], range: [0.08, 1] }),
    [maxValue],
  );

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`Activity heatmap across ${cols} days and ${rows} hour blocks`}
    >
      <Group left={m.left} top={m.top}>
        <HeatmapRect
          data={bins}
          xScale={(v) => xScale(v) ?? 0}
          yScale={(v) => yScale(v) ?? 0}
          colorScale={colorScale}
          opacityScale={opacityScale}
          binWidth={binWidth}
          binHeight={binHeight}
          gap={gap}
        >
          {(heatmap) =>
            heatmap.map((columns) =>
              columns.map((bin) => {
                const cx = (bin.x ?? 0) + gap / 2;
                const cy = (bin.y ?? 0) + gap / 2;
                const w = Math.max(0, bin.width - gap);
                const h = Math.max(0, bin.height - gap);
                const fill = bin.color ?? c.accent;
                return (
                  <motion.rect
                    key={`cell-${bin.column}-${bin.row}`}
                    x={cx}
                    y={cy}
                    width={w}
                    height={h}
                    rx={4}
                    fill={fill}
                    style={{ transformOrigin: `${cx + w / 2}px ${cy + h / 2}px` }}
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{ opacity: bin.opacity ?? 1, scale: 1 }}
                    transition={{
                      delay: (bin.column + bin.row) * 0.05,
                      type: "spring",
                      stiffness: 160,
                      damping: 20,
                    }}
                  />
                );
              }),
            )
          }
        </HeatmapRect>

        {/* X axis: weekday labels */}
        {data.map((d, ci) => (
          <text
            key={`x-${d.day}`}
            x={binWidth * ci + binWidth / 2}
            y={ih + 22}
            textAnchor="middle"
            fill={c.muted}
            fontFamily="var(--brand-font-body)"
            fontSize={12}
          >
            {d.day}
          </text>
        ))}

        {/* Y axis: hour-block labels */}
        {HOUR_BLOCKS.map((label, ri) => (
          <text
            key={`y-${label}`}
            x={-10}
            y={binHeight * ri + binHeight / 2}
            textAnchor="end"
            dy={4}
            fill={c.muted}
            fontFamily="var(--brand-font-mono)"
            fontSize={11}
          >
            {label}
          </text>
        ))}
      </Group>
    </svg>
  );
}
