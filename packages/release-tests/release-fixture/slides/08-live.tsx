import { Plugin } from "@liebstoeckel/engine";

export const notes = "Live slide: poll, Q&A, reactions and the deck's own applause plugin.";

export default function Live() {
  return (
    <div className="grid h-full w-full grid-cols-3 items-start gap-5">
      <Plugin id="poll" props={{ question: "Ship 0.4?", options: ["Yes", "Not yet"] }} />
      <Plugin id="qa" props={{ prompt: "Ask the room" }} />
      <div className="flex flex-col gap-5">
        <Plugin id="applause" />
        <Plugin id="reactions" />
      </div>
    </div>
  );
}
