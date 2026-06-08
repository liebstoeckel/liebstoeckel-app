import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { definePlugin, type ClientProps, type GlobalProps } from "@liebstoeckel/plugin-sdk";
import { Button, Card, Eyebrow, ScrollArea, Stack } from "@liebstoeckel/plugin-ui";
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

/** Submit a question / toggle a vote — the audience actions, shared by every surface. */
function useQaActions(p: Pick<ClientProps<QaState>, "snapshot" | "state" | "participantId">) {
  const submit = (text: string) => {
    const t = text.trim();
    if (!t) return;
    p.state.recordSet("questions", crypto.randomUUID(), { text: t, author: `viewer-${p.participantId.slice(0, 4)}`, ts: Date.now() });
  };
  const toggleVote = (qid: string) => {
    const key = voteKey(qid, p.participantId);
    if (hasVoted(p.snapshot, qid, p.participantId)) p.state.recordDelete("votes", key);
    else p.state.recordSet("votes", key, true);
  };
  return { submit, toggleVote };
}

/** The ask box. Clears itself on submit. */
function Composer({ onSubmit, autoFocus }: { onSubmit: (text: string) => void; autoFocus?: boolean }) {
  const [draft, setDraft] = useState("");
  const go = () => {
    onSubmit(draft);
    setDraft("");
  };
  return (
    <div style={{ display: "flex", gap: "0.5rem" }}>
      <input
        value={draft}
        autoFocus={autoFocus}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && go()}
        placeholder="Type your question…"
        style={{
          flex: 1,
          minWidth: 0,
          appearance: "none",
          padding: "0.7rem 0.9rem",
          borderRadius: "0.7rem",
          border: `1px solid ${v("border", "#222734")}`,
          background: `color-mix(in srgb, ${v("surface", "#11141b")} 60%, transparent)`,
          color: v("text", "#f3f1ea"),
          fontFamily: v("font-body", "sans-serif"),
          fontSize: "1rem",
          outline: "none",
        }}
      />
      <Button onClick={go} active style={{ width: "auto", paddingLeft: "1.2rem", paddingRight: "1.2rem" }}>
        Ask
      </Button>
    </div>
  );
}

/** The live, springy, ranked queue. Moderation buttons appear only for `role==="presenter"`.
 *  Bounded + internally scrolling so it never overflows the fixed slide canvas ((internal ADR)). */
function Queue({ fill, ...p }: Pick<ClientProps<QaState>, "snapshot" | "state" | "participantId" | "role"> & { fill?: boolean }) {
  const { snapshot, state, participantId, role } = p;
  const { toggleVote } = useQaActions(p);
  const ranked = rankedQuestions(snapshot);
  const list = (
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
  );
  // `fill`: the presenter console already gives us a tall scrolling box, so don't impose
  // the slide-canvas cap ((internal ADR)) — let the list use the full panel height. On the slide
  // and in the popover panel we keep the bounded ScrollArea.
  return fill ? list : <ScrollArea>{list}</ScrollArea>;
}

/** In-deck spotlight: the prompt + ask box atop the ranked queue. */
function QaSlide(p: ClientProps<QaState>) {
  const { snapshot, props } = p;
  const { submit } = useQaActions(p);
  const prompt = (props.prompt as string) || "Ask a question";
  return (
    <Card style={{ width: "100%", maxWidth: 520 }}>
      <Eyebrow>Audience Q&amp;A · {rankedQuestions(snapshot).length} open</Eyebrow>
      <div style={{ fontFamily: v("font-heading", "serif"), fontSize: "1.9rem", fontWeight: 600, marginBottom: "1.1rem" }}>
        {prompt}
      </div>
      <div style={{ marginBottom: "1.3rem" }}>
        <Composer onSubmit={submit} />
      </div>
      <Queue {...p} />
    </Card>
  );
}

/** Presenter console: the live ranked queue with privileged moderation — mark
 *  answered, dismiss, upvote. Each action writes the plugin's own state, so the
 *  audience Q&A slide reflects it instantly ((internal ADR)). */
function QaConsole(p: ClientProps<QaState>) {
  const ranked = rankedQuestions(p.snapshot);
  const open = ranked.filter((q) => !q.answered).length;
  return (
    <Card>
      <Eyebrow>Queue · {open} open{ranked.length > open ? ` · ${ranked.length - open} answered` : ""}</Eyebrow>
      <Queue {...p} fill />
    </Card>
  );
}

/** A message line icon (stroke, 24 grid) matching the engine's chrome SVGs — used for the
 *  chrome control and the presenter tab so Q&A looks consistent with the rest of the UI. */
function QaIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/** Global panel: ask + upvote from anywhere. Participation only — moderation lives in the
 *  presenter console (rows render as `viewer`, so no answer/dismiss here). */
function QaPanel(p: GlobalProps<QaState>) {
  const { submit } = useQaActions(p);
  // fills a full-viewport sheet on touch, capped in the desktop popover (which is ~22rem)
  return (
    <div style={{ width: "100%", maxWidth: 480 }}>
      <Eyebrow>Ask the room</Eyebrow>
      <div style={{ margin: "0.4rem 0 0.9rem" }}>
        <Composer onSubmit={submit} autoFocus />
      </div>
      <Queue snapshot={p.snapshot} state={p.state} participantId={p.participantId} role="viewer" />
    </div>
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
    presenter: {
      label: "Q&A",
      icon: <QaIcon />,
      badge: (s) => rankedQuestions(s).filter((q) => !q.answered).length || undefined,
      Console: QaConsole,
    },
    fallback: QaFallback,
    // ask from any slide, even with no Q&A slide placed ((internal ADR)/0036). Unpinned → folds
    // into the ⋮ menu on mobile ((internal ADR)); opens as a sheet on touch so the keyboard
    // doesn't bury it ((internal ADR)).
    global: { icon: <QaIcon />, label: "Q&A", Panel: QaPanel, panelMode: "sheet" },
  },
});
