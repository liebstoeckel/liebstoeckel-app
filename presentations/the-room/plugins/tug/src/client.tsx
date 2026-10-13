import { useEffect, useRef } from "react";
import { definePlugin, type ClientProps } from "@liebstoeckel/plugin-sdk";
import { Button, Card, Eyebrow } from "@liebstoeckel/plugin-ui";
import { position, pulled, totals, tugSchema, type Side, type TugState } from "./logic";

const mono = "var(--brand-font-mono, monospace)";
const muted = "var(--brand-muted, #8b93a7)";

/** The rope: a track with a knot that sits where the room has pulled it. */
function Rope({ at, color }: { at: number; color: string }) {
  return (
    <div style={{ position: "relative", height: 44, margin: "1.2rem 0 1rem" }}>
      <div style={{ position: "absolute", inset: "21px 0 auto", height: 2, background: muted, opacity: 0.5 }} />
      <div style={{ position: "absolute", left: "50%", top: 6, bottom: 6, width: 1, background: muted }} />
      <div
        style={{
          position: "absolute", top: 8, width: 28, height: 28, borderRadius: 999, background: color,
          left: `calc(${50 + at * 46}% - 14px)`, transition: "left 220ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
    </div>
  );
}

function Score({ label, n, align }: { label: string; n: number; align: "left" | "right" }) {
  return (
    <div style={{ textAlign: align }}>
      <div style={{ fontSize: "1.4rem", fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: mono, color: muted }}>{n} pulls</div>
    </div>
  );
}

function TugSlide(p: ClientProps<TugState>) {
  const { snapshot, state, participantId, role } = p;
  const left = String(p.props.left ?? "Left");
  const right = String(p.props.right ?? "Right");
  const sum = totals(snapshot);

  // Fast thumbs tap many times a second. Batch the taps and send one write per
  // 150 ms, so the shared state gets one update per burst, not one per tap.
  const pending = useRef({ left: 0, right: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = () => {
    timer.current = null;
    const { left: l, right: r } = pending.current;
    pending.current = { left: 0, right: 0 };
    state.recordSet("pulls", participantId, pulled(state.snapshot(), participantId, l, r));
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const pull = (side: Side) => {
    pending.current[side]++;
    timer.current ??= setTimeout(flush, 150);
  };

  return (
    <Card style={{ width: "100%", maxWidth: 560 }}>
      <Eyebrow>Tug of war, {p.synced === false ? "connecting" : `${sum.players} ${sum.players === 1 ? "phone" : "phones"}`}</Eyebrow>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Score label={left} n={sum.left} align="left" />
        <Score label={right} n={sum.right} align="right" />
      </div>
      <Rope at={position(snapshot)} color={p.theme.viz[0] ?? "currentColor"} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
        <Button onClick={() => pull("left")}>Pull for {left}</Button>
        <Button onClick={() => pull("right")}>Pull for {right}</Button>
      </div>
      {p.refusal && (
        <div style={{ marginTop: "0.8rem", color: muted, fontSize: "0.85rem" }}>Your pulls did not reach the presenter.</div>
      )}
      {role === "presenter" && (
        <button
          onClick={() => state.set("pulls", {})}
          style={{ marginTop: "1rem", background: "none", border: "none", cursor: "pointer", color: muted, fontFamily: mono, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.15em" }}
        >
          New round
        </button>
      )}
    </Card>
  );
}

/** Offline and in thumbnails: the rope at rest, with the sides the author chose. */
function TugFallback({ props = {} }: { snapshot: TugState; props?: Record<string, unknown> }) {
  return (
    <Card style={{ width: "100%", maxWidth: 560 }}>
      <Eyebrow>Tug of war, offline preview</Eyebrow>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Score label={String(props.left ?? "Left")} n={0} align="left" />
        <Score label={String(props.right ?? "Right")} n={0} align="right" />
      </div>
      <Rope at={0} color="currentColor" />
      <div style={{ color: muted, fontFamily: mono, fontSize: "0.8rem" }}>Start the live server to play.</div>
    </Card>
  );
}

export default definePlugin<TugState>({
  id: "tug",
  state: tugSchema,
  client: { Slide: TugSlide, fallback: TugFallback },
});
