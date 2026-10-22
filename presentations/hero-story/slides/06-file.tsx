import { Text } from "./_Text";

export const notes = "The whole room, pulled back: the talk is one HTML file.";

export default function File() {
  return (
    <Text kicker="One file" title="The whole talk is one HTML file" width={560}>
      <p>It runs offline, with no server and no account. When you want the room, one command takes it live.</p>
      <div className="mt-7 inline-flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 font-mono text-[17px] text-text">
        <span className="text-primary">$</span> npm install -g @liebstoeckel/cli
      </div>
      <p className="mt-4 font-mono text-[13px]">Open source, MPL-2.0. This story is a liebstoeckel deck too.</p>
    </Text>
  );
}
