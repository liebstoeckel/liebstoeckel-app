import { definePlugin, schema, t, type ClientProps, type Infer } from "@liebstoeckel/plugin-sdk";
import { Button, Card, Eyebrow } from "@liebstoeckel/plugin-ui";

// A plugin defined inside the deck. Its audience field is declared in the deck's
// package.json (liebstoeckel.plugins.applause.audienceWrites), or a relay refuses it.
const applauseSchema = schema({ claps: t.record(t.number) });
type ApplauseState = Infer<typeof applauseSchema>;

function total(s: ApplauseState): number {
  return Object.values(s.claps ?? {}).reduce((a, b) => a + b, 0);
}

function ApplauseSlide(p: ClientProps<ApplauseState>) {
  const mine = p.snapshot.claps?.[p.participantId] ?? 0;
  return (
    <Card>
      <Eyebrow>Applause</Eyebrow>
      <div data-testid="applause-total" style={{ fontSize: "2rem", fontWeight: 600 }}>{total(p.snapshot)} claps</div>
      <Button onClick={() => p.state.recordSet("claps", p.participantId, mine + 1)}>Clap</Button>
      {p.refusal && <div style={{ marginTop: "0.6rem", fontSize: "0.85rem" }}>Your claps did not reach the presenter.</div>}
    </Card>
  );
}

function ApplauseFallback() {
  return (
    <Card>
      <Eyebrow>Applause, offline preview</Eyebrow>
      <div>Start the live server to clap.</div>
    </Card>
  );
}

export default definePlugin<ApplauseState>({
  id: "applause",
  state: applauseSchema,
  client: { Slide: ApplauseSlide, fallback: ApplauseFallback },
});
