import { describe, expect, test } from "bun:test";
import { acceptInit, decodeFrameMessage, decodeHostMessage, initialHandshake, isDraftPayload, trusts } from "./frame-protocol";

const draft = { space: "stage" as const, strokes: [{ points: [[0.1, 0.2], [0.3, 0.4]] as Array<[number, number]> }], comments: [{ x: 0.5, y: 0.5, text: "hi" }] };

describe("decoders", () => {
  test("frame messages round-trip and reject malformed shapes", () => {
    expect(decodeFrameMessage({ type: "lst:hello" })).toEqual({ type: "lst:hello" });
    expect(decodeFrameMessage({ type: "lst:slide", index: 2 })).toEqual({ type: "lst:slide", index: 2 });
    expect(decodeFrameMessage({ type: "lst:slide", index: "2" })).toBeNull();
    expect(decodeFrameMessage({ type: "lst:draft", draft })).toEqual({ type: "lst:draft", draft });
    expect(decodeFrameMessage({ type: "lst:draft", draft: { ...draft, space: "viewport" } })).toBeNull();
    expect(decodeFrameMessage({ type: "lst:mode", mode: "draw" })).toEqual({ type: "lst:mode", mode: "draw" });
    expect(decodeFrameMessage({ type: "lst:mode", mode: "erase" })).toBeNull();
    expect(decodeFrameMessage({ type: "lst:captured", id: "c1", draft, screenshot: null })).toMatchObject({ type: "lst:captured", id: "c1" });
    expect(decodeFrameMessage({ type: "lst:captured", id: "c1", draft, screenshot: "data:" })).toBeNull();
    expect(decodeFrameMessage({ type: "evil" })).toBeNull();
    expect(decodeFrameMessage("lst:hello")).toBeNull();
  });

  test("host messages", () => {
    expect(decodeHostMessage({ type: "lst:init" })).toEqual({ type: "lst:init" });
    expect(decodeHostMessage({ type: "lst:setMode", mode: "comment" })).toEqual({ type: "lst:setMode", mode: "comment" });
    expect(decodeHostMessage({ type: "lst:goto", index: 3 })).toEqual({ type: "lst:goto", index: 3 });
    expect(decodeHostMessage({ type: "lst:goto", index: -1 })).toBeNull();
    expect(decodeHostMessage({ type: "lst:goto", index: 1.5 })).toBeNull();
    expect(decodeHostMessage({ type: "lst:capture", id: "x" })).toEqual({ type: "lst:capture", id: "x" });
    expect(decodeHostMessage({ type: "lst:capture" })).toBeNull();
    expect(decodeHostMessage(null)).toBeNull();
  });

  test("isDraftPayload checks point shapes", () => {
    expect(isDraftPayload(draft)).toBe(true);
    expect(isDraftPayload({ ...draft, strokes: [{ points: [[1]] }] })).toBe(false);
    expect(isDraftPayload({ ...draft, comments: [{ x: 0, y: 0 }] })).toBe(false);
  });
});

describe("handshake", () => {
  test("waits for init, then trusts only that origin", () => {
    let h = initialHandshake();
    expect(trusts(h, "http://a")).toBe(false);
    h = acceptInit(h, "http://a", { type: "lst:setMode", mode: "draw" }, ["http://a"]);
    expect(h.state).toBe("waiting");
    h = acceptInit(h, "http://a", { type: "lst:init" }, ["http://a"]);
    expect(h).toEqual({ state: "ready", origin: "http://a" });
    expect(trusts(h, "http://a")).toBe(true);
    expect(trusts(h, "http://b")).toBe(false);
    // A second init from elsewhere cannot re-home the frame.
    expect(acceptInit(h, "http://b", { type: "lst:init" }, ["http://a", "http://b"])).toEqual(h);
  });

  test("init from an origin outside the allowlist is ignored", () => {
    const h = initialHandshake();
    expect(acceptInit(h, "http://evil", { type: "lst:init" }, ["http://a"])).toEqual(h);
    expect(acceptInit(h, "http://a", { type: "lst:init" }, [])).toEqual(h);
    expect(trusts(acceptInit(h, "http://evil", { type: "lst:init" }, ["http://a"]), "http://evil")).toBe(false);
    // The allowlist only gates init; a listed origin still has to send init.
    expect(acceptInit(h, "http://a", { type: "lst:goto", index: 1 }, ["http://a"])).toEqual(h);
  });
});

describe("draft ack and slide binding", () => {
  test("lst:draftSaved decodes; junk shapes do not", () => {
    expect(decodeHostMessage({ type: "lst:draftSaved", id: "abc" })).toEqual({ type: "lst:draftSaved", id: "abc" });
    expect(decodeHostMessage({ type: "lst:draftSaved" })).toBeNull();
  });

  test("slideIndex is accepted absent, null, or a non-negative integer only", () => {
    const base = { strokes: [], comments: [], space: "stage" as const };
    expect(isDraftPayload(base)).toBe(true);
    expect(isDraftPayload({ ...base, slideIndex: null })).toBe(true);
    expect(isDraftPayload({ ...base, slideIndex: 3 })).toBe(true);
    expect(isDraftPayload({ ...base, slideIndex: -1 })).toBe(false);
    expect(isDraftPayload({ ...base, slideIndex: 1.5 })).toBe(false);
    expect(isDraftPayload({ ...base, slideIndex: "2" })).toBe(false);
  });

  test("comment target hints are bounded and shape-checked", () => {
    const base = { strokes: [], comments: [], space: "stage" as const };
    const withTarget = (target: unknown) => ({ ...base, comments: [{ x: 0, y: 0, text: "t", target }] });
    expect(isDraftPayload(withTarget(undefined))).toBe(true);
    expect(isDraftPayload(withTarget({ tag: "h1", classes: ["a"], text: "hi" }))).toBe(true);
    expect(isDraftPayload(withTarget({ tag: "h1", extra: 1 }))).toBe(false);
    expect(isDraftPayload(withTarget({ tag: "x".repeat(600) }))).toBe(false);
    expect(isDraftPayload(withTarget({ classes: "not-an-array" }))).toBe(false);
    expect(isDraftPayload(withTarget([1, 2]))).toBe(false);
  });
});
