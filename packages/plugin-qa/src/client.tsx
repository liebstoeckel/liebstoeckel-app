import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { definePlugin, type ClientProps } from "@liebstoeckel/plugin-sdk";
import { Button, Card, Eyebrow, Stack } from "@liebstoeckel/plugin-ui";
import { qaSchema, hasVoted, voteCount, voteKey, rankedQuestions, type QaState, type RankedQuestion } from "./logic";

const v = (name: string, fallback: string) => `var(--brand-${name}, ${fallback})`;

/** A vote pill + the question text + presenter controls, as one springy row. */
function QuestionRow({
  q,
  voted,
  role,
  onUpvote,
  onAnswer,
  onDismiss,
}: {
  q: RankedQuestion;
  voted: boolean;
  role: "presenter" | "viewer";
  onUpvote: () => void;
  onAnswer: () => void;
  onDismiss: () => void;
}) {
  return (
    <motion.div
      layout
      layoutId={q.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: q.answered ? 0.55 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.85rem",
        padding: "0.85rem 1rem",
        borderRadius: "0.7rem",
        border: `1px solid ${v("border", "#222734")}`,
        background: `color-mix(in srgb, ${v("surface", "#11141b")} 45%, transparent)`,
      }}
    >
      <button
        onClick={onUpvote}
        data-active={voted}
        style={{
          appearance: "none",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.1rem",
          minWidth: "3rem",
          padding: "0.4rem 0.2rem",
          borderRadius: "0.55rem",
          border: `1px solid ${voted ? v("primary", "#caff4d") : v("border", "#222734")}`,
          background: voted ? v("primary", "#caff4d") : "transparent",
          color: voted ? v("on-primary", "#08090c") : v("text", "#f3f1ea"),
          fontFamily: v("font-mono", "monospace"),
          transition: "all 0.15s ease",
        }}
      >
        <span style={{ fontSize: "0.8rem", lineHeight: 1 }}>▲</span>
        <span style={{ fontSize: "1.05rem", fontWeight: 600, lineHeight: 1 }}>{q.votes}</span>
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: v("font-body", "sans-serif"),
            fontSize: "1.05rem",
            color: v("text", "#f3f1ea"),
            textDecoration: q.answered ? "line-through" : "none",
          }}
        >
          {q.text}
        </div>
        <div
          style={{
            marginTop: "0.25rem",
            fontFamily: v("font-mono", "monospace"),
            fontSize: "0.68rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: v("muted", "#8b93a7"),
          }}
        >
          {q.author || "anonymous"}
          {q.answered ? " · answered" : ""}
        </div>
      </div>
      {role === "presenter" && (
        <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
          <CtrlButton title="mark answered" onClick={onAnswer} active={q.answered} glyph="✓" />
          <CtrlButton title="dismiss" onClick={onDismiss} glyph="✕" />
        </div>
      )}
    </motion.div>
  );
}

function CtrlButton({ glyph, title, onClick, active = false }: { glyph: string; title: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        appearance: "none",
        cursor: "pointer",
        width: "1.9rem",
        height: "1.9rem",
        borderRadius: "0.5rem",
        border: `1px solid ${active ? v("accent", "#62e8ff") : v("border", "#222734")}`,
        background: active ? `color-mix(in srgb, ${v("accent", "#62e8ff")} 22%, transparent)` : "transparent",
        color: active ? v("accent", "#62e8ff") : v("muted", "#8b93a7"),
        fontSize: "0.85rem",
        lineHeight: 1,
        transition: "all 0.15s ease",
      }}
    >
      {glyph}
    </button>
  );
}

/** In-deck UI: a submit box atop a live, springy, ranked queue. */
function QaSlide(p: ClientProps<QaState>) {
  const { snapshot, state, participantId, role, props } = p;
  const [draft, setDraft] = useState("");
  const ranked = rankedQuestions(snapshot);
  const prompt = (props.prompt as string) || "Ask a question";

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    state.recordSet("questions", crypto.randomUUID(), { text, author: `viewer-${participantId.slice(0, 4)}`, ts: Date.now() });
    setDraft("");
  };

  const toggleVote = (qid: string) => {
    const key = voteKey(qid, participantId);
    if (hasVoted(snapshot, qid, participantId)) state.recordDelete("votes", key);
    else state.recordSet("votes", key, true);
  };

  return (
    <Card style={{ width: "100%", maxWidth: 520 }}>
      <Eyebrow>Audience Q&amp;A · {ranked.length} open</Eyebrow>
      <div style={{ fontFamily: v("font-heading", "serif"), fontSize: "1.9rem", fontWeight: 600, marginBottom: "1.1rem" }}>
        {prompt}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.3rem" }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Type your question…"
          style={{
            flex: 1,
            appearance: "none",
            padding: "0.8rem 1rem",
            borderRadius: "0.7rem",
            border: `1px solid ${v("border", "#222734")}`,
            background: `color-mix(in srgb, ${v("surface", "#11141b")} 60%, transparent)`,
            color: v("text", "#f3f1ea"),
            fontFamily: v("font-body", "sans-serif"),
            fontSize: "1rem",
            outline: "none",
          }}
        />
        <Button onClick={submit} active style={{ width: "auto", paddingLeft: "1.4rem", paddingRight: "1.4rem" }}>
          Ask
        </Button>
      </div>
      <Stack gap="0.55rem">
        <AnimatePresence initial={false}>
          {ranked.map((q) => (
            <QuestionRow
              key={q.id}
              q={q}
              voted={hasVoted(snapshot, q.id, participantId)}
              role={role}
              onUpvote={() => toggleVote(q.id)}
              onAnswer={() => state.recordSet("answered", q.id, !snapshot.answered[q.id])}
              onDismiss={() => state.recordSet("dismissed", q.id, true)}
            />
          ))}
        </AnimatePresence>
        {ranked.length === 0 && (
          <div style={{ color: v("muted", "#8b93a7"), fontFamily: v("font-mono", "monospace"), fontSize: "0.8rem", padding: "0.6rem 0" }}>
            No questions yet — be the first.
          </div>
        )}
      </Stack>
    </Card>
  );
}

/** Presenter-only: a compact ranked panel of the open queue. */
function QaPresenter({ snapshot }: ClientProps<QaState>) {
  const ranked = rankedQuestions(snapshot);
  return (
    <Card>
      <Eyebrow>Queue · {ranked.length} open</Eyebrow>
      <Stack gap="0.4rem">
        {ranked.map((q) => (
          <div
            key={q.id}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "0.7rem",
              fontFamily: v("font-body", "sans-serif"),
              opacity: q.answered ? 0.55 : 1,
            }}
          >
            <span style={{ fontFamily: v("font-mono", "monospace"), color: v("accent", "#62e8ff"), minWidth: "2.2rem" }}>
              ▲{q.votes}
            </span>
            <span style={{ textDecoration: q.answered ? "line-through" : "none" }}>{q.text}</span>
          </div>
        ))}
        {ranked.length === 0 && <span style={{ color: v("muted", "#8b93a7") }}>No questions yet.</span>}
      </Stack>
    </Card>
  );
}

/** No live server → static preview. Uses the author's `props.prompt` (or a default)
 *  and a couple of example questions so the standalone .html + thumbnail show real UI. */
function QaFallback({ snapshot, props = {} }: { snapshot: QaState; props?: Record<string, unknown> }) {
  const prompt = (props.prompt as string) || "Ask a question";
  const live = rankedQuestions(snapshot);
  const examples: RankedQuestion[] =
    live.length > 0
      ? live
      : [
          { id: "ex1", text: "How does the CRDT handle offline edits?", author: "anonymous", ts: 2, votes: 12, answered: false },
          { id: "ex2", text: "Will the slides be shared afterwards?", author: "anonymous", ts: 1, votes: 5, answered: false },
        ];
  return (
    <Card style={{ width: "100%", maxWidth: 520 }}>
      <Eyebrow>Audience Q&amp;A · offline preview</Eyebrow>
      <div style={{ fontFamily: v("font-heading", "serif"), fontSize: "1.7rem", fontWeight: 600, marginBottom: "1rem" }}>
        {prompt}
      </div>
      <Stack gap="0.55rem">
        {examples.map((q) => (
          <div
            key={q.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.85rem",
              padding: "0.85rem 1rem",
              borderRadius: "0.7rem",
              border: `1px solid ${v("border", "#222734")}`,
              background: `color-mix(in srgb, ${v("surface", "#11141b")} 45%, transparent)`,
            }}
          >
            <span
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                minWidth: "3rem",
                fontFamily: v("font-mono", "monospace"),
                color: v("muted", "#8b93a7"),
              }}
            >
              <span style={{ fontSize: "0.8rem" }}>▲</span>
              <span style={{ fontSize: "1.05rem", fontWeight: 600 }}>{q.votes}</span>
            </span>
            <span style={{ fontFamily: v("font-body", "sans-serif"), color: v("text", "#f3f1ea") }}>{q.text}</span>
          </div>
        ))}
      </Stack>
      <div style={{ marginTop: "1rem", color: v("muted", "#8b93a7"), fontFamily: v("font-mono", "monospace"), fontSize: "0.8rem" }}>
        Start the live server to ask &amp; upvote.
      </div>
    </Card>
  );
}

export default definePlugin<QaState>({
  id: "qa",
  state: qaSchema,
  client: {
    Slide: QaSlide,
    Presenter: QaPresenter,
    fallback: QaFallback,
  },
});
