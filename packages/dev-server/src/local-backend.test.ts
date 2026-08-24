import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

describe("recordCreated", () => {
  test("files that did not exist at dispatch become created; revert deletes them and restores the rest", () => {
    const dir = mkdtempSync(join(tmpdir(), "lst-dev-created-"));
    mkdirSync(join(dir, "slides"), { recursive: true });
    writeFileSync(join(dir, "main.tsx"), "slides={[A]}\n");
    const backend = createLocalBackend({ deckDir: dir, token: "t" });
    backend.takeSnapshot("b1", ["main.tsx"]);
    // The "agent" creates a slide and edits the entry.
    writeFileSync(join(dir, "slides", "02-new.mdx"), "# new\n");
    writeFileSync(join(dir, "main.tsx"), "slides={[A, B]}\n");
    backend.recordCreated("b1", ["slides/02-new.mdx", "main.tsx", "../outside.txt"]);
    const result = backend.restoreSnapshot("b1")!;
    expect(result.restored.sort()).toEqual(["main.tsx", "slides/02-new.mdx"]);
    expect(existsSync(join(dir, "slides", "02-new.mdx"))).toBe(false);
    expect(readFileSync(join(dir, "main.tsx"), "utf-8")).toBe("slides={[A]}\n");
  });

  test("a pre-existing file the agent edited is restored, never deleted, even when attribution found nothing", () => {
    const dir = mkdtempSync(join(tmpdir(), "lst-dev-edited-"));
    mkdirSync(join(dir, "slides"), { recursive: true });
    writeFileSync(join(dir, "slides", "03.mdx"), "ORIGINAL\n");
    writeFileSync(join(dir, "logo.png"), Buffer.from([0x89, 0x50]));
    const backend = createLocalBackend({ deckDir: dir, token: "t" });
    // Empty reference list: every annotation had sourceFile null.
    backend.takeSnapshot("b1", []);
    writeFileSync(join(dir, "slides", "03.mdx"), "EDITED\n");
    writeFileSync(join(dir, "logo.png"), Buffer.from([0x00]));
    backend.recordCreated("b1", ["slides/03.mdx", "logo.png"]);
    const result = backend.restoreSnapshot("b1")!;
    expect(result.restored).toEqual(["slides/03.mdx"]);
    expect(readFileSync(join(dir, "slides", "03.mdx"), "utf-8")).toBe("ORIGINAL\n");
    // Binary files are not snapshotted, but they existed, so revert leaves them alone.
    expect(existsSync(join(dir, "logo.png"))).toBe(true);
  });
});

