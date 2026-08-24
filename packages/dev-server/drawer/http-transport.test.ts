import { describe, expect, test } from "bun:test";
import { type EventStream, sharedEvents } from "./http-transport";

class FakeStream implements EventStream {
  onmessage: ((event: MessageEvent) => void) | null = null;
  closed = false;
  close(): void {
    this.closed = true;
  }
  push(msg: unknown): void {
    this.onmessage?.(new MessageEvent("message", { data: typeof msg === "string" ? msg : JSON.stringify(msg) }));
  }
}

function harness() {
  const opened: FakeStream[] = [];
  const subscribe = sharedEvents(() => {
    const s = new FakeStream();
    opened.push(s);
    return s;
  });
  return { opened, subscribe };
}

describe("sharedEvents", () => {
  test("one stream fans out to every listener", () => {
    const { opened, subscribe } = harness();
    const a: unknown[] = [];
    const b: unknown[] = [];
    const offA = subscribe((m) => a.push(m));
    const offB = subscribe((m) => b.push(m));
    expect(opened).toHaveLength(1);
    opened[0]!.push({ type: "annotation_updated" });
    expect(a).toEqual([{ type: "annotation_updated" }]);
    expect(b).toEqual([{ type: "annotation_updated" }]);
    offA();
    opened[0]!.push({ type: "connected" });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(2);
    expect(opened[0]!.closed).toBe(false);
    offB();
    expect(opened[0]!.closed).toBe(true);
  });

  test("reopens after the last listener left, and unsubscribe is idempotent", () => {
    const { opened, subscribe } = harness();
    const off = subscribe(() => {});
    off();
    off();
    expect(opened[0]!.closed).toBe(true);
    subscribe(() => {});
    expect(opened).toHaveLength(2);
    expect(opened[1]!.closed).toBe(false);
  });

  test("exit is delivered, then the stream closes for good", () => {
    const { opened, subscribe } = harness();
    const seen: unknown[] = [];
    subscribe((m) => seen.push(m));
    opened[0]!.push({ type: "exit" });
    expect(seen).toEqual([{ type: "exit" }]);
    expect(opened[0]!.closed).toBe(true);
    // A later subscriber (a re-mounting component) does not start a reconnect loop.
    subscribe((m: unknown) => seen.push(m));
    expect(opened).toHaveLength(1);
  });

  test("malformed frames are dropped", () => {
    const { opened, subscribe } = harness();
    const seen: unknown[] = [];
    subscribe((m: unknown) => seen.push(m));
    opened[0]!.push("{not json");
    opened[0]!.push("42");
    opened[0]!.push({ type: "ok" });
    expect(seen).toEqual([{ type: "ok" }]);
  });
});
