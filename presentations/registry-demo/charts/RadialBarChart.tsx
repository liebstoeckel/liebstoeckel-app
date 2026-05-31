/** RadialBarChart — scaffolded via `liebstoeckel add radial-bar-chart`. Owned source: edit data, palette, motion freely. */
import { useMemo } from "react";
import { motion } from "motion/react";
import { scaleBand, scaleRadial } from "@visx/scale";
import { Group } from "@visx/group";
import { Arc } from "@visx/shape";
import { useBrandColors } from "./useBrandColors";

export interface RadialBarDatum {
  label: string;
  value: number;
}

const DEFAULT_DATA: RadialBarDatum[] = [
  { label: "Mon", value: 68 },
  { label: "Tue", value: 92 },
  { label: "Wed", value: 54 },
  { label: "Thu", value: 81 },
  { label: "Fri", value: 100 },
  { label: "Sat", value: 37 },
  { label: "Sun", value: 23 },
];

/**
 * RadialBarChart — bars arranged radially around a circle. `scaleBand` lays the
 * categories out angularly, `scaleRadial` maps value → outer radius, and each
 * `Arc` grows out from the inner radius, staggered by index. Labels are rotated
 * to follow the ring. Colors come from the brand viz palette. Owned source.
 */
export function RadialBarChart({
  data = DEFAULT_DATA,
  width = 440,
  height = 440,
}: {
  data?: RadialBarDatum[];
  width?: number;
  height?: number;
}) {
  const c = useBrandColors();

  const cx = width / 2;
  const cy = height / 2;
  const outer = Math.min(width, height) / 2 - 44;
  const inner = outer * 0.32;

  const maxValue = useMemo(
    () => Math.max(...data.map((d) => d.value), 1),
    [data],
  );

  const angle = useMemo(
    () =>
      scaleBand<string>({
        domain: data.map((d) => d.label),
        range: [0, 2 * Math.PI],
        padding: 0.18,
      }),
    [data],
  );

  const radius = useMemo(
    () =>
      scaleRadial<number>({
        domain: [0, maxValue],
        range: [inner, outer],
      }),
    [maxValue, inner, outer],
  );

  // Days are an ordered measure, not distinct categories — color sequentially by
  // value (one brand hue, opacity scaled) rather than the 6-color categorical
  // palette, which would repeat once across 7+ items.
  const barOpacity = (v: number) => 0.45 + 0.55 * (v / maxValue);
  const bandwidth = angle.bandwidth();

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`Radial bar chart of ${data.length} categories: ${data
        .map((d) => `${d.label} ${d.value}`)
        .join(", ")}`}
    >
      <Group top={cy} left={cx}>
        {/* inner ring guide */}
        <circle r={inner} fill="none" stroke={c.border} strokeWidth={1} />
        <circle r={outer} fill="none" stroke={c.border} strokeWidth={1} />

        {data.map((d, i) => {
          const startAngle = angle(d.label) ?? 0;
          const endAngle = startAngle + bandwidth;
          const fill = c.accent;

          // label placed just outside the bar, rotated to follow the ring
          const mid = startAngle + bandwidth / 2;
          const labelR = outer + 18;
          const deg = (mid * 180) / Math.PI;
          const lx = Math.sin(mid) * labelR;
          const ly = -Math.cos(mid) * labelR;
          const flip = deg > 90 && deg < 270;

          return (
            <g key={`bar-${d.label}`}>
              <motion.g
                style={{ transformOrigin: "0px 0px" }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  delay: i * 0.07,
                  type: "spring",
                  stiffness: 130,
                  damping: 17,
                }}
              >
                <Arc
                  startAngle={startAngle}
                  endAngle={endAngle}
                  innerRadius={inner}
                  outerRadius={radius(d.value)}
                  cornerRadius={3}
                  padAngle={0.02}
                  fill={fill}
                  fillOpacity={barOpacity(d.value)}
                  stroke={c.surface}
                  strokeWidth={1}
                  style={{ filter: `drop-shadow(0 2px 10px ${fill}40)` }}
                />
              </motion.g>

              <motion.text
                transform={`translate(${lx}, ${ly}) rotate(${
                  flip ? deg + 180 : deg
                })`}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={c.muted}
                fontFamily="var(--brand-font-body)"
                fontSize={11}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.07 + 0.2 }}
              >
                {d.label}
              </motion.text>
            </g>
          );
        })}

        {/* center max readout */}
        <text
          textAnchor="middle"
          dy={-2}
          fill={c.text}
          fontFamily="var(--brand-font-mono)"
          fontSize={22}
          fontWeight={600}
        >
          {maxValue}
        </text>
        <text
          textAnchor="middle"
          dy={16}
          fill={c.muted}
          fontFamily="var(--brand-font-body)"
          fontSize={10}
          letterSpacing={1}
        >
          PEAK
        </text>
      </Group>
    </svg>
  );
}
