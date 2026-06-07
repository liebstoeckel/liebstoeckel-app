import { test, expect, describe } from "bun:test";
import { thumbSettings, classifyTargetPath, isHelp } from "./cli";

describe("isHelp", () => {
  test("detects -h / --help anywhere in argv", () => {
    expect(isHelp(["--help"])).toBe(true);
    expect(isHelp(["-h"])).toBe(true);
    expect(isHelp([".", "--help"])).toBe(true); // cli.ts injects a positional before flags
    expect(isHelp(["deck.html", "--port", "3000"])).toBe(false);
    expect(isHelp([])).toBe(false);
  });
});

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
    expect(thumbSettings(["deck"]).enabled).toBe(true);
  });

  test("--no-thumbnails opts out", () => {
    expect(thumbSettings(["deck", "--no-thumbnails"]).enabled).toBe(false);
  });

  test("passes through format/width/quality/scale", () => {
    const s = thumbSettings(["deck", "--format", "jpeg", "--width", "320", "--quality", "70", "--scale", "1"]);
    expect(s).toMatchObject({ enabled: true, format: "jpeg", width: 320, quality: 70, scale: 1 });
  });

  test("ignores an unknown format and non-numeric sizes", () => {
    const s = thumbSettings(["deck", "--format", "gif", "--width", "wide"]);
    expect(s.format).toBeUndefined();
    expect(s.width).toBeUndefined();
  });
});
