import { useMemo } from "react";
import { motion } from "motion/react";
import { AreaClosed, LinePath } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";
import { scaleTime, scaleLinear } from "@visx/scale";
import { LinearGradient } from "@visx/gradient";
import { Group } from "@visx/group";
import { AxisX, AxisY, GridY } from "./Axes";
import { useBrandColors } from "./useBrandColors";

const monthFmt = new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" });

type Row = { date: Date; close: number };
const getDate = (d: Row) => d.date;
const getClose = (d: Row) => d.close;

// Deterministic trending series (weekly points) — self-contained, no mock-data dep.
function genSeries(n: number): Row[] {
  let s = 7;
  let v = 58;
  const start = new Date("2023-01-02").getTime();
  const week = 7 * 864e5;
  const out: Row[] = [];
  for (let i = 0; i < n; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    v = Math.max(24, v + (r - 0.44) * 6 + Math.sin(i / 8) * 2.2);
    out.push({ date: new Date(start + i * week), close: Math.round(v * 100) / 100 });
  }
  return out;
}

export function GradientArea({ width = 820, height = 440 }: { width?: number; height?: number }) {
  const c = useBrandColors();
  const data = useMemo(() => genSeries(120), []);
  const m = { top: 24, right: 28, bottom: 36, left: 56 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;

  const x = useMemo(
    () => scaleTime({ domain: [getDate(data[0]), getDate(data[data.length - 1])], range: [0, iw] }),
    [iw, data],
  );
  const y = useMemo(() => {
    const vals = data.map(getClose);
    return scaleLinear({ domain: [Math.min(...vals) * 0.96, Math.max(...vals) * 1.02], range: [ih, 0], nice: true });
  }, [ih, data]);

  const px = (d: Row) => x(getDate(d));
  const py = (d: Row) => y(getClose(d));
  const last = data[data.length - 1];

  return (
    <svg width={width} height={height}>
      <LinearGradient id="ga-fill" from={c.accent} to={c.accent} fromOpacity={0.45} toOpacity={0} />
      <clipPath id="ga-reveal">
        <motion.rect
          x={0}
          y={-m.top}
          height={height}
          initial={{ width: 0 }}
          animate={{ width: iw }}
          transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }}
        />
      </clipPath>

      <Group left={m.left} top={m.top}>
        <GridY scale={y} width={iw} ticks={4} color={c.border} />
        <g clipPath="url(#ga-reveal)">
          <AreaClosed data={data} x={px} y={py} yScale={y} curve={curveMonotoneX} fill="url(#ga-fill)" />
          <LinePath data={data} x={px} y={py} curve={curveMonotoneX} stroke={c.accent} strokeWidth={2.5} />
        </g>

        {/* glowing endpoint */}
        <motion.circle
          cx={px(last)}
          cy={py(last)}
          r={5}
          fill={c.primary}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.25, type: "spring", stiffness: 300, damping: 18 }}
          style={{ filter: `drop-shadow(0 0 8px ${c.primary})` }}
        />

        <AxisY scale={y} ticks={4} fmt={(v) => `$${v}`} />
        <AxisX scale={x} y={ih} width={iw} ticks={5} color={c.border} fmt={(v) => monthFmt.format(v as Date)} />
      </Group>
    </svg>
  );
}
