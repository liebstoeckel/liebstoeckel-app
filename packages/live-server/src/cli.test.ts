import { test, expect, describe } from "bun:test";
import { thumbSettings, classifyTargetPath } from "./cli";

describe("classifyTargetPath", () => {
  test("recognizes html files, project dirs, and package.json", () => {
    expect(classifyTargetPath("/x/deck.html", false)).toBe("html");
    expect(classifyTargetPath("/x/deck.HTM", false)).toBe("html");
    expect(classifyTargetPath("/x/proj", true)).toBe("project");
    expect(classifyTargetPath("/x/package.json", false)).toBe("project");
    expect(classifyTargetPath("/x/notes.md", false)).toBe("unknown");
  });
});

describe("thumbSettings", () => {
  test("thumbnails are on by default", () => {
    expect(thumbSettings({}).enabled).toBe(true);
  });

  test("--no-thumbnails (thumbnails: false) opts out", () => {
    expect(thumbSettings({ thumbnails: false }).enabled).toBe(false);
  });

  test("passes through format/width/quality/scale", () => {
    const s = thumbSettings({ format: "jpeg", width: "320", quality: "70", scale: "1" });
    expect(s).toMatchObject({ enabled: true, format: "jpeg", width: 320, quality: 70, scale: 1 });
  });

  test("ignores an unknown format and non-numeric sizes", () => {
    const s = thumbSettings({ format: "gif", width: "wide" });
    expect(s.format).toBeUndefined();
    expect(s.width).toBeUndefined();
  });
});
