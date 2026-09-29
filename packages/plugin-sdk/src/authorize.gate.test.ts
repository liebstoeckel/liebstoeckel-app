import { describe, expect, setDefaultTimeout, test } from "bun:test";
import * as Y from "yjs";
import {
  AudienceGate,
  authorizeAudienceUpdate,
  buildAudienceScope,
  MAX_AUDIENCE_ENTRIES,
  MAX_AUDIENCE_TALLY_ENTRIES,
  type AudienceScope,
} from "./authorize";

// The audience check used to compare a JSON projection of the whole doc before and after
// each update. The gate replaced it with an incremental check; this file keeps the old
// check as an oracle and holds the new one to the same answers, plus the per-kind caps.

// Several tests fill fields to their caps (tens of thousands of entries): on a busy CI
// host that takes seconds, past bun's 5 s default.
setDefaultTimeout(60_000);

// ---- the previous whole-doc check, verbatim apart from its names --------------------

function pluginIdOf(rootKey: string): string | null {
  if (!rootKey.startsWith("plugin:")) return null;
  const rest = rootKey.slice("plugin:".length);
  const colon = rest.indexOf(":");
  return colon === -1 ? rest : rest.slice(0, colon);
}

function scopeForRoot(scope: AudienceScope, rootKey: string): ReadonlySet<string> | "*" | null {
  if (scope.wholeRoots.has(rootKey)) return "*";
  const id = pluginIdOf(rootKey);
  if (id) {
    const fields = scope.pluginFields.get(id);
    if (fields) return fields;
  }
  return null;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/** Project the doc to JSON with the audience-writable areas removed, so two
 *  projections are equal **iff** nothing outside the audience scope changed. Whole
 *  audience roots are dropped entirely; per-plugin writable fields are dropped from
 *  that plugin's object. */
function projectProtected(doc: Y.Doc, scope: AudienceScope): string {
  const out: Record<string, unknown> = {};
  for (const key of doc.share.keys()) {
    const allowed = scopeForRoot(scope, key);
    if (allowed === "*") continue;
    // A root integrated by applyUpdate is a generic AbstractType whose toJSON() is
    // empty until materialized; every liebstoeckel state root is a Y.Map (plugin
    // state, nav, the instance index, see state.ts / instances.ts), so bind it as
    // one. A deck that used a non-Map root would throw here → caught → fail closed.
    const js = doc.getMap(key).toJSON() as unknown;
    if (allowed && js && typeof js === "object" && !Array.isArray(js)) {
      const filtered: Record<string, unknown> = {};
      for (const [field, v] of Object.entries(js as Record<string, unknown>)) {
        if (!allowed.has(field)) filtered[field] = v;
      }
      // Omit the root when only writable fields remain (empty after filtering): an
      // audience creating a plugin root by writing its *first* vote (root didn't exist
      // before) must not read as a protected change.
      if (Object.keys(filtered).length > 0) out[key] = filtered;
    } else {
      out[key] = js;
    }
  }
  return stableStringify(out);
}

// Universal bounds on the *values* an audience peer may write into its allowed fields.
// Scope alone (which field changed) is not enough: a peer can write any JSON into an
// allowed field, and an oversized string, pathological nesting, or a runaway number of
// keys is a denial-of-service against the whole session (relay memory, late-join replay,
// and a malformed value crashing the render). Plugins keep their own tighter schema; these
// are the coarse, plugin-agnostic guard rails enforced at the relay trust boundary.
const OLD_STRING = 4096; // chars per string/key
const OLD_ENTRIES = 5000; // keys/items per audience-writable container
const OLD_DEPTH = 6; // nesting depth

/** Recursively check one audience-written value against the bounds above. */
function withinBounds(value: unknown, depth: number): boolean {
  if (depth > OLD_DEPTH) return false;
  if (value === null) return true;
  switch (typeof value) {
    case "string":
      return value.length <= OLD_STRING;
    case "number":
      return Number.isFinite(value);
    case "boolean":
      return true;
    case "undefined":
      // Yjs stores JSON plus `undefined` (an optional field left unset, e.g. an
      // instance-index entry without a title). It carries no payload, so it is as
      // harmless as an absent field; rejecting it muted every audience peer.
      return true;
    case "object": {
      if (Array.isArray(value)) {
        if (value.length > OLD_ENTRIES) return false;
        return value.every((v) => withinBounds(v, depth + 1));
      }
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length > OLD_ENTRIES) return false;
      for (const [k, v] of entries) {
        if (k.length > OLD_STRING) return false;
        if (!withinBounds(v, depth + 1)) return false;
      }
      return true;
    }
    default:
      return false; // function / symbol / bigint, never valid shared state
  }
}

/** The audience-writable units of `doc`, each serialized: a whole audience root (the
 *  instance index) or one declared field of a plugin root. These are the units the
 *  bounds apply to, so a root's or a field's entry count stays capped as a whole. */
function audienceUnits(doc: Y.Doc, scope: AudienceScope): Map<string, unknown> {
  const units = new Map<string, unknown>();
  for (const key of doc.share.keys()) {
    const allowed = scopeForRoot(scope, key);
    if (allowed === null) continue; // presenter-only root, not audience-writable
    const js = doc.getMap(key).toJSON() as Record<string, unknown>;
    if (allowed === "*") {
      units.set(key, js);
      continue;
    }
    for (const field of allowed) {
      if (field in js) units.set(`${key}\u0000${field}`, js[field]);
    }
  }
  return units;
}

/** Are the audience-writable units this update changed within bounds? Units the update
 *  left alone are not judged: a value already in the doc (for instance one the trusted
 *  presenter wrote) must never make every later audience write fail. */
function changedUnitsWithinBounds(before: Map<string, unknown>, after: Map<string, unknown>): boolean {
  for (const [unit, value] of after) {
    if (before.has(unit) && stableStringify(before.get(unit)) === stableStringify(value)) continue;
    if (!withinBounds(value, 0)) return false;
  }
  return true;
}

/** Does the doc hold updates it could not apply yet? */
function hasPending(doc: Y.Doc): boolean {
  return doc.store.pendingStructs !== null || doc.store.pendingDs !== null;
}

/**
 * Would applying `update` (received from an audience peer) change anything **outside**
 * the audience write-scope, carry an out-of-bounds value inside it, or leave anything
 * waiting that the doc cannot apply yet? Returns true if the update is allowed, false if
 * it must be dropped. Pure: it clones `liveState` and never touches the live doc. Fails
 * closed on any decode error.
 *
 * `liveState` is the relay's current `Y.encodeStateAsUpdate(hub.doc)`.
 */
function legacyAuthorize(liveState: Uint8Array, update: Uint8Array, scope: AudienceScope): boolean {
  const clone = new Y.Doc();
  try {
    Y.applyUpdate(clone, liveState);
    const before = projectProtected(clone, scope);
    const unitsBefore = audienceUnits(clone, scope);
    const pendingBefore = hasPending(clone);
    Y.applyUpdate(clone, update);
    // An update that cannot apply yet (a clock gap, or a reference to something the doc
    // lacks) changes nothing now, but it would wait in the doc and join it unchecked once
    // the gap closes. Refuse it: a real client only builds on what it has received.
    if (!pendingBefore && hasPending(clone)) return false;
    const after = projectProtected(clone, scope);
    if (before !== after) return false; // touched a presenter-only field → drop
    // Scope is fine; now bound the values written into the allowed fields so a single
    // update can't carry a multi-megabyte string, deep nesting, or a runaway key count.
    return changedUnitsWithinBounds(unitsBefore, audienceUnits(clone, scope));
  } catch {
    return false;
  } finally {
    clone.destroy();
  }
}

// ---- fixtures ---------------------------------------------------------------------

const scope = buildAudienceScope({
  v: 1,
  plugins: [
    { name: "@liebstoeckel/plugin-poll", version: "0.1.0", hasServer: false, id: "poll", audienceWrites: ["votes"] },
    { name: "@liebstoeckel/plugin-qa", version: "0.1.0", hasServer: false, id: "qa", audienceWrites: ["questions", "votes"] },
  ],
});

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
  d.getMap("nav").set("slide", 0);
  d.getMap("plugin-index").set("poll ", { type: "poll", instance: "", order: 0 });
  return d;
}

function delta(base: Y.Doc, mutate: (d: Y.Doc) => void): Uint8Array {
  const fork = new Y.Doc();
  Y.applyUpdate(fork, Y.encodeStateAsUpdate(base));
  const sv = Y.encodeStateVector(fork);
  mutate(fork);
  return Y.encodeStateAsUpdate(fork, sv);
}

const votesOf = (d: Y.Doc, root = "plugin:poll") => d.getMap(root).get("votes") as Y.Map<unknown>;
const questionsOf = (d: Y.Doc) => d.getMap("plugin:qa").get("questions") as Y.Map<unknown>;
/** A nested map or array of a root, or a throwaway one when an earlier write removed it. */
const nested = <T,>(d: Y.Doc, root: string, key: string, make: () => T): T => (d.getMap(root).get(key) as T | undefined) ?? make();
const question = (text = "How?") => {
  const q = new Y.Map<unknown>();
  q.set("text", text);
  q.set("author", "anon");
  q.set("ts", 1);
  return q;
};

// ---- caps per field kind ------------------------------------------------------------

describe("caps per field kind", () => {
  test("a votes field full at the tally cap refuses the next vote; below the cap votes pass", () => {
    const live = makeBase();
    live.transact(() => {
      for (let i = 0; i < MAX_AUDIENCE_TALLY_ENTRIES - 1; i++) votesOf(live).set(`p${i}`, "red");
    });
    const gate = new AudienceGate(live, scope);
    const last = delta(live, (d) => votesOf(d).set("last", "blue"));
    expect(gate.check(last)).toBe(true);
    Y.applyUpdate(live, last);
    expect(votesOf(live).size).toBe(MAX_AUDIENCE_TALLY_ENTRIES);
    expect(gate.check(delta(live, (d) => votesOf(d).set("one-too-many", "red")))).toBe(false);
    // changing an existing vote does not grow the field, and neither does taking one back
    expect(gate.check(delta(live, (d) => votesOf(d).set("p1", "blue")))).toBe(true);
    expect(gate.check(delta(live, (d) => votesOf(d).delete("p2")))).toBe(true);
    gate.destroy();
  });

  test("a questions field full at the entry cap refuses the next question", () => {
    const live = makeBase();
    live.transact(() => {
      for (let i = 0; i < MAX_AUDIENCE_ENTRIES; i++) questionsOf(live).set(`q${i}`, question());
    });
    const gate = new AudienceGate(live, scope);
    expect(gate.check(delta(live, (d) => questionsOf(d).set("new", question())))).toBe(false);
    expect(gate.check(delta(live, (d) => questionsOf(d).delete("q1")))).toBe(true);
    gate.destroy();
  });

  test("a field holding objects keeps the lower cap even when the new entry is a single value", () => {
    const live = makeBase();
    live.transact(() => {
      for (let i = 0; i < MAX_AUDIENCE_ENTRIES; i++) questionsOf(live).set(`q${i}`, question());
    });
    const gate = new AudienceGate(live, scope);
    expect(gate.check(delta(live, (d) => questionsOf(d).set("sneaky", "x")))).toBe(false);
    gate.destroy();
  });

  test("an object added to a tally field past the entry cap is refused", () => {
    const live = makeBase();
    live.transact(() => {
      for (let i = 0; i < MAX_AUDIENCE_ENTRIES + 10; i++) votesOf(live).set(`p${i}`, "red");
    });
    const gate = new AudienceGate(live, scope);
    expect(gate.check(delta(live, (d) => votesOf(d).set("obj", { a: 1 })))).toBe(false);
    expect(gate.check(delta(live, (d) => votesOf(d).set("plain", "red")))).toBe(true);
    gate.destroy();
  });

  test("a whole field written in one go is judged by its kind", () => {
    const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, "red"]));
    const check = (n: number) => {
      const live = makeBase();
      const gate = new AudienceGate(live, scope);
      const ok = gate.check(delta(live, (d) => d.getMap("plugin:poll:big").set("votes", many(n))));
      gate.destroy();
      return ok;
    };
    expect(check(MAX_AUDIENCE_ENTRIES + 1)).toBe(true);
    expect(check(MAX_AUDIENCE_TALLY_ENTRIES + 1)).toBe(false);
  });

  test("snapshot size with a poll and a Q&A at their caps", () => {
    const d = makeBase();
    // many participants, each writing from its own client id as on a real relay
    const clients = 2000;
    const asClients = (n: number, write: (i: number) => void) => {
      for (let c = 0; c < clients; c++) {
        d.clientID = 10_000 + c;
        d.transact(() => {
          for (let i = c; i < n; i += clients) write(i);
        });
      }
    };
    asClients(MAX_AUDIENCE_TALLY_ENTRIES, (i) => votesOf(d).set(`viewer-${i.toString(36).padStart(8, "0")}`, i % 2 ? "red" : "blue"));
    asClients(MAX_AUDIENCE_ENTRIES, () => questionsOf(d).set(crypto.randomUUID(), question("How does this hold up when a few thousand people ask at once?")));
    asClients(MAX_AUDIENCE_TALLY_ENTRIES, (i) => votesOf(d, "plugin:qa").set(`${crypto.randomUUID()}|viewer-${i.toString(36)}`, true));
    const bytes = Y.encodeStateAsUpdate(d).byteLength;
    console.log(`snapshot at the caps (poll ${MAX_AUDIENCE_TALLY_ENTRIES} votes, Q&A ${MAX_AUDIENCE_ENTRIES} questions + ${MAX_AUDIENCE_TALLY_ENTRIES} upvotes): ${(bytes / 1024 / 1024).toFixed(2)} MB`);
    // well under the relay's 4 MB frame limit is not required (late-join sends it in one
    // frame outbound, which has no limit), but it must stay a few megabytes
    expect(bytes).toBeLessThan(12 * 1024 * 1024);
  });
});

// ---- cases the incremental check must get right ----------------------------------------

describe("AudienceGate edge cases", () => {
  test("rewriting a presenter-only field with the same value is allowed, as before", () => {
    const live = makeBase();
    const gate = new AudienceGate(live, scope);
    // accepted updates are applied to the session doc, as the relay does
    const accept = (u: Uint8Array) => {
      const ok = gate.check(u);
      if (ok) Y.applyUpdate(live, u);
      return ok;
    };
    expect(accept(delta(live, (d) => d.getMap("plugin:poll").set("closed", false)))).toBe(true);
    expect(accept(delta(live, (d) => d.getMap("nav").set("slide", 0)))).toBe(true);
    expect(accept(delta(live, (d) => d.getMap("nav").set("slide", 1)))).toBe(false);
    gate.destroy();
  });

  test("writing into a presenter-only map the presenter has deleted changes nothing visible", () => {
    const live = makeBase();
    const nested = new Y.Map<unknown>();
    live.getMap("nav").set("extra", nested);
    const viewer = new Y.Doc();
    Y.applyUpdate(viewer, Y.encodeStateAsUpdate(live));
    live.getMap("nav").delete("extra");
    const sv = Y.encodeStateVector(viewer);
    (viewer.getMap("nav").get("extra") as Y.Map<unknown>).set("x", "y");
    const update = Y.encodeStateAsUpdate(viewer, sv);
    const gate = new AudienceGate(live, scope);
    const before = JSON.stringify(live.getMap("nav").toJSON());
    const ok = gate.check(update);
    expect(ok).toBe(legacyAuthorize(Y.encodeStateAsUpdate(live), update, scope));
    if (ok) Y.applyUpdate(live, update);
    expect(JSON.stringify(live.getMap("nav").toJSON())).toBe(before);
    gate.destroy();
  });

  test("sequence content in a root is refused, also in a whole audience root", () => {
    const live = makeBase();
    const gate = new AudienceGate(live, scope);
    expect(gate.check(delta(new Y.Doc(), (d) => d.getArray("plugin:poll:x").push(["a"])))).toBe(false);
    expect(gate.check(delta(new Y.Doc(), (d) => d.getArray("plugin-index-2").push(["a"])))).toBe(false);
    const fresh = new Y.Doc();
    const g2 = new AudienceGate(fresh, scope);
    expect(g2.check(delta(fresh, (d) => d.getArray("plugin-index").push(["a"])))).toBe(false);
    g2.destroy();
    gate.destroy();
  });

  test("a subdocument is never an audience value", () => {
    const live = makeBase();
    const gate = new AudienceGate(live, scope);
    expect(gate.check(delta(live, (d) => votesOf(d).set("doc", new Y.Doc())))).toBe(false);
    gate.destroy();
  });

  test("the gate stays in step: refusal, then presenter writes, then a vote", () => {
    const live = makeBase();
    const gate = new AudienceGate(live, scope);
    expect(gate.check(delta(live, (d) => d.getMap("plugin:poll").set("closed", true)))).toBe(false);
    live.getMap("plugin:poll").set("question", "New question?"); // presenter
    const vote = delta(live, (d) => votesOf(d).set("pidA", "red"));
    expect(gate.check(vote)).toBe(true);
    Y.applyUpdate(live, vote);
    // the viewer now writes on top of the presenter's change and its own vote
    expect(gate.check(delta(live, (d) => votesOf(d).set("pidA", "blue")))).toBe(true);
    expect(gate.check(delta(live, (d) => d.getMap("plugin:poll").set("question", "rigged")))).toBe(false);
    gate.destroy();
  });

  test("an update that cannot apply yet is refused, and the next one in order still passes", () => {
    const live = makeBase();
    const gate = new AudienceGate(live, scope);
    const viewer = new Y.Doc();
    Y.applyUpdate(viewer, Y.encodeStateAsUpdate(live));
    const frames: Uint8Array[] = [];
    viewer.on("update", (u: Uint8Array) => frames.push(u));
    votesOf(viewer).set("p1", "red");
    votesOf(viewer).set("p1", "blue");
    expect(gate.check(frames[1]!)).toBe(false);
    expect(gate.check(frames[0]!)).toBe(true);
    Y.applyUpdate(live, frames[0]!);
    expect(gate.check(frames[1]!)).toBe(true);
    gate.destroy();
  });
});

// ---- same answers as the old check on random updates -----------------------------------

type Op = (d: Y.Doc, r: () => number) => void;
const OPS: Op[] = [
  (d, r) => nested(d, "plugin:poll", "votes", () => new Y.Map()).set(`p${Math.floor(r() * 5)}`, r() < 0.5 ? "red" : "blue"),
  (d, r) => nested(d, "plugin:poll", "votes", () => new Y.Map()).delete(`p${Math.floor(r() * 5)}`),
  (d) => nested(d, "plugin:qa", "questions", () => new Y.Map()).set(crypto.randomUUID(), question()),
  (d, r) => nested(d, "plugin:qa", "votes", () => new Y.Map()).set(`q|p${Math.floor(r() * 5)}`, true),
  (d, r) => d.getMap("plugin:poll").set("closed", r() < 0.5),
  (d) => d.getMap("plugin:poll").set("question", "rigged"),
  (d) => nested(d, "plugin:poll", "options", () => new Y.Array<string>()).push(["green"]),
  (d) => {
    const o = nested(d, "plugin:poll", "options", () => new Y.Array<string>());
    if (o.length > 0) o.delete(0, 1);
  },
  (d, r) => d.getMap("nav").set("slide", Math.floor(r() * 2)),
  (d) => nested(d, "plugin:qa", "answered", () => new Y.Map()).set("q", true),
  (d, r) => d.getMap("plugin-index").set(`qa i${Math.floor(r() * 3)}`, { type: "qa", instance: "i", order: 1 }),
  (d) => d.getMap("plugin-index").delete("poll "),
  (d) => d.getMap("evil").set("x", 1),
  (d, r) => d.getMap(`plugin:poll:i${Math.floor(r() * 2)}`).set("votes", new Y.Map()),
  (d) => d.getMap("plugin:poll:i0").set("closed", true),
  (d) => d.getMap("plugin:poll").set("votes", new Y.Map()),
  (d) => d.getMap("plugin:poll").delete("votes"),
  (d) => d.getMap("plugin:qa").delete("answered"),
  (d) => nested(d, "plugin:poll", "votes", () => new Y.Map()).set("big", "x".repeat(5000)),
];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("same answers as the whole-doc check", () => {
  test("600 random sequences of presenter and audience writes", () => {
    let refused = 0;
    let allowed = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const r = rng(seed);
      const live = makeBase();
      const gate = new AudienceGate(live, scope);
      for (let step = 0; step < 8; step++) {
        const presenter = r() < 0.25;
        // The presenter never writes an out-of-bounds value here (the last op): the old
        // check refused every later write into a field holding one, the gate judges only
        // what an update writes, which is the intended difference.
        const pool = presenter ? OPS.slice(0, -1) : OPS;
        const ops = Array.from({ length: 1 + Math.floor(r() * 3) }, () => pool[Math.floor(r() * pool.length)]!);
        const update = delta(live, (d) => d.transact(() => ops.forEach((op) => op(d, r))));
        if (presenter) {
          Y.applyUpdate(live, update);
          continue;
        }
        const want = legacyAuthorize(Y.encodeStateAsUpdate(live), update, scope);
        const got = gate.check(update);
        if (got !== want) {
          const probe = new Y.Doc();
          Y.applyUpdate(probe, Y.encodeStateAsUpdate(live));
          const b = JSON.stringify(Object.fromEntries([...probe.share.keys()].map((k) => [k, probe.getMap(k).toJSON()])));
          Y.applyUpdate(probe, update);
          const a = JSON.stringify(Object.fromEntries([...probe.share.keys()].map((k) => [k, probe.getMap(k).toJSON()])));
          throw new Error(`seed ${seed} step ${step}: gate ${got}, old check ${want}\nbefore ${b}\nafter  ${a}`);
        }
        expect(authorizeAudienceUpdate(Y.encodeStateAsUpdate(live), update, scope)).toBe(want);
        if (got) {
          allowed++;
          Y.applyUpdate(live, update);
        } else refused++;
      }
      gate.destroy();
    }
    // the mix exercises both answers
    expect(allowed).toBeGreaterThan(200);
    expect(refused).toBeGreaterThan(200);
  });
});
