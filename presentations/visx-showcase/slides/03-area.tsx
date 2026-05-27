import { ChartSlide } from "../ui";
import { GradientArea } from "../charts/GradientArea";

export const notes = (
  <div>
    <p>The <strong>trajectory</strong> chart. The line draws left-to-right via an animated SVG clip — your eye follows the story.</p>
    <ul>
      <li>visx <code>AreaClosed</code> + <code>LinePath</code> with a <code>LinearGradient</code> fill.</li>
      <li>Talk to the <strong>inflection</strong> mid-chart, then land on the glowing endpoint.</li>
    </ul>
  </div>
);

export default function Area() {
  return (
    <ChartSlide
      kicker="Trajectory"
      title="Two years, one line."
      caption="Daily close, animated as a left-to-right reveal so attention tracks the narrative."
    >
      <GradientArea width={600} height={440} />
    </ChartSlide>
  );
}
