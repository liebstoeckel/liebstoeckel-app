// Minimal SVG axes/grid using only the scale (a function with .ticks/.range) and
// native <line>/<text>. Avoids @visx/axis + @visx/text, and gives us full control
// over the mono label styling.
type NumScale = ((v: number | Date) => number) & { ticks?: (n?: number) => (number | Date)[]; domain: () => (number | Date)[] };

const labelStyle = {
  fill: "var(--brand-muted)",
  fontFamily: "var(--brand-font-mono)",
  fontSize: 11,
} as const;

export function GridY({ scale, width, ticks = 4, color }: { scale: NumScale; width: number; ticks?: number; color: string }) {
  const vals = scale.ticks ? scale.ticks(ticks) : [];
  return (
    <g>
      {vals.map((v, i) => (
        <line key={i} x1={0} x2={width} y1={scale(v)} y2={scale(v)} stroke={color} strokeOpacity={0.45} />
      ))}
    </g>
  );
}

export function AxisY({ scale, ticks = 4, fmt }: { scale: NumScale; ticks?: number; fmt: (v: number) => string }) {
  const vals = (scale.ticks ? scale.ticks(ticks) : []) as number[];
  return (
    <g>
      {vals.map((v, i) => (
        <text key={i} x={-12} y={scale(v)} textAnchor="end" dominantBaseline="middle" {...labelStyle}>
          {fmt(v)}
        </text>
      ))}
    </g>
  );
}

export function AxisX({
  scale,
  y,
  width,
  ticks = 5,
  fmt,
  color,
}: {
  scale: NumScale;
  y: number;
  width: number;
  ticks?: number;
  fmt: (v: number | Date) => string;
  color: string;
}) {
  const vals = scale.ticks ? scale.ticks(ticks) : scale.domain();
  return (
    <g transform={`translate(0,${y})`}>
      <line x1={0} x2={width} y1={0} y2={0} stroke={color} strokeOpacity={0.6} />
      {vals.map((v, i) => (
        <text key={i} x={scale(v)} y={22} textAnchor="middle" {...labelStyle}>
          {fmt(v)}
        </text>
      ))}
    </g>
  );
}
