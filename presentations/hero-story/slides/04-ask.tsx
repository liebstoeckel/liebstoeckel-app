import { Text } from "./_Text";
import type { SceneName } from "../elements/scene/story";

export const notes = "A question rises from a seat, collects upvotes, and lands on the screen.";
export const scene: SceneName = "ask";

export default function Ask() {
  return <Text kicker="Q&A" title="Audience questions" x={96} y={64} />;
}
