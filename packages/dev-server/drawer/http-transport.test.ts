import { describe, expect, test } from "bun:test";
import { type EventStream, sharedEvents } from "./http-transport";

class FakeStream implements EventStream {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = 1;
  closed = false;
  close(): void {
    this.closed = true;
  }
  /** Simulate the browser's reaction to a response status: a non-OK response
   *  moves the source to CLOSED before onerror; a dropped connection stays
   *  CONNECTING (0) and retries on its own. */
  fail(readyState: number): void {
    this.readyState = readyState;
    this.onerror?.(new Event("error"));
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

  test("a closed stream (a 401 after a restart) is reported once and never reopened", () => {
    const { opened, subscribe } = harness();
    const seen: unknown[] = [];
    subscribe((m) => seen.push(m));
    opened[0]!.fail(2);
    expect(seen).toEqual([{ type: "stream_closed" }]);
    expect(opened[0]!.closed).toBe(true);
    subscribe((m: unknown) => seen.push(m));
    expect(opened).toHaveLength(1);
  });

  test("a reconnecting stream (a dropped connection) is not reported", () => {
    const { opened, subscribe } = harness();
    const seen: unknown[] = [];
    subscribe((m) => seen.push(m));
    opened[0]!.fail(0);
    expect(seen).toEqual([]);
    expect(opened[0]!.closed).toBe(false);
  });
});
