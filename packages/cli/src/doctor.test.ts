import { describe, expect, test } from "bun:test";
import { buildReport } from "./doctor";

describe("buildReport", () => {
  test("bun.ok reflects whether the version satisfies the range", () => {
    expect(buildReport({ bunVersion: "1.3.14", bunRange: ">=1.3", chromium: null }).bun.ok).toBe(true);
    expect(buildReport({ bunVersion: "1.2.12", bunRange: ">=1.3", chromium: null }).bun.ok).toBe(false);
  });

  test("chromium.ok is true only when a path resolved", () => {
    expect(buildReport({ bunVersion: "1.3.0", bunRange: ">=1.3", chromium: "/usr/bin/chromium" }).chromium).toEqual({
      path: "/usr/bin/chromium",
      ok: true,
    });
    expect(buildReport({ bunVersion: "1.3.0", bunRange: ">=1.3", chromium: null }).chromium).toEqual({
      path: null,
      ok: false,
    });
  });
});
