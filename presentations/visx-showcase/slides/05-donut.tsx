import { ChartSlide, Legend } from "../ui";
import { Donut, donutData } from "../charts/Donut";
import { useBrandColors } from "../charts/useBrandColors";

export const notes = (
  <div>
    <p>Audience composition. The donut <strong>rotates and fades in</strong>; arcs reveal in sequence.</p>
    <ul>
      <li>visx <code>Pie</code> with <code>cornerRadius</code> + <code>padAngle</code> for a soft, modern look.</li>
      <li>Legend on the left mirrors the <strong>brand viz palette</strong> from the theme tokens.</li>
    </ul>
  </div>
);

export default function DonutSlide() {
  const c = useBrandColors();
  return (
    <ChartSlide
      kicker="Composition"
      title="Who's in the room."
      caption="Visitor segments as a share of the whole."
      aside={
        <Legend
          items={donutData.map((d, i) => ({
            label: d.label,
            color: c.viz[i % c.viz.length],
            value: `${d.value}%`,
          }))}
        />
      }
    >
      <Donut size={440} />
    </ChartSlide>
  );
}
