import { Text } from "./_Text";

export const notes = "Votes fly from the phones to the bars on the big screen.";

export default function Poll() {
  return (
    <Text kicker="Polls" title="Ask the room" at="bottom" width={520}>
      Every phone votes, and the bars move as the votes come in.
    </Text>
  );
}
