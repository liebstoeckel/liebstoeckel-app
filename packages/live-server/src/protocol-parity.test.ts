import { expect, test } from "bun:test";
import { LIVE_CLOSE, LIVE_PROTOCOL as CLIENT_PROTOCOL } from "@liebstoeckel/engine";
import { CLOSE, LIVE_PROTOCOL } from "./placement/protocol";

// The engine keeps its own copy of the live contract (it cannot import this
// package, which depends on it); the two must never drift apart.
test("the browser client's close codes are the servers'", () => {
  expect(LIVE_CLOSE).toEqual(CLOSE);
});

test("the browser client speaks a protocol the servers accept", () => {
  expect(CLIENT_PROTOCOL).toBeGreaterThanOrEqual(LIVE_PROTOCOL.min);
  expect(CLIENT_PROTOCOL).toBeLessThanOrEqual(LIVE_PROTOCOL.max);
});
