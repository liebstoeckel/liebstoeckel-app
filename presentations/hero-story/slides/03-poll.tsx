import { Text } from "./_Text";
import type { HallProps } from "../elements/HallBackdrop";

export const notes = "Votes fly from the phones to the bars on the big screen.";
export const backdropProps: HallProps = { scene: "poll" };

export default function Poll() {
  return <Text kicker="Polls" title="Live polls" x={96} y={262} />;
}
