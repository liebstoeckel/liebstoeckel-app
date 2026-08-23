import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalBackend, loadStore, readServerInfo, removeServerInfo, saveStore, writeServerInfo } from "./local-backend";
import { type AnnotationEntry, emptyStore, upsertEntry } from "./store";

function entry(id: string): AnnotationEntry {
  return {
    id,
    slide: { index: 0, sourceFile: "slides/01-title.mdx" },
    comments: [],
    strokes: [],
    screenshot: null,
    status: "open",
    batchId: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("store io", () => {
  test("load missing file yields empty store; save/load round-trips", () => {
    const dir = mkdtempSync(join(tmpdir(), "lst-dev-store-"));
    expect(loadStore(dir).entries).toEqual({});
    const store = upsertEntry(emptyStore(), entry("a"));
    saveStore(dir, store);
    expect(loadStore(dir)).toEqual(store);
  });
});

describe("server info", () => {
  test("write/read/remove", () => {
    const dir = mkdtempSync(join(tmpdir(), "lst-dev-info-"));
    expect(readServerInfo(dir)).toBeNull();
    writeServerInfo(dir, { port: 4321, token: "t" });
    expect(readServerInfo(dir)).toEqual({ port: 4321, token: "t" });
    removeServerInfo(dir);
    expect(readServerInfo(dir)).toBeNull();
  });
});

describe("backend", () => {
  test("token auth from query or body; screenshots land under the dev dir", () => {
    const dir = mkdtempSync(join(tmpdir(), "lst-dev-backend-"));
    const backend = createLocalBackend({ deckDir: dir, token: "secret" });
    expect(backend.authorize(new URL("http://x/__dev/state?token=secret"))).toBe(true);
    expect(backend.authorize(new URL("http://x/__dev/state"), { token: "secret" })).toBe(true);
    expect(backend.authorize(new URL("http://x/__dev/state?token=nope"))).toBe(false);
    const name = backend.writeScreenshot("abc", new Uint8Array([1, 2, 3]));
    expect(name).toBe("abc.png");
    const ref = backend.screenshotRef(name);
    expect(ref).toBe(join(dir, ".liebstoeckel", "dev", "screenshots", "abc.png"));
    expect(existsSync(ref)).toBe(true);
    expect([...readFileSync(ref)]).toEqual([1, 2, 3]);
    expect(backend.restoreSnapshot("missing")).toBeNull();
  });
});
