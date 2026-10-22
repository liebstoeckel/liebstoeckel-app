import { Text } from "./_Text";

export const notes = "Over the speaker's shoulder: the poll from slide two is a few lines of MDX.";

export default function Code() {
  return (
    <Text kicker="Written as code" title="Your slides are code" at="bottom" width={600}>
      Every slide is MDX and React in your own repo, and your coding agent writes it with you. A poll is one element.
      Anything else the room should do is a plugin.
    </Text>
  );
}
