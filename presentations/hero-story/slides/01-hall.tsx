import { Text } from "./_Text";
import { framed } from "../elements/bridge";

export const notes = "The hall behind the words is one 3D scene that stays on screen for the whole deck. Each slide moves its camera.";

export default function Hall() {
  // in a page's frame the page scrolls the deck, so the hint says so (a mouse
  // click does not turn a slide; the arrow keys work from the page too)
  const inPage = framed();
  return (
    <>
      <Text kicker="liebstoeckel" title="Present with the room" size={88} x={96} y={60} width={600} />
      <div className="absolute bottom-14 left-24 flex items-center gap-6 font-mono text-[13px] text-muted">
        <span className="text-accent">{inPage ? "Scroll or press →" : "Click, swipe or press →"}</span>
        <span>{inPage ? "This is a liebstoeckel deck." : "This page is a liebstoeckel deck."}</span>
      </div>
    </>
  );
}
