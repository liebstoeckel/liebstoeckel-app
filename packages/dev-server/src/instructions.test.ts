import { describe, expect, test } from "bun:test";
import { instructionsForEvent } from "./instructions";

describe("instructionsForEvent", () => {
  test("apply carries the real batch id, files, and deck dir", () => {
    const text = instructionsForEvent({
      type: "apply",
      id: "batch42",
      deckDir: "/decks/demo",
      annotations: [
        {
          id: "e1",
          slide: { index: 0, sourceFile: "slides/01-title.mdx" },
          comments: [],
          strokes: [],
          screenshotPath: "/decks/demo/.liebstoeckel/dev/screenshots/e1.png",
        },
      ],
    })!;
    expect(text).toContain("--reply batch42 done");
    expect(text).toContain("slides/01-title.mdx");
    expect(text).toContain("/decks/demo");
    expect(text).toContain("screenshotPath");
  });

  test("apply without resolved sources points at the slides array", () => {
    const text = instructionsForEvent({
      type: "apply",
      id: "b",
      deckDir: "/d",
      annotations: [{ id: "e1", slide: { index: 3, sourceFile: null }, comments: [], strokes: [], screenshotPath: null }],
    })!;
    expect(text).toContain("slides array");
    expect(text).not.toContain("screenshotPath");
  });

  test("timeout and exit are covered; unknown types are not", () => {
    expect(instructionsForEvent({ type: "timeout" })).toContain("poll again");
    expect(instructionsForEvent({ type: "exit" })).toContain("stop polling");
    expect(instructionsForEvent({ type: "mystery" })).toBeUndefined();
  });
});

describe("slide requests", () => {
  test("a request yields the create-and-register step; marks-only batches keep the edit step", async () => {
    const { applyInstructions } = await import("./instructions");
    const base = { id: "b1", type: "apply" as const, deckDir: "/deck" };
    const withRequest = applyInstructions({
      ...base,
      annotations: [
        { id: "q", kind: "add-slide", request: { after: -1, description: "an agenda" }, slide: { index: 0, sourceFile: null }, comments: [], strokes: [], screenshotPath: null },
      ],
    });
    expect(withRequest).toContain("as the first slide");
    expect(withRequest).toContain("an agenda");
    expect(withRequest).toContain("index 0");
    expect(withRequest).not.toContain("Edit the slide source directly");
    const marksOnly = applyInstructions({
      ...base,
      annotations: [{ id: "a", slide: { index: 1, sourceFile: "slides/02.mdx" }, comments: [{ x: 0, y: 0, text: "t" }], strokes: [], screenshotPath: null }],
    });
    expect(marksOnly).toContain("Edit the slide source directly: slides/02.mdx");
    expect(marksOnly).not.toContain("Slide request");
  });
});

