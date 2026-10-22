import { Text } from "./_Text";

export const notes = "Three people work on the same slide at once: a colleague in the browser, a developer in the editor, an agent in the terminal.";

export default function Together() {
  return (
    <Text kicker="Together" title="One deck, everyone on it" width={390}>
      Developers in their editor, colleagues in the browser, agents in the terminal. Everyone edits the same slides at
      once, and every change shows up right away.
    </Text>
  );
}
