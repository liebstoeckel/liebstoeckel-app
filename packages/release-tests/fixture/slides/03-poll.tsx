import { Plugin } from "@liebstoeckel/engine";

// Two independent poll instances of one type + a Q&A, to exercise instances
// and the presenter console's per-instance tabs.
export default function PollSlide() {
  return (
    <div className="flex h-full w-full items-center justify-center gap-6">
      <Plugin id="poll" props={{ question: "E2E poll?", options: ["Alpha", "Beta"] }} />
      <Plugin id="poll" instance="b" props={{ question: "Second poll?", options: ["Yes", "No"] }} />
      <Plugin id="qa" props={{ prompt: "Ask the room" }} />
    </div>
  );
}
