import { describe, expect, test } from "bun:test";
import * as Y from "yjs";
import { applyTree, filesMap, readTree, setFile } from "./doc.ts";
import { isSyncPath, treeProblem } from "./sources.ts";

describe("live document", () => {
  test("applyTree adds, edits and removes files", () => {
    const doc = new Y.Doc();
    applyTree(doc, { "a.mdx": "one\ntwo\n", "b.mdx": "b\n" });
    applyTree(doc, { "a.mdx": "one\nTWO\n", "c.mdx": "c\n" });
    expect(readTree(doc)).toEqual({ "a.mdx": "one\nTWO\n", "c.mdx": "c\n" });
  });

  test("edits keep a relative position outside the change", () => {
    const doc = new Y.Doc();
    setFile(doc, "a.mdx", "alpha\nbeta\ngamma\n");
    const text = filesMap(doc).get("a.mdx")!;
    // A collaborator's cursor at the start of "gamma".
    const cursor = Y.createRelativePositionFromTypeIndex(text, 11);
    setFile(doc, "a.mdx", "ALPHA\nbeta\ngamma\n");
    const abs = Y.createAbsolutePositionFromRelativePosition(cursor, doc)!;
    expect(text.toString().slice(abs.index)).toBe("gamma\n");
  });

  test("two documents converge after exchanging updates", () => {
    const a = new Y.Doc();
    setFile(a, "s.mdx", "hello\nworld\n");
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    setFile(a, "s.mdx", "Hello\nworld\n");
    setFile(b, "s.mdx", "hello\nWorld\n");
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(readTree(a)).toEqual({ "s.mdx": "Hello\nWorld\n" });
    expect(readTree(b)).toEqual(readTree(a));
  });
});

describe("source paths", () => {
  test("accepts normalized source paths", () => {
    expect(isSyncPath("slides/01-intro.tsx")).toBe(true);
    expect(isSyncPath("index.html")).toBe(true);
  });

  test("rejects escapes, skipped dirs and binaries", () => {
    for (const p of ["../x.ts", "/etc/passwd.txt", "a//b.ts", "./a.ts", "node_modules/x.js", ".git/config.txt", "a\\b.ts", "img.png", ".liebstoeckel/sync.json", "Makefile"]) {
      expect(isSyncPath(p)).toBe(false);
    }
  });

  test("treeProblem flags bad trees", () => {
    expect(treeProblem({ "a.mdx": "x" })).toBeNull();
    expect(treeProblem({ "../a.mdx": "x" })).toContain("not a source path");
  });
});

describe("docProblem", () => {
  test("accepts a clean deck and rejects bad entries", async () => {
    const { docProblem } = await import("./doc.ts");
    const ok = new Y.Doc();
    setFile(ok, "slides/a.mdx", "x");
    expect(docProblem(ok)).toBeNull();
    const badPath = new Y.Doc();
    setFile(badPath, "../x.mdx", "x");
    expect(docProblem(badPath)).toContain("not a source path");
    const notText = new Y.Doc();
    (notText.getMap("files") as Y.Map<unknown>).set("a.mdx", "plain string");
    expect(docProblem(notText)).toContain("not text");
    const extra = new Y.Doc();
    extra.getMap("other");
    expect(docProblem(extra)).toContain("unexpected shared type");
  });
});
