import { motion } from "motion/react";
import { Pie } from "@visx/shape";
import { Group } from "@visx/group";
import { useBrandColors } from "./useBrandColors";

export const donutData = [
  { label: "Returning", value: 46 },
  { label: "New", value: 28 },
  { label: "Organic", value: 14 },
  { label: "Paid", value: 8 },
  { label: "Other", value: 4 },
];
const total = donutData.reduce((s, d) => s + d.value, 0);

export function Donut({ size = 420 }: { size?: number }) {
  const c = useBrandColors();
  const r = size / 2;
  const color = (i: number) => c.viz[i % c.viz.length];

  return (
    <svg width={size} height={size}>
      <motion.g
        initial={{ rotate: -14, scale: 0.82, opacity: 0 }}
        animate={{ rotate: 0, scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 90, damping: 16 }}
        style={{ transformOrigin: "center" }}
      >
        <Group top={r} left={r}>
          <Pie data={donutData} pieValue={(d) => d.value} outerRadius={r - 4} innerRadius={r * 0.62} padAngle={0.018} cornerRadius={5}>
            {(pie) =>
              pie.arcs.map((arc, i) => (
                <motion.path
                  key={arc.data.label}
                  d={pie.path(arc) || ""}
                  fill={color(i)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.25 + i * 0.1 }}
                  style={{ filter: `drop-shadow(0 4px 16px ${color(i)}30)` }}
                />
              ))
            }
          </Pie>
        </Group>
      </motion.g>
      {/* center metric */}
      <motion.text
        x={r}
        y={r - 6}
        textAnchor="middle"
        fill={c.text}
        fontFamily="var(--brand-font-heading)"
        fontWeight={600}
        fontSize={52}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        {total}%
      </motion.text>
      <text x={r} y={r + 24} textAnchor="middle" fill={c.muted} fontFamily="var(--brand-font-mono)" fontSize={13} letterSpacing={2}>
        TRACKED
      </text>
    </svg>
  );
}
