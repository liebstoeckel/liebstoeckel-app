import { ChartSlide } from "../ui";
import { Bars } from "../charts/Bars";

export const notes = (
  <div>
    <p>Acquisition mix. Bars <strong>spring up</strong> in sequence — the stagger keeps the reveal lively.</p>
    <ul>
      <li>visx <code>scaleBand</code> + <code>scaleLinear</code>; each bar is a Motion <code>rect</code>.</li>
      <li>Point out <strong>Direct</strong> leading — tie back to the brand campaign.</li>
    </ul>
  </div>
);

export default function BarsSlide() {
  return (
    <ChartSlide
      kicker="Acquisition"
      title="Where they come from."
      caption="Sessions by channel this quarter. Bars animate in with spring physics for a confident reveal."
    >
      <Bars width={600} height={440} />
    </ChartSlide>
  );
}
