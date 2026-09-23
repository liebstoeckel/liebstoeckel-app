import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Y from "yjs";
import { LiveMirror, listSourcePaths } from "./live-mirror.ts";
import { type SyncClient, applyTree, readTree, setFile } from "./sync.ts";
import { Awareness } from "y-protocols/awareness";

const dirs: string[] = [];
const mirrors: LiveMirror[] = [];
afterEach(() => {
  for (const m of mirrors.splice(0)) m.stop();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A mirror over a local document, standing in for a connected client. */
function setup(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "live-mirror-"));
  dirs.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  const doc = new Y.Doc();
  applyTree(doc, files);
  const client = { doc, awareness: new Awareness(doc) } as unknown as SyncClient;
  const lines: string[] = [];
  const mirror = new LiveMirror({ dir, client, pollMs: 60_000, log: (l) => lines.push(l) });
  mirrors.push(mirror);
  mirror.start();
  return { dir, doc, mirror, lines };
}

const read = (dir: string, path: string) => readFileSync(join(dir, path), "utf8");

describe("LiveMirror", () => {
  test("writes remote edits, new files and deletions to disk", () => {
    const { dir, doc, lines } = setup({ "slides/a.mdx": "one\n", "b.mdx": "b\n" });
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    setFile(remote, "slides/a.mdx", "ONE\n");
    setFile(remote, "slides/new.mdx", "new\n");
    remote.getMap("files").delete("b.mdx");
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(doc)), "remote");
    expect(read(dir, "slides/a.mdx")).toBe("ONE\n");
    expect(read(dir, "slides/new.mdx")).toBe("new\n");
    expect(existsSync(join(dir, "b.mdx"))).toBe(false);
    expect(lines.some((l) => l.startsWith("slides/a.mdx changed"))).toBe(true);
  });

  test("sends local changes as edits and does not echo its own writes", () => {
    const { dir, doc, mirror } = setup({ "a.mdx": "alpha\nbeta\n" });
    const updates: unknown[] = [];
    doc.on("update", (_u, origin) => updates.push(origin));
    writeFileSync(join(dir, "a.mdx"), "alpha\nBETA\n");
    writeFileSync(join(dir, "c.tsx"), "export {}\n");
    writeFileSync(join(dir, "image.png"), "binary");
    mirror.poll();
    expect(readTree(doc)).toEqual({ "a.mdx": "alpha\nBETA\n", "c.tsx": "export {}\n" });
    const count = updates.length;
    mirror.poll();
    expect(updates.length).toBe(count);
  });

  test("merges when the file and the document both moved", () => {
    const { dir, doc, mirror } = setup({ "a.mdx": "1\n2\n3\n4\n5\n" });
    writeFileSync(join(dir, "a.mdx"), "ONE\n2\n3\n4\n5\n");
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    setFile(remote, "a.mdx", "1\n2\n3\n4\nFIVE\n");
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(doc)), "remote");
    mirror.poll();
    expect(read(dir, "a.mdx")).toBe("ONE\n2\n3\n4\nFIVE\n");
    expect(readTree(doc)["a.mdx"]).toBe("ONE\n2\n3\n4\nFIVE\n");
  });

  test("a local deletion removes the file from the document", () => {
    const { dir, doc, mirror } = setup({ "a.mdx": "a\n", "b.mdx": "b\n" });
    rmSync(join(dir, "b.mdx"));
    mirror.poll();
    expect(readTree(doc)).toEqual({ "a.mdx": "a\n" });
  });

  test("listSourcePaths skips dependencies, dev state and binaries", () => {
    const { dir } = setup({ "a.mdx": "a\n" });
    mkdirSync(join(dir, "node_modules/x"), { recursive: true });
    writeFileSync(join(dir, "node_modules/x/i.js"), "");
    mkdirSync(join(dir, ".liebstoeckel"), { recursive: true });
    writeFileSync(join(dir, ".liebstoeckel/sync.json"), "{}");
    writeFileSync(join(dir, "pic.png"), "");
    expect(listSourcePaths(dir)).toEqual(["a.mdx"]);
  });
});

describe("LiveMirror safety", () => {
  test("an oversized local file is left alone, not deleted from the document", () => {
    const { dir, doc, mirror, lines } = setup({ "data.json": "{}\n" });
    writeFileSync(join(dir, "data.json"), "x".repeat(600 * 1024));
    mirror.poll();
    expect(readTree(doc)).toEqual({ "data.json": "{}\n" });
    expect(lines.some((l) => l.includes("not synced"))).toBe(true);
  });

  test("when both changed the same lines, other remote hunks survive", () => {
    const { dir, doc, mirror } = setup({ "a.mdx": "1\n2\n3\n4\n5\n" });
    writeFileSync(join(dir, "a.mdx"), "1\nLOCAL\n3\n4\n5\n");
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    setFile(remote, "a.mdx", "1\nREMOTE\n3\n4\nFIVE\n");
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(doc)), "remote");
    mirror.poll();
    expect(read(dir, "a.mdx")).toBe("1\nLOCAL\n3\n4\nFIVE\n");
  });
});
