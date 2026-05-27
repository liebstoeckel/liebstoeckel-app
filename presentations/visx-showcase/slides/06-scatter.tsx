import { ChartSlide } from "../ui";
import { Scatter } from "../charts/Scatter";

export const notes = (
  <div>
    <p>Engagement clusters. Bubbles <strong>pop in</strong> individually — dense but legible.</p>
    <ul>
      <li>visx <code>scaleLinear</code> on both axes; each dot is a Motion <code>circle</code> sized by value.</li>
      <li>Three clusters = three cohorts; note the <strong>cyan</strong> group's tight grouping.</li>
    </ul>
  </div>
);

export default function ScatterSlide() {
  return (
    <ChartSlide
      kicker="Behaviour"
      title="Clusters, not averages."
      caption="Each point is a cohort placed by recency and depth. Size encodes volume."
    >
      <Scatter width={600} height={440} />
    </ChartSlide>
  );
}
