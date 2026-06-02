import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { decodePluginState } from "@liebstoeckel/plugin-sdk/decode";
import { leader, pollSchema, tally, totalVotes, type PollState } from "./logic";

// Parity check (ADR 0061): the deck-free decoder feeds the *same* pure derivations the
// live deck uses, so a persisted session's results match what the audience saw.
describe("decoded poll snapshot → in-session derivations", () => {
  test("tally / totalVotes / leader match the live computation", () => {
    const d = new Y.Doc();
    const poll = d.getMap("plugin:poll");
    poll.set("question", "Best colour?");
    const opts = new Y.Array<string>();
    opts.push(["red", "blue", "green"]);
    poll.set("options", opts);
    const votes = new Y.Map<string>();
    votes.set("p1", "red");
    votes.set("p2", "red");
    votes.set("p3", "blue");
    poll.set("votes", votes);
    poll.set("closed", true);
    const snap = Y.encodeStateAsUpdate(d);

    // Decode + validate against the plugin's own schema (defaults fill any gaps).
    const decoded = decodePluginState(snap, "poll");
    const state = pollSchema.parse({ ...pollSchema.default(), ...decoded }) as PollState;

    expect(totalVotes(state)).toBe(3);
    expect(leader(state)).toBe("red");
    expect(tally(state)).toEqual([
      { option: "red", count: 2, pct: 67 },
      { option: "blue", count: 1, pct: 33 },
      { option: "green", count: 0, pct: 0 },
    ]);
  });
});
