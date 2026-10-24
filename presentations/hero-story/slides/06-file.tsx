import { Text } from "./_Text";

export const notes = "The whole room, pulled back: the talk is one HTML file, and the file turns back into the project it came from.";

export default function File() {
  // what building and ejecting this very deck print
  return (
    <Text kicker="One file" title="One HTML file, works offline" x={96} y={56} width={480}>
      <div className="mt-3 inline-flex flex-col gap-1.5 rounded-lg border border-border bg-surface px-4 py-3 font-mono text-[17px] text-text">
        <span>
          <span className="text-primary">$</span> liebstoeckel build
        </span>
        <span className="text-muted">
          <span className="text-primary">✓</span> built dist/deck.html
        </span>
        <span className="mt-2">
          <span className="text-primary">$</span> liebstoeckel eject dist/deck.html
        </span>
        <span className="text-muted">
          <span className="text-primary">✓</span> ejected 21 files → deck-source
        </span>
      </div>
      <p className="mt-4 font-mono text-[13px]">Open source, MPL-2.0</p>
    </Text>
  );
}
