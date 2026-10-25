import { Text } from "./_Text";
import type { HallProps } from "../elements/HallBackdrop";

export const notes = "A question rises from a seat, collects upvotes, and lands on the screen.";
export const backdropProps: HallProps = { scene: "ask" };

export default function Ask() {
  return <Text kicker="Q&A" title="Audience questions" x={96} y={64} />;
}
