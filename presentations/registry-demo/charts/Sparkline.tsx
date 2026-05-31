import { useMemo } from "react";
import { motion } from "motion/react";
import { scaleLinear } from "@visx/scale";
import { Group } from "@visx/group";
import { AreaClosed, LinePath } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";
import { LinearGradient } from "@visx/gradient";
import { useBrandColors } from "./useBrandColors";

const DEFAULT_DATA: number[] = [12, 14, 11, 18, 16, 22, 19, 27, 24, 31, 29, 38];

/**
 * Sparkline — scaffolded via `liebstoeckel add sparkline`.
 *
 * A tiny inline area + line with no axes or labels and an animated
 * left-to-right draw-in. Pass a unique `id` per instance so the gradient and
 * clip ids don't collide on a slide with several sparklines. Owned source:
 * edit the data, color, or motion freely.
 */
export function Sparkline({
  data = DEFAULT_DATA,
  id,
  color,
  width = 280,
  height = 80,
}: {
  data?: number[];
  id: string;
  color?: string;
  width?: number;
  height?: number;
}) {
  const c = useBrandColors();
  const stroke = color ?? c.accent;
  const m = { top: 6, right: 4, bottom: 6, left: 4 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;

  const x = useMemo(
    () => scaleLinear({ domain: [0, Math.max(data.length - 1, 1)], range: [0, iw] }),
    [data, iw],
  );
  const y = useMemo(
    () =>
      scaleLinear({
        domain: [Math.min(...data), Math.max(...data)],
        range: [ih, 0],
      }),
    [data, ih],
  );

  const gradientId = `sparkline-fill-${id}`;
  const clipId = `sparkline-clip-${id}`;

  return (
    <svg width={width} height={height} role="img" aria-label="Sparkline trend">
      <defs>
        <clipPath id={clipId}>
          <motion.rect
            x={0}
            y={0}
            height={height}
            initial={{ width: 0 }}
            animate={{ width }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
          />
        </clipPath>
      </defs>
      <LinearGradient id={gradientId} from={stroke} to={stroke} fromOpacity={0.4} toOpacity={0} vertical />
      <Group left={m.left} top={m.top} clipPath={`url(#${clipId})`}>
        <AreaClosed
          data={data}
          x={(_, i) => x(i)}
          y={(d) => y(d)}
          yScale={y}
          curve={curveMonotoneX}
          fill={`url(#${gradientId})`}
        />
        <LinePath
          data={data}
          x={(_, i) => x(i)}
          y={(d) => y(d)}
          curve={curveMonotoneX}
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
      </Group>
      {(() => {
        const lastVal = data[data.length - 1];
        if (lastVal === undefined) return null;
        return (
          <motion.circle
            cx={m.left + x(data.length - 1)}
            cy={m.top + y(lastVal)}
            r={3}
            fill={stroke}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.85, type: "spring", stiffness: 220, damping: 14 }}
            style={{ filter: `drop-shadow(0 0 6px ${stroke}80)` }}
          />
        );
      })()}
    </svg>
  );
}
