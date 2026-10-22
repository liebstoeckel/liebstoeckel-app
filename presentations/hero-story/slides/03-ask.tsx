import { Text } from "./_Text";

export const notes = "A question rises from a seat, collects upvotes, and lands on the screen.";

export default function Ask() {
  return (
    <Text kicker="Q&A" title="Questions from the floor" at="top" width={500}>
      People ask from their seats and upvote what they want answered. You pick the next one.
    </Text>
  );
}
