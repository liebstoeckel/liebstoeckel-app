import { Text } from "./_Text";
import { framed } from "../elements/bridge";
import type { SceneName } from "../elements/scene/story";

export const notes = "The hall behind the words is one 3D scene that stays on screen for the whole deck. Each slide moves its camera.";
export const scene: SceneName = "hall";

export default function Hall() {
  // in a page's frame the page around it says how to take over, so the hint
  // only says what this is
  const inPage = framed();
  return (
    <>
      <Text
        kicker="liebstoeckel"
        title={
          <>
            Your deck is a program.
            <br />
            Run it with the room.
          </>
        }
        size={64}
        x={96}
        y={64}
        width={760}
      />
      <div className="absolute bottom-14 left-24 flex items-center gap-6 font-mono text-[13px] text-muted">
        {!inPage && <span className="text-accent">Click, swipe or press →</span>}
        <span>{inPage ? "This is a liebstoeckel deck." : "This page is a liebstoeckel deck."}</span>
      </div>
    </>
  );
}
