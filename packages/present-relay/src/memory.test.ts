import { describe, expect, test } from "bun:test";
import { containerMemoryLimit, memoryRoom } from "./memory";

describe("containerMemoryLimit", () => {
  test("reads cgroup v2", () => {
    expect(containerMemoryLimit(() => "536870912\n")).toBe(536870912);
  });
  test("no limit (v2 'max', v1 huge) and no cgroup read as none", () => {
    expect(containerMemoryLimit(() => "max\n")).toBeUndefined();
    expect(containerMemoryLimit(() => "9223372036854771712")).toBeUndefined();
    expect(
      containerMemoryLimit(() => {
        throw new Error("ENOENT");
      }),
    ).toBeUndefined();
  });
});

describe("memoryRoom", () => {
  test("says no at the ceiling and yes again below it, reading at most once per period", () => {
    let rss = 100;
    let reads = 0;
    let t = 0;
    const room = memoryRoom(200, { rss: () => (reads++, rss), now: () => t, everyMs: 1000 });
    expect(room()).toBe(true);
    rss = 250;
    expect(room()).toBe(true); // still the cached reading
    expect(reads).toBe(1);
    t = 1000;
    expect(room()).toBe(false);
    rss = 150;
    t = 2000;
    expect(room()).toBe(true);
    expect(reads).toBe(3);
  });
  test("without a ceiling there is always room", () => {
    expect(memoryRoom(undefined)()).toBe(true);
  });
});
