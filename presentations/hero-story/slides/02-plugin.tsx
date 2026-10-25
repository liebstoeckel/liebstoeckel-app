import { Text } from "./_Text";
import type { SceneName } from "../elements/scene/story";

export const notes = "The agent writes a tug of war as a plugin; the left half of the room pulls against the right half.";
export const scene: SceneName = "plugin";

export default function Plugin() {
  return <Text kicker="Plugins" title="Build your own interaction" x={96} y={64} width={500} />;
}
