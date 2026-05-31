import { useMemo } from "react";
import { motion } from "motion/react";
import { scaleBand, scaleLinear, scaleOrdinal } from "@visx/scale";
import { Group } from "@visx/group";
import { BarGroup } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { useBrandColors } from "./useBrandColors";

/**
 * GroupedBarChart — scaffolded via `liebstoeckel add grouped-bar-chart`.
 *
 * Multiple series rendered side-by-side within each category: an outer band
 * scale positions the groups, an inner band scale lays out the bars inside
 * each group, x + y axes, faint horizontal gridlines, an SVG legend, and an
 * animated rise-in where each bar grows up from the baseline, staggered by
 * group then series. Owned source: edit the data, keys, palette, or motion
 * freely.
 */
export interface GroupedDatum {
  label: string;
  [series: string]: number | string;
}

export const DEFAULT_KEYS = ["2023", "2024", "2025"] as const;

const DEFAULT_DATA: GroupedDatum[] = [
  { label: "EMEA", "2023": 34, "2024": 48, "2025": 61 },
  { label: "AMER", "2023": 52, "2024": 57, "2025": 72 },
  { label: "APAC", "2023": 21, "2024": 33, "2025": 49 },
  { label: "LATAM", "2023": 14, "2024": 22, "2025": 36 },
];

export function GroupedBarChart({
  data = DEFAULT_DATA,
  keys = DEFAULT_KEYS as unknown as string[],
  width = 560,
  height = 360,
}: {
  data?: GroupedDatum[];
  keys?: string[];
  width?: number;
  height?: number;
}) {
  const c = useBrandColors();
  const m = { top: 36, right: 24, bottom: 40, left: 44 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;

  const color = useMemo(
    () => scaleOrdinal<string, string>({ domain: keys, range: c.viz }),
    [keys, c.viz],
  );

  const maxY = useMemo(
    () => Math.max(1, ...data.flatMap((d) => keys.map((k) => Number(d[k] ?? 0)))),
    [data, keys],
  );

  const x0 = useMemo(
    () =>
      scaleBand<string>({
        domain: data.map((d) => d.label),
        range: [0, iw],
        padding: 0.28,
      }),
    [data, iw],
  );
  const x1 = useMemo(
    () =>
      scaleBand<string>({
        domain: keys,
        range: [0, x0.bandwidth()],
        padding: 0.18,
      }),
    [keys, x0],
  );
  const y = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, maxY * 1.1],
        range: [ih, 0],
        nice: true,
      }),
    [maxY, ih],
  );

  const swatch = 11;
  const gap = 14;

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`Grouped bar chart comparing ${keys.join(", ")} across ${data.length} categories`}
    >
      <Group left={m.left} top={m.top}>
        <GridRows scale={y} width={iw} numTicks={5} stroke={c.border} strokeOpacity={0.15} />
        <AxisLeft
          scale={y}
          numTicks={5}
          hideAxisLine
          tickStroke={c.muted}
          tickLength={4}
          tickLabelProps={() => ({
            fill: c.muted,
            fontFamily: "var(--brand-font-mono)",
            fontSize: 12,
            textAnchor: "end",
            dx: -4,
            dy: 4,
          })}
        />
        <AxisBottom
          top={ih}
          scale={x0}
          stroke={c.border}
          tickStroke={c.muted}
          tickLabelProps={() => ({
            fill: c.muted,
            fontFamily: "var(--brand-font-body)",
            fontSize: 12,
            textAnchor: "middle",
            dy: 4,
          })}
        />
        <BarGroup<GroupedDatum, string>
          data={data}
          keys={keys}
          height={ih}
          x0={(d) => d.label}
          x0Scale={x0}
          x1Scale={x1}
          yScale={y}
          color={color}
        >
          {(groups) =>
            groups.map((group, gi) => (
              <Group key={`group-${group.index}`} left={group.x0}>
                {group.bars.map((bar, bi) => (
                  <motion.rect
                    key={`${group.index}-${bar.key}`}
                    x={bar.x}
                    width={bar.width}
                    fill={bar.color}
                    rx={2}
                    initial={{ y: ih, height: 0 }}
                    animate={{ y: bar.y, height: bar.height }}
                    transition={{
                      duration: 0.6,
                      ease: [0.22, 1, 0.36, 1],
                      delay: gi * 0.1 + bi * 0.05,
                    }}
                  />
                ))}
              </Group>
            ))
          }
        </BarGroup>
      </Group>
      <Group left={m.left} top={20}>
        {keys.map((k, i) => {
          const prev = keys.slice(0, i).reduce((w, kk) => w + kk.length * 7.2 + swatch + gap + 8, 0);
          return (
            <Group key={k} left={prev}>
              <rect width={swatch} height={swatch} rx={2} y={-swatch + 2} fill={color(k)} />
              <text
                x={swatch + 6}
                y={3}
                fill={c.muted}
                fontFamily="var(--brand-font-body)"
                fontSize={12}
              >
                {k}
              </text>
            </Group>
          );
        })}
      </Group>
    </svg>
  );
}
