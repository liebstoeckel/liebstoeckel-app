import { BarChart } from "../charts/BarChart";
import { DonutChart } from "../charts/DonutChart";
import { LineChart } from "../charts/LineChart";
import { Kicker } from "../components/Kicker";

export default function Charts() {
  return (
    <div className="w-full">
      <Kicker>visx charts from liebstoeckel add</Kicker>
      <div className="flex items-end gap-6">
        <BarChart width={360} height={300} />
        <LineChart width={400} height={300} />
        <DonutChart width={300} height={300} />
      </div>
    </div>
  );
}
