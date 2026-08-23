import { useEffect, useMemo, useState } from "react";
import type { AnnotationEntry } from "../drawer/bridge";
import { DevShell, DevSidebar, FIXTURE_SLIDES, fixtureEntry, type MemoryFrame, memoryFrame, memoryTransport } from "../src/ui";
import type { StoryContext } from "./main";

export default { title: "DevSidebar" };

// A stand-in for the deck iframe: a fitted 16:9 stage that reports its size
// and mirrors the frame's draft so the "sidebar shrinks the stage" question
// is answerable by eye.
function StagePlaceholder({ frame, slide }: { frame: MemoryFrame; slide: number }) {
  const [draft, setDraft] = useState({ strokes: 0, comments: 0 });
  const [dims, setDims] = useState("");
  useEffect(
    () => frame.onFrame((e) => e.draft && setDraft({ strokes: e.draft.strokes.length, comments: e.draft.comments.length })),
    [frame],
  );
  return (
    <div className="stage-ph">
      <div
        className="stage"
        ref={(el) => {
          if (el) setDims(`${Math.round(el.clientWidth)} x ${Math.round(el.clientHeight)}`);
        }}
      >
        <div>
          <h1>Slide {slide + 1}</h1>
          <p>{FIXTURE_SLIDES[slide]?.sourceFile ?? "unresolved source"}</p>
          {draft.strokes + draft.comments > 0 && (
            <p>
              draft: {draft.strokes} stroke(s), {draft.comments} comment(s)
            </p>
          )}
        </div>
        <span className="dims">{dims}</span>
      </div>
    </div>
  );
}

interface ScenarioProps extends StoryContext {
  seed?: AnnotationEntry[];
  agentPolling?: boolean;
  initialSlide?: number;
  collapsed?: boolean;
  /** Runs once after mount; simulate the user acting in the frame. */
  script?: (frame: MemoryFrame) => void;
}

function Scenario({ seed = [], agentPolling = false, initialSlide = 0, collapsed: initialCollapsed = false, script }: ScenarioProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const transport = useMemo(() => memoryTransport(seed, { agentPolling }), [seed, agentPolling]);
  const frame = useMemo(() => memoryFrame(transport, initialSlide), [transport, initialSlide]);
  const [slide, setSlide] = useState(initialSlide);
  const [slides, setSlides] = useState(() => transport.slides());
  useEffect(() => frame.onFrame((e) => typeof e.slide === "number" && setSlide(e.slide)), [frame]);
  useEffect(() => transport.subscribe((msg) => {
    if (msg.type === "batch_resolved" || msg.type === "annotation_updated") setSlides(transport.slides());
  }), [transport]);
  useEffect(() => {
    script?.(frame);
  }, [frame, script]);
  return (
    <DevShell
      sidebar={
        <DevSidebar
          transport={transport}
          bridge={frame.bridge}
          onFrame={frame.onFrame}
          slides={slides}
          initialSlide={initialSlide}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
        />
      }
    >
      <StagePlaceholder frame={frame} slide={slide} />
    </DevShell>
  );
}

const SEED_MIXED: AnnotationEntry[] = [
  fixtureEntry("a1", { slide: { index: 0, sourceFile: "slides/01-title.mdx" } }),
  fixtureEntry("a2", { slide: { index: 2, sourceFile: "slides/03-chart.tsx" }, comments: [{ x: 0.6, y: 0.5, text: "axis labels are too small" }], createdAt: 1_700_000_100_000 }),
  fixtureEntry("a3", { slide: { index: 2, sourceFile: "slides/03-chart.tsx" }, status: "applied", batchId: "b1", comments: [{ x: 0.2, y: 0.2, text: "use the brand gold" }], createdAt: 1_699_999_000_000, updatedAt: 1_699_999_500_000 }),
  fixtureEntry("a4", { slide: { index: 5, sourceFile: "slides/06-closing.mdx" }, status: "dispatched", batchId: "b2", comments: [{ x: 0.5, y: 0.8, text: "add the contact line" }], createdAt: 1_700_000_200_000 }),
];

export const Empty = (ctx: StoryContext) => <Scenario {...ctx} />;
Empty.note = "Fresh deck, no agent. The sidebar pushes the stage; the stage re-fits to the remaining width.";

export const NoAgent = (ctx: StoryContext) => <Scenario {...ctx} seed={SEED_MIXED} />;
NoAgent.note = "Open, dispatched and applied entries; Send stages instead of delivering because nobody is polling.";

export const AgentPolling = (ctx: StoryContext) => <Scenario {...ctx} seed={SEED_MIXED} agentPolling />;
AgentPolling.note = "Press Send: the scripted agent applies the batch after ~1.4s and the toast + chips update. Revert reopens it.";

export const Drafting = (ctx: StoryContext) => (
  <Scenario
    {...ctx}
    initialSlide={2}
    script={(frame) => {
      frame.bridge.setMode("draw");
      frame.addStroke();
      frame.addStroke();
      frame.addComment("move the legend to the right");
    }}
  />
);
Drafting.note = "The frame reported a draft (2 strokes, 1 comment) on slide 3; Save persists it through the transport.";

export const ManyAnnotations = (ctx: StoryContext) => (
  <Scenario
    {...ctx}
    seed={Array.from({ length: 30 }, (_, i) =>
      fixtureEntry(`m${i}`, {
        slide: { index: i % 6, sourceFile: FIXTURE_SLIDES[i % 6]!.sourceFile },
        status: i % 4 === 0 ? "applied" : "open",
        batchId: i % 4 === 0 ? `b${i}` : null,
        comments: [{ x: 0.3, y: 0.3, text: `note ${i + 1}: tighten this up` }],
        createdAt: 1_700_000_000_000 + i * 1000,
      }),
    )}
  />
);
ManyAnnotations.note = "Thirty entries: the list scrolls inside the sidebar; per-slide badges count open (gold) and applied (green).";

export const AddSlide = (ctx: StoryContext) => (
  <Scenario
    {...ctx}
    seed={[fixtureEntry("q1", { kind: "add-slide", request: { after: 1, description: "a pie chart of cat breeds with one takeaway" }, slide: { index: 2, sourceFile: null }, comments: [], strokes: [], screenshot: null })]}
    agentPolling
  />
);
AddSlide.note = "A pending slide request shows as a ghost row after slide 2. Hover between rows for the + affordance; Send: the scripted agent inserts the slide and the list re-reads.";

export const Collapsed = (ctx: StoryContext) => <Scenario {...ctx} seed={SEED_MIXED} collapsed />;
Collapsed.note = "Rail mode: the stage gets nearly the full width. The chevron expands it again.";

export const Narrow = (ctx: StoryContext) => <Scenario {...ctx} width={640} seed={SEED_MIXED} />;
Narrow.note = "Set the runner width below 860px: the sidebar overlays the stage instead of pushing it.";
