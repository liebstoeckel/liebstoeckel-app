import { Text } from "./_Text";
import type { SceneName } from "../elements/scene/story";

export const notes = "Votes fly from the phones to the bars on the big screen.";
export const scene: SceneName = "poll";

export default function Poll() {
  return <Text kicker="Polls" title="Live polls" x={96} y={262} />;
}
