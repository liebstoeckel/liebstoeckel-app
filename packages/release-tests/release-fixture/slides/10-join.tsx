import { JoinCard } from "@liebstoeckel/engine";
import { Kicker } from "../components/Kicker";

export default function Join() {
  return (
    <div className="flex w-full items-center gap-12">
      <div>
        <Kicker>Join card</Kicker>
        <h2 className="font-heading text-5xl font-semibold text-text">Scan to join</h2>
      </div>
      <JoinCard />
    </div>
  );
}
