import { test, expect } from "bun:test";
import { AudienceCounter } from "./audience";

/** A counter on a hand-driven clock, recording what it announces. */
function counter(everyMs = 1000) {
  let now = 10_000;
  const sent: number[] = [];
  const c = new AudienceCounter((n) => sent.push(n), everyMs, () => now);
  return { c, sent, advance: (ms: number) => (now += ms) };
}

test("the first change goes out at once, later ones at most once a window, ending on the latest", async () => {
  const { c, sent } = counter(40);
  c.join();
  expect(sent).toEqual([1]);
  c.join();
  c.join();
  c.leave();
  expect(sent).toEqual([1]);
  // the real timer fires after the window; the clock stub does not move, so it waits 40 ms
  await Bun.sleep(80);
  expect(sent).toEqual([1, 2]);
  c.destroy();
});

test("a count back where the last message left it sends nothing", async () => {
  const { c, sent, advance } = counter(30);
  c.join();
  c.join();
  c.leave();
  advance(50);
  await Bun.sleep(60);
  expect(sent).toEqual([1]);
  c.destroy();
});

test("peak is the most connections at once; leave never goes below zero", () => {
  const { c } = counter();
  c.join();
  c.join();
  c.join();
  c.leave();
  c.leave();
  c.join();
  expect(c.n).toBe(2);
  expect(c.peak).toBe(3);
  c.leave();
  c.leave();
  c.leave();
  expect(c.n).toBe(0);
  expect(c.peak).toBe(3);
  c.destroy();
});

test("destroy stops a pending message", async () => {
  const { c, sent } = counter(30);
  c.join();
  c.join();
  c.destroy();
  await Bun.sleep(60);
  expect(sent).toEqual([1]);
});
