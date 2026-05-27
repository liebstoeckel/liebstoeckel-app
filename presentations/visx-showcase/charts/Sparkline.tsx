import { motion } from "motion/react";
import { AreaClosed, LinePath } from "@visx/shape";
import { curveMonotoneX } from "@visx/curve";
import { scaleLinear } from "@visx/scale";
import { LinearGradient } from "@visx/gradient";
import { useBrandColors } from "./useBrandColors";

export function Sparkline({
  data,
  width = 280,
  height = 80,
  color,
  id,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  id: string;
}) {
  const c = useBrandColors();
  const stroke = color ?? c.primary;
  const x = scaleLinear({ domain: [0, data.length - 1], range: [2, width - 2] });
  const y = scaleLinear({ domain: [Math.min(...data) * 0.9, Math.max(...data) * 1.05], range: [height - 2, 2] });

  return (
    <svg width={width} height={height}>
      <LinearGradient id={`spark-${id}`} from={stroke} to={stroke} fromOpacity={0.35} toOpacity={0} />
      <clipPath id={`spark-clip-${id}`}>
        <motion.rect x={0} y={0} height={height} initial={{ width: 0 }} animate={{ width }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
      </clipPath>
      <g clipPath={`url(#spark-clip-${id})`}>
        <AreaClosed data={data} x={(_, i) => x(i)} y={(d) => y(d)} yScale={y} curve={curveMonotoneX} fill={`url(#spark-${id})`} />
        <LinePath data={data} x={(_, i) => x(i)} y={(d) => y(d)} curve={curveMonotoneX} stroke={stroke} strokeWidth={2} />
      </g>
    </svg>
  );
}
