import { Text } from "./_Text";

export const notes = "Three people work on the same slide at once: a colleague in the browser, a developer in the editor, an agent in the terminal.";

export default function Together() {
  return <Text kicker="Co-editing" title="Edit together" width={390} />;
}
