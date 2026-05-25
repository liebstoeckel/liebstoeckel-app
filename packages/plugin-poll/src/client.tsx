import { useEffect } from "react";
import { definePlugin, type ClientProps } from "@present-it/plugin-sdk";
import { Bar, Button, Card, Eyebrow, Stack } from "@present-it/plugin-ui";
import { pollSchema, tally, totalVotes, myVote, leader, type PollState } from "./logic";

// Seed the question/options from author props once (presenter owns init).
function useSeed(p: ClientProps<PollState>) {
  const question = (p.props.question as string) ?? "";
  const options = (p.props.options as string[]) ?? [];
  useEffect(() => {
    if (p.role === "presenter" && options.length && p.snapshot.options.length === 0) {
      p.state.ensureDefaults({ question, options });
    }
  }, [p.role, question, options.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
}

function Results({ snapshot, theme }: ClientProps<PollState>) {
  const rows = tally(snapshot);
  const top = leader(snapshot);
  return (
    <Stack gap="0">
      {rows.map((r, i) => (
        <Bar
          key={r.option}
          label={r.option}
          value={`${r.count} · ${r.pct}%`}
          pct={r.pct}
          color={theme.viz[i % theme.viz.length]}
          highlight={r.option === top}
        />
      ))}
    </Stack>
  );
}

/** In-deck UI: viewers + presenter can vote; results render live underneath. */
function PollSlide(p: ClientProps<PollState>) {
  useSeed(p);
  const { snapshot, state, participantId, role, ui } = p;
  const mine = myVote(snapshot, participantId);
  const ResultsView = (ui.Results as unknown as typeof Results) ?? Results;
  const vote = (option: string) => {
    if (!snapshot.closed) state.recordSet("votes", participantId, option);
  };
  return (
    <Card style={{ minWidth: 420 }}>
      <Eyebrow>Live poll · {totalVotes(snapshot)} votes</Eyebrow>
      <div style={{ fontFamily: "var(--brand-font-heading, serif)", fontSize: "1.9rem", fontWeight: 600, marginBottom: "1.1rem" }}>
        {snapshot.question || "…"}
      </div>
      <Stack gap="0.55rem">
        {snapshot.options.map((o) => (
          <Button key={o} active={mine === o} disabled={snapshot.closed} onClick={() => vote(o)}>
            {o}
          </Button>
        ))}
      </Stack>
      <div style={{ marginTop: "1.4rem" }}>
        <ResultsView {...p} />
      </div>
      {role === "presenter" && (
        <button
          onClick={() => state.set("closed", !snapshot.closed)}
          style={{ marginTop: "1rem", background: "none", border: "none", cursor: "pointer", color: "var(--brand-muted,#8b93a7)", fontFamily: "var(--brand-font-mono,monospace)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.15em" }}
        >
          {snapshot.closed ? "▶ reopen voting" : "■ close voting"}
        </button>
      )}
    </Card>
  );
}

/** Presenter-only: big results panel. */
function PollPresenter(p: ClientProps<PollState>) {
  return (
    <Card>
      <Eyebrow>Results · {totalVotes(p.snapshot)} votes{p.snapshot.closed ? " · closed" : ""}</Eyebrow>
      <Results {...p} />
    </Card>
  );
}

/** No live server → static preview from whatever seed exists. */
function PollFallback({ snapshot }: { snapshot: PollState }) {
  return (
    <Card>
      <Eyebrow>Poll · offline preview</Eyebrow>
      <div style={{ fontFamily: "var(--brand-font-heading, serif)", fontSize: "1.6rem", marginBottom: "0.8rem" }}>
        {snapshot.question || "Live poll"}
      </div>
      <Stack gap="0.5rem">
        {(snapshot.options.length ? snapshot.options : ["Option A", "Option B"]).map((o) => (
          <Button key={o} disabled>
            {o}
          </Button>
        ))}
      </Stack>
      <div style={{ marginTop: "1rem", color: "var(--brand-muted,#8b93a7)", fontFamily: "var(--brand-font-mono,monospace)", fontSize: "0.8rem" }}>
        Start the live server to vote.
      </div>
    </Card>
  );
}

export default definePlugin<PollState>({
  id: "poll",
  state: pollSchema,
  client: {
    Slide: PollSlide,
    Presenter: PollPresenter,
    fallback: PollFallback,
    surfaces: ["Results"],
  },
});
