import { useEffect } from "react";
import { definePlugin, type ClientProps } from "@liebstoeckel/plugin-sdk";
import { Bar, Button, Card, Eyebrow, Stack } from "@liebstoeckel/plugin-ui";
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
    <Card style={{ width: "100%", maxWidth: 460 }}>
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

/** Presenter console: the big live tally plus the privileged close/reopen control.
 *  Toggling `closed` is an audience-affecting action — the Slide reads it and locks
 *  voting on the audience screen (ADR 0031). */
function PollConsole(p: ClientProps<PollState>) {
  const { snapshot, state, role } = p;
  return (
    <Card>
      <Eyebrow>Results · {totalVotes(snapshot)} votes{snapshot.closed ? " · closed" : ""}</Eyebrow>
      <Results {...p} />
      {role === "presenter" && (
        <div style={{ marginTop: "1.2rem" }}>
          <Button onClick={() => state.set("closed", !snapshot.closed)}>
            {snapshot.closed ? "▶ Reopen voting" : "■ Close voting"}
          </Button>
        </div>
      )}
    </Card>
  );
}

/** No live server → static preview. Prefers the author's configured question /
 *  options (props), then any seeded snapshot, then a generic placeholder — so the
 *  standalone .html and the build-time thumbnail both show the real poll. */
function PollFallback({ snapshot, props = {} }: { snapshot: PollState; props?: Record<string, unknown> }) {
  const question = snapshot.question || (props.question as string) || "Live poll";
  const options =
    (snapshot.options.length && snapshot.options) ||
    (props.options as string[] | undefined) ||
    ["Option A", "Option B"];
  return (
    <Card>
      <Eyebrow>Poll · offline preview</Eyebrow>
      <div style={{ fontFamily: "var(--brand-font-heading, serif)", fontSize: "1.6rem", marginBottom: "0.8rem" }}>
        {question}
      </div>
      <Stack gap="0.5rem">
        {options.map((o) => (
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
    presenter: { label: "Poll", icon: "📊", badge: (s) => totalVotes(s) || undefined, Console: PollConsole },
    fallback: PollFallback,
    surfaces: ["Results"],
  },
});
