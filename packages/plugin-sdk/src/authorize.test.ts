import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import {
  authorizeAudienceUpdate,
  buildAudienceScope,
  tokenBucket,
  MAX_AUDIENCE_STRING,
  MAX_AUDIENCE_ENTRIES,
} from "./authorize";
import type { PluginManifest } from "./manifest";
import { registerPluginInstance } from "./instances";

// A deck with the two interactive built-ins. poll lets the audience write `votes`;
// qa lets them write `questions` + `votes`; everything else is presenter-only.
const MANIFEST: PluginManifest = {
  v: 1,
  plugins: [
    { name: "@liebstoeckel/plugin-poll", version: "0.1.0", hasServer: false, id: "poll", audienceWrites: ["votes"] },
    { name: "@liebstoeckel/plugin-qa", version: "0.1.0", hasServer: false, id: "qa", audienceWrites: ["questions", "votes"] },
  ],
};
const scope = buildAudienceScope(MANIFEST);

/** A doc shaped like a live session: poll + qa plugin state, a presenter-owned nav
 *  map, and the instance index. */
function makeBase(): Y.Doc {
  const d = new Y.Doc();
  const poll = d.getMap("plugin:poll");
  poll.set("question", "Best colour?");
  const opts = new Y.Array<string>();
  opts.push(["red", "blue"]);
  poll.set("options", opts);
  poll.set("votes", new Y.Map());
  poll.set("closed", false);

  const qa = d.getMap("plugin:qa");
  qa.set("questions", new Y.Map());
  qa.set("votes", new Y.Map());
  qa.set("answered", new Y.Map());
  qa.set("dismissed", new Y.Map());

  d.getMap("nav").set("slide", 0);
  d.getMap("plugin-index").set("poll ", { type: "poll", instance: "", order: 0 });
  return d;
}

/** Encode the delta a peer would send for `mutate`, relative to `base`'s state. */
function delta(base: Y.Doc, mutate: (d: Y.Doc) => void): Uint8Array {
  const fork = new Y.Doc();
  Y.applyUpdate(fork, Y.encodeStateAsUpdate(base));
  const sv = Y.encodeStateVector(fork);
  mutate(fork);
  return Y.encodeStateAsUpdate(fork, sv);
}

function allows(mutate: (d: Y.Doc) => void): boolean {
  const base = makeBase();
  const state = Y.encodeStateAsUpdate(base);
  return authorizeAudienceUpdate(state, delta(base, mutate), scope);
}

describe("authorizeAudienceUpdate", () => {
  test("allows a vote (declared writable field)", () => {
    expect(allows((d) => (d.getMap("plugin:poll").get("votes") as Y.Map<unknown>).set("pidA", "red"))).toBe(true);
  });

  test("rejects closing the poll (presenter-only field)", () => {
    expect(allows((d) => d.getMap("plugin:poll").set("closed", true))).toBe(false);
  });

  test("rejects editing the question", () => {
    expect(allows((d) => d.getMap("plugin:poll").set("question", "rigged"))).toBe(false);
  });

  test("rejects changing navigation", () => {
    expect(allows((d) => d.getMap("nav").set("slide", 5))).toBe(false);
  });

  test("rejects creating a brand-new top-level key", () => {
    expect(allows((d) => d.getMap("evil").set("x", 1))).toBe(false);
  });

  test("allows asking a Q&A question", () => {
    expect(
      allows((d) => {
        const q = new Y.Map<unknown>();
        q.set("text", "How does sync work?");
        q.set("author", "anon");
        q.set("ts", 1);
        (d.getMap("plugin:qa").get("questions") as Y.Map<unknown>).set("q1", q);
      }),
    ).toBe(true);
  });

  test("rejects marking a question answered (presenter moderation)", () => {
    expect(allows((d) => (d.getMap("plugin:qa").get("answered") as Y.Map<unknown>).set("q1", true))).toBe(false);
  });

  test("allows appending to the instance index", () => {
    expect(allows((d) => d.getMap("plugin-index").set("poll q1", { type: "poll", instance: "q1", order: 1 }))).toBe(true);
  });

  test("rejects a mixed update that also touches a protected field (atomic reject)", () => {
    expect(
      allows((d) => {
        (d.getMap("plugin:poll").get("votes") as Y.Map<unknown>).set("pidA", "red");
        d.getMap("plugin:poll").set("closed", true);
      }),
    ).toBe(false);
  });

  test("rejects garbage bytes (fail closed)", () => {
    const base = makeBase();
    expect(authorizeAudienceUpdate(Y.encodeStateAsUpdate(base), new Uint8Array([1, 2, 3, 4, 5]), scope)).toBe(false);
  });

  // Value bounds: scope is necessary but not sufficient — a peer writing *into* an
  // allowed field must still respect coarse size/shape limits (DoS + render-crash guard).
  test("rejects an oversized string written into an allowed field", () => {
    const huge = "x".repeat(MAX_AUDIENCE_STRING + 1);
    expect(allows((d) => (d.getMap("plugin:poll").get("votes") as Y.Map<unknown>).set("pidA", huge))).toBe(false);
  });

  test("rejects an oversized Q&A question text", () => {
    expect(
      allows((d) => {
        const q = new Y.Map<unknown>();
        q.set("text", "x".repeat(MAX_AUDIENCE_STRING + 1));
        q.set("author", "anon");
        q.set("ts", 1);
        (d.getMap("plugin:qa").get("questions") as Y.Map<unknown>).set("q1", q);
      }),
    ).toBe(false);
  });

  test("allows a normal-length question (under the bound)", () => {
    expect(
      allows((d) => {
        const q = new Y.Map<unknown>();
        q.set("text", "x".repeat(280));
        q.set("author", "anon");
        q.set("ts", 1);
        (d.getMap("plugin:qa").get("questions") as Y.Map<unknown>).set("q1", q);
      }),
    ).toBe(true);
  });

  test("rejects a runaway number of vote keys in one update", () => {
    expect(
      allows((d) => {
        const votes = d.getMap("plugin:poll").get("votes") as Y.Map<unknown>;
        for (let i = 0; i <= MAX_AUDIENCE_ENTRIES; i++) votes.set(`p${i}`, "red");
      }),
    ).toBe(false);
  });
});

describe("authorizeAudienceUpdate with real client writes", () => {
  // Every client records the `<Plugin>` instances it renders; an entry without a title
  // carries `title: undefined`, which Yjs stores as is. This used to fail the value
  // bounds, and because the bounds looked at the whole doc, one such entry (the
  // presenter's own) made every audience write fail, votes included.
  test("an index entry without a title, then a vote, is allowed", () => {
    const base = makeBase();
    base.getMap("plugin-index").set("qa ", { type: "qa", instance: "", order: 1, title: undefined });
    const state = Y.encodeStateAsUpdate(base);
    const reg = delta(base, (d) => d.getMap("plugin-index").set("poll q2", { type: "poll", instance: "q2", order: 2, title: undefined }));
    expect(authorizeAudienceUpdate(state, reg, scope)).toBe(true);
    const vote = delta(base, (d) => (d.getMap("plugin:poll").get("votes") as Y.Map<unknown>).set("pidA", "red"));
    expect(authorizeAudienceUpdate(state, vote, scope)).toBe(true);
  });

  test("registerPluginInstance without a title does not write an undefined title", () => {
    const d = new Y.Doc();
    registerPluginInstance(d, "poll", "", {});
    expect("title" in (d.getMap("plugin-index").get("poll\u0000") as object)).toBe(false);
  });

  test("a value already in the doc does not block an unrelated audience write", () => {
    const base = makeBase();
    // Out of bounds, but written by the trusted presenter, not by this update.
    const qa = base.getMap("plugin:qa").get("questions") as Y.Map<unknown>;
    qa.set("long", "x".repeat(MAX_AUDIENCE_STRING + 1));
    const state = Y.encodeStateAsUpdate(base);
    const vote = delta(base, (d) => (d.getMap("plugin:poll").get("votes") as Y.Map<unknown>).set("pidA", "red"));
    expect(authorizeAudienceUpdate(state, vote, scope)).toBe(true);
  });

  test("growing the instance index past the entry cap is still rejected", () => {
    expect(
      allows((d) => {
        const idx = d.getMap("plugin-index");
        for (let i = 0; i <= MAX_AUDIENCE_ENTRIES; i++) idx.set(`poll i${i}`, { type: "poll", instance: `i${i}`, order: i });
      }),
    ).toBe(false);
  });
});

describe("tokenBucket", () => {
  test("permits up to capacity, then drops, then refills", () => {
    const b = tokenBucket(3, 1); // 3 tokens, 1/sec
    expect(b.tryConsume(0)).toBe(true);
    expect(b.tryConsume(0)).toBe(true);
    expect(b.tryConsume(0)).toBe(true);
    expect(b.tryConsume(0)).toBe(false); // empty
    expect(b.tryConsume(1000)).toBe(true); // one refilled after 1s
    expect(b.tryConsume(1000)).toBe(false);
  });
});
