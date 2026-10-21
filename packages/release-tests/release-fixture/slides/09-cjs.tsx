import ms from "ms";
import { Kicker } from "../components/Kicker";

// `ms` ships only CommonJS (no "module", no "exports"): the build has to wrap it.
export default function Cjs() {
  return (
    <div className="w-full">
      <Kicker>A CommonJS dependency</Kicker>
      <p data-testid="cjs" className="font-mono text-4xl text-text">
        ms("90s") = {ms("90s")}, ms(5400000) = {ms(5400000)}
      </p>
    </div>
  );
}
