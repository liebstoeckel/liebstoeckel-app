import { Text } from "./_Text";

export const notes = "The agent writes a tug of war as a plugin; the left half of the room pulls against the right half.";

export default function Plugin() {
  return (
    <Text kicker="Plugins" title="If you can describe it, the room can play it" at="top" width={540}>
      Polls and Q&amp;A are built in. For anything else, ask your coding agent: it writes the plugin, and every phone in
      the room joins in.
    </Text>
  );
}
