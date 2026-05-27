import { useMemo } from "react";
import { motion } from "motion/react";
import { scaleLinear } from "@visx/scale";
import { Group } from "@visx/group";
import { AxisX, AxisY } from "./Axes";
import { useBrandColors } from "./useBrandColors";

// deterministic pseudo-random clusters
function points(seed: number, n: number, cx: number, cy: number, spread: number) {
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  return Array.from({ length: n }, () => ({
    x: cx + (rnd() - 0.5) * spread,
    y: cy + (rnd() - 0.5) * spread,
    r: 4 + rnd() * 12,
  }));
}

export function Scatter({ width = 820, height = 440 }: { width?: number; height?: number }) {
  const c = useBrandColors();
  const m = { top: 16, right: 20, bottom: 40, left: 48 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;

  const groups = useMemo(
    () => [
      { color: c.accent, pts: points(7, 26, 32, 70, 36) },
      { color: c.primary, pts: points(42, 26, 64, 42, 40) },
      { color: c.accent2, pts: points(99, 18, 78, 76, 30) },
    ],
    [c.accent, c.primary, c.accent2],
  );

  const x = scaleLinear({ domain: [0, 100], range: [0, iw] });
  const y = scaleLinear({ domain: [0, 100], range: [ih, 0] });

  return (
    <svg width={width} height={height}>
      <Group left={m.left} top={m.top}>
        {groups.map((g, gi) =>
          g.pts.map((p, i) => (
            <motion.circle
              key={`${gi}-${i}`}
              cx={x(p.x)}
              cy={y(p.y)}
              r={p.r}
              fill={g.color}
              fillOpacity={0.55}
              stroke={g.color}
              strokeOpacity={0.9}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 + (gi * 26 + i) * 0.012, type: "spring", stiffness: 260, damping: 20 }}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            />
          )),
        )}
        <AxisY scale={y} ticks={5} fmt={(v) => `${v}`} />
        <AxisX scale={x} y={ih} width={iw} ticks={6} color={c.border} fmt={(v) => `${v}`} />
      </Group>
    </svg>
  );
}
