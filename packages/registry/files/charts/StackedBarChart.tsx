import { useMemo } from "react";
import { motion } from "motion/react";
import { scaleBand, scaleLinear, scaleOrdinal } from "@visx/scale";
import { Group } from "@visx/group";
import { BarStack } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { useBrandColors } from "./useBrandColors";

/**
 * StackedBarChart — scaffolded via `liebstoeckel add stacked-bar-chart`.
 *
 * Multiple series stacked into a single vertical bar per category: x + y axes,
 * faint horizontal gridlines, an SVG legend (swatch + series name), and an
 * animated rise-in where each stacked segment grows up from the baseline,
 * staggered by category then series. Owned source: edit the data, keys,
 * palette, or motion freely.
 */
export interface StackedDatum {
  label: string;
  [series: string]: number | string;
}

export const DEFAULT_KEYS = ["Direct", "Affiliate", "Social"] as const;

const DEFAULT_DATA: StackedDatum[] = [
  { label: "Q1", Direct: 42, Affiliate: 24, Social: 18 },
  { label: "Q2", Direct: 51, Affiliate: 28, Social: 26 },
  { label: "Q3", Direct: 48, Affiliate: 35, Social: 31 },
  { label: "Q4", Direct: 63, Affiliate: 41, Social: 38 },
];

export function StackedBarChart({
  data = DEFAULT_DATA,
  keys = DEFAULT_KEYS as unknown as string[],
  width = 560,
  height = 360,
}: {
  data?: StackedDatum[];
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

  const totals = useMemo(
    () => data.map((d) => keys.reduce((sum, k) => sum + Number(d[k] ?? 0), 0)),
    [data, keys],
  );

  const x = useMemo(
    () =>
      scaleBand<string>({
        domain: data.map((d) => d.label),
        range: [0, iw],
        padding: 0.32,
      }),
    [data, iw],
  );
  const y = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, Math.max(1, ...totals) * 1.1],
        range: [ih, 0],
        nice: true,
      }),
    [totals, ih],
  );

  const swatch = 11;
  const gap = 14;

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`Stacked bar chart of ${keys.join(", ")} across ${data.length} categories`}
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
          scale={x}
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
        <BarStack<StackedDatum, string>
          data={data}
          keys={keys}
          x={(d) => d.label}
          xScale={x}
          yScale={y}
          color={color}
        >
          {(stacks) =>
            stacks.map((stack, si) =>
              stack.bars.map((bar) => (
                <motion.rect
                  key={`${stack.key}-${bar.index}`}
                  x={bar.x}
                  width={bar.width}
                  fill={bar.color}
                  rx={2}
                  initial={{ y: ih, height: 0 }}
                  animate={{ y: bar.y, height: bar.height }}
                  transition={{
                    duration: 0.6,
                    ease: [0.22, 1, 0.36, 1],
                    delay: bar.index * 0.09 + si * 0.06,
                  }}
                />
              )),
            )
          }
        </BarStack>
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
