import { describe, expect, test } from "bun:test";
import { repeatGate } from "./repeat-gate";

describe("repeatGate", () => {
  test("logs a repeated message once per interval, with the count held back", () => {
    let t = 0;
    const gate = repeatGate(60_000, () => t);
    expect(gate("403 forbidden")).toEqual({ log: true, held: 0 });
    for (let i = 0; i < 11; i++) {
      t += 5_000;
      expect(gate("403 forbidden").log).toBe(false);
    }
    t += 5_000;
    expect(gate("403 forbidden")).toEqual({ log: true, held: 11 });
  });

  test("a different message passes at once", () => {
    let t = 0;
    const gate = repeatGate(60_000, () => t);
    gate("403 forbidden");
    t += 5_000;
    expect(gate("503 unavailable")).toEqual({ log: true, held: 0 });
  });
});
