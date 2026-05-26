import { Plugin } from "@liebstoeckel/engine";

export const notes = (
  <div>
    <p>The <strong>live poll</strong>. Votes sync across every connected device through the server.</p>
    <ul>
      <li>Read-only viewers can vote too — results update in real time.</li>
      <li>Press <kbd>Q</kbd> to show the QR; close voting from here when ready.</li>
    </ul>
  </div>
);

export default function PollSlide() {
  return (
    <div className="flex h-full w-full items-center gap-14">
      <div className="w-[40%] shrink-0">
        <div className="mb-5 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
          <span className="h-px w-8 bg-accent" />
          Audience
        </div>
        <h2 className="font-heading text-[56px] font-semibold leading-[0.98] tracking-[-0.02em] text-text">
          Vote from your seat.
        </h2>
        <p className="mt-6 max-w-md font-body text-xl text-muted">
          Scan, tap an option, watch the bars move. Change your mind — it updates live.
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <Plugin
          id="poll"
          props={{
            question: "What should liebstoeckel build next?",
            options: ["On-slide annotation", "Theme marketplace", "Multi-deck linking", "Audience Q&A"],
          }}
        />
      </div>
    </div>
  );
}
