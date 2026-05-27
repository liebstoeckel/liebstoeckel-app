import { useMemo } from "react";
import { motion } from "motion/react";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Group } from "@visx/group";
import { useBrandColors } from "./useBrandColors";

const data = [
  { label: "Direct", value: 84 },
  { label: "Search", value: 67 },
  { label: "Social", value: 52 },
  { label: "Email", value: 38 },
  { label: "Referral", value: 29 },
  { label: "Affiliate", value: 18 },
];

export function Bars({ width = 820, height = 440 }: { width?: number; height?: number }) {
  const c = useBrandColors();
  const m = { top: 16, right: 16, bottom: 44, left: 16 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;

  const x = useMemo(() => scaleBand({ domain: data.map((d) => d.label), range: [0, iw], padding: 0.34 }), [iw]);
  const y = useMemo(() => scaleLinear({ domain: [0, Math.max(...data.map((d) => d.value)) * 1.1], range: [ih, 0] }), [ih]);

  return (
    <svg width={width} height={height}>
      <Group left={m.left} top={m.top}>
        {data.map((d, i) => {
          const bw = x.bandwidth();
          const bx = x(d.label) ?? 0;
          const bh = ih - y(d.value);
          const fill = c.viz[i % c.viz.length];
          return (
            <g key={d.label}>
              <motion.rect
                x={bx}
                width={bw}
                rx={8}
                fill={fill}
                initial={{ height: 0, y: ih }}
                animate={{ height: bh, y: y(d.value) }}
                transition={{ delay: i * 0.08, type: "spring", stiffness: 120, damping: 18 }}
                style={{ filter: `drop-shadow(0 6px 20px ${fill}40)` }}
              />
              <motion.text
                x={bx + bw / 2}
                y={y(d.value) - 12}
                textAnchor="middle"
                fill={c.text}
                fontFamily="var(--brand-font-mono)"
                fontSize={15}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.08 + 0.3 }}
              >
                {d.value}
              </motion.text>
              {/* category label */}
              <text
                x={bx + bw / 2}
                y={ih + 28}
                textAnchor="middle"
                fill={c.muted}
                fontFamily="var(--brand-font-body)"
                fontSize={15}
              >
                {d.label}
              </text>
            </g>
          );
        })}
        <line x1={0} x2={iw} y1={ih} y2={ih} stroke={c.border} strokeOpacity={0.6} />
      </Group>
    </svg>
  );
}
