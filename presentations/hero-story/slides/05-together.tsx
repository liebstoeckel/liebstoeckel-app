import { Text } from "./_Text";
import type { SceneName } from "../elements/scene/story";

export const notes = "Three people work on the same slide at once: a colleague in the browser, a developer in the editor, an agent in the terminal.";
export const scene: SceneName = "together";

export default function Together() {
  return (
    <Text kicker="Co-editing" badge="Coming soon" title="Edit together" x={96} y={150} width={390} />
  );
}
