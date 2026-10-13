import { Plugin } from "@liebstoeckel/engine";

export const notes = (
  <div>
    <p>The built-in poll. Votes land on every screen as they are cast; a phone can change its vote.</p>
    <p>The presenter view has a Poll tab with the tally and a button to close voting.</p>
  </div>
);

export default function PollSlide() {
  return (
    <div className="flex h-full w-full items-center gap-14">
      <div className="w-[40%] shrink-0">
        <div className="mb-5 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
          <span className="h-px w-8 bg-accent" />
          Built in
        </div>
        <h2 className="font-heading text-[56px] font-semibold leading-[0.98] tracking-[-0.02em] text-text">
          A poll, to warm up
        </h2>
        <p className="mt-6 max-w-md font-body text-xl text-muted">
          Tap an answer and watch the bars move. Change your mind and they move back.
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <Plugin
          id="poll"
          props={{
            question: "How do you make your decks today?",
            options: ["In a slide editor", "In code", "My agent writes them", "I avoid decks"],
          }}
        />
      </div>
    </div>
  );
}
