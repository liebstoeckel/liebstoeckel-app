import { Text } from "./_Text";

export const notes = "The hall behind the words is one 3D scene that stays on screen for the whole deck. Each slide moves its camera.";

export default function Hall() {
  return (
    <>
      <Text kicker="liebstoeckel" title={<span className="text-[88px] leading-[0.95]">Present with the room</span>} width={600}>
        Slides your audience joins on their phones. Their votes, questions and reactions show up live, on every screen.
      </Text>
      <div className="absolute bottom-14 left-24 flex items-center gap-6 font-mono text-[13px] text-muted">
        <span className="text-accent">Click, swipe or press →</span>
        <span>This page is a liebstoeckel deck.</span>
      </div>
    </>
  );
}
