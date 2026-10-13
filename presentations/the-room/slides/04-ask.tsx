import { Plugin } from "@liebstoeckel/engine";

export const notes = (
  <div>
    <p>Questions work from any slide through the speech-bubble button; the queue re-ranks as people upvote.</p>
    <p>Moderate it from the Q&amp;A tab in the presenter view.</p>
  </div>
);

export default function AskSlide() {
  return (
    <div className="flex h-full w-full items-center gap-14">
      <div className="w-[40%] shrink-0">
        <div className="mb-5 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
          <span className="h-px w-8 bg-accent" />
          Built in
        </div>
        <h2 className="font-heading text-[56px] font-semibold leading-[0.98] tracking-[-0.02em] text-text">
          Ask, upvote, react
        </h2>
        <p className="mt-6 max-w-md font-body text-xl text-muted">
          The best questions rise to the top while people vote on them. Reactions float over the deck and fade.
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <Plugin id="qa" props={{ prompt: "What should we dig into?" }} />
      </div>
    </div>
  );
}
