import { Step } from "@liebstoeckel/engine";

export const notes = (
  <div>
    <p>Press <kbd>q</kbd> to show the join code. Phones join without an app or an account.</p>
    <p>In the presenter view (<kbd>p</kbd>) the join screen also offers a second code to drive the deck from your phone.</p>
  </div>
);

export default function Title() {
  return (
    <div className="w-full">
      <div className="mb-5 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
        <span className="h-px w-8 bg-accent" />
        liebstoeckel, live
      </div>
      <h1 className="font-heading text-[84px] font-semibold leading-[0.98] tracking-[-0.03em] text-text">
        Your deck is a program.
        <br />
        Run it with the room.
      </h1>
      <div className="mt-10 space-y-4 font-body text-2xl text-muted">
        <Step>Take out your phone and scan the code.</Step>
        <Step>Every phone shares one state with this screen.</Step>
        <Step>A tap on yours shows up on all of them.</Step>
      </div>
    </div>
  );
}
