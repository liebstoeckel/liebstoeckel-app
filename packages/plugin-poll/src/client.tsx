import { useEffect, useState } from "react";
import { definePlugin, type ClientProps } from "@liebstoeckel/plugin-sdk";
import { browserLocale } from "@liebstoeckel/plugin-sdk/messages";
import { Bar, Button, Card, Eyebrow, RefusalNote, Stack } from "@liebstoeckel/plugin-ui";
import {
  pollSchema,
  tally,
  totalVotes,
  votesLabel,
  myVote,
  leader,
  resultsMode,
  resultsVisible,
  voteStatus,
  pollMessages,
  type PollState,
} from "./logic";

/** `value`, once it has stayed the same for `ms`: what a screen reader is told, so a
 *  few quick taps between options are announced once, not once per tap. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

const muted = "var(--brand-muted,#8b93a7)";

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
  // until the session state arrives the snapshot is empty: "0 votes" would read as lost votes
  const connecting = p.synced === false;
  const mine = myVote(snapshot, participantId);
  const ResultsView = (ui.Results as unknown as typeof Results) ?? Results;
  const vote = (option: string) => {
    if (!snapshot.closed && !connecting) state.recordSet("votes", participantId, option);
  };
  // What the audience reads follows the reader's language (`?lang=`, else the browser's).
  const locale = browserLocale();
  const m = pollMessages(locale);
  const status = voteStatus({
    mine,
    closed: snapshot.closed,
    synced: !connecting,
    connected: p.connected !== false,
    refused: !!p.refusal,
    locale,
  });
  const announced = useSettled(status?.text ?? "", 800);
  const received = status?.state === "received";
  const showResults = resultsVisible({
    mode: resultsMode(p.props.results),
    role,
    voted: !!mine,
    closed: snapshot.closed,
  });
  return (
    <Card style={{ width: "100%", maxWidth: 460 }}>
      <Eyebrow>{m.livePoll} · {connecting ? m.connecting : votesLabel(totalVotes(snapshot), locale)}</Eyebrow>
      <div style={{ fontFamily: "var(--brand-font-heading, serif)", fontSize: "1.9rem", fontWeight: 600, marginBottom: "1.1rem" }}>
        {snapshot.question || "…"}
      </div>
      <Stack gap="0.55rem">
        {snapshot.options.map((o) => (
          <Button key={o} active={mine === o} pressed={mine === o} disabled={snapshot.closed || connecting} onClick={() => vote(o)}>
            {o}
          </Button>
        ))}
      </Stack>
      {/* a refused vote already reads as not cast (the state is the presenter's); say why */}
      <RefusalNote refusal={p.refusal} what="vote" message={m.refused} style={{ marginTop: "0.8rem" }} />
      {/* Where this person's vote stands. Shown at once; screen readers hear it once it
          settles, politely (the visible line is hidden from them to avoid a double read). */}
      {status && (
        <div
          aria-hidden
          data-testid="poll-vote-status"
          data-state={status.state}
          style={{
            marginTop: "0.8rem",
            color: received ? "var(--brand-accent, #62e8ff)" : muted,
            fontFamily: "var(--brand-font-body, sans-serif)",
            fontSize: "0.95rem",
            lineHeight: 1.4,
          }}
        >
          {received ? "✓ " : ""}
          {status.text}
        </div>
      )}
      <div role="status" aria-live="polite" style={SR_ONLY}>
        {announced}
      </div>
      <div style={{ marginTop: "1.4rem" }}>
        {showResults ? (
          <ResultsView {...p} />
        ) : (
          <div style={{ color: muted, fontFamily: "var(--brand-font-mono,monospace)", fontSize: "0.8rem", letterSpacing: "0.04em" }}>
            {m.resultsAfterVote}
          </div>
        )}
      </div>
      {role === "presenter" && (
        <button
          onClick={() => state.set("closed", !snapshot.closed)}
          style={{ marginTop: "1rem", background: "none", border: "none", cursor: "pointer", color: muted, fontFamily: "var(--brand-font-mono,monospace)", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.15em" }}
        >
          {snapshot.closed ? "▶ reopen voting" : "■ close voting"}
        </button>
      )}
    </Card>
  );
}

/** Visually hidden, still read by screen readers. */
const SR_ONLY = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

/** Presenter console: the big live tally plus the privileged close/reopen control.
 *  Toggling `closed` is an audience-affecting action, the Slide reads it and locks
 *  voting on the audience screen ((internal ADR)). */
function PollConsole(p: ClientProps<PollState>) {
  const { snapshot, state, role } = p;
  if (p.synced === false) {
    return (
      <Card>
        <Eyebrow>Results · connecting…</Eyebrow>
      </Card>
    );
  }
  return (
    <Card>
      <Eyebrow>Results · {votesLabel(totalVotes(snapshot))}{snapshot.closed ? " · closed" : ""}</Eyebrow>
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
 *  options (props), then any seeded snapshot, then a generic placeholder, so the
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

/** A bar-chart line icon (stroke, 24 grid) matching the engine's chrome SVGs, for the
 *  presenter tab, so Poll looks consistent with the rest of the UI. */
function PollIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  );
}

export default definePlugin<PollState>({
  id: "poll",
  state: pollSchema,
  client: {
    Slide: PollSlide,
    presenter: {
      label: "Poll",
      icon: <PollIcon />,
      badge: (s) => totalVotes(s) || undefined,
      title: (s) => s.question || undefined, // tell sibling poll instances apart ((internal ADR))
      Console: PollConsole,
    },
    fallback: PollFallback,
    surfaces: ["Results"],
  },
});
