import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
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

  test("remove with a pid leaves another process's server.json alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "lst-dev-info-"));
    writeServerInfo(dir, { port: 4321, token: "t" });
    removeServerInfo(dir, process.pid + 1);
    expect(readServerInfo(dir)).toEqual({ port: 4321, token: "t" });
    removeServerInfo(dir, process.pid);
    expect(readServerInfo(dir)).toBeNull();
  });
});

describe("batch order", () => {
  test("batchesAfter lists later dispatches, oldest first; unknown or undated batches yield nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lst-dev-order-"));
    writeFileSync(join(dir, "main.tsx"), "x\n");
    const backend = createLocalBackend({ deckDir: dir, token: "t" });
    backend.takeSnapshot("b1", ["main.tsx"]);
    await Bun.sleep(2);
    backend.takeSnapshot("b2", ["main.tsx"]);
    await Bun.sleep(2);
    backend.takeSnapshot("b3", ["main.tsx"]);
    expect(backend.batchesAfter("b1")).toEqual(["b2", "b3"]);
    expect(backend.batchesAfter("b3")).toEqual([]);
    expect(backend.batchesAfter("nope")).toEqual([]);
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

  test("a reported path under a skipped dir (dev state, deps, VCS) is never recorded as created", () => {
    const dir = mkdtempSync(join(tmpdir(), "lst-dev-created-"));
    writeFileSync(join(dir, "main.tsx"), "x\n");
    mkdirSync(join(dir, "node_modules"), { recursive: true });
    writeFileSync(join(dir, "node_modules", "dep.js"), "dep\n");
    const backend = createLocalBackend({ deckDir: dir, token: "t" });
    backend.takeSnapshot("b1", ["main.tsx"]);
    // server.json lives under .liebstoeckel/dev, outside the existence record.
    writeServerInfo(dir, { port: 1, token: "t" });
    backend.recordCreated("b1", [".liebstoeckel/dev/server.json", "node_modules/dep.js"]);
    backend.restoreSnapshot("b1");
    expect(readServerInfo(dir)).not.toBeNull();
    expect(existsSync(join(dir, "node_modules", "dep.js"))).toBe(true);
  });

  test("a source file the batch created but never reported is removed on revert; a non-source file stays", () => {
    const dir = mkdtempSync(join(tmpdir(), "lst-dev-unreported-"));
    mkdirSync(join(dir, "slides"), { recursive: true });
    writeFileSync(join(dir, "main.tsx"), "slides={[A]}\n");
    const backend = createLocalBackend({ deckDir: dir, token: "t" });
    backend.takeSnapshot("b1", ["main.tsx"]);
    // The agent creates a slide and an asset, then gives up with an error
    // reply: nothing is reported, but the reply seals the created set.
    writeFileSync(join(dir, "slides", "07-half.mdx"), "# half\n");
    writeFileSync(join(dir, "slides", "chart.png"), Buffer.from([0x89]));
    writeFileSync(join(dir, "main.tsx"), "slides={[A, Half]}\n");
    backend.recordCreated("b1", []);
    const result = backend.restoreSnapshot("b1")!;
    expect(result.restored.sort()).toEqual(["main.tsx", "slides/07-half.mdx"]);
    expect(result.failures).toEqual([]);
    expect(existsSync(join(dir, "slides", "07-half.mdx"))).toBe(false);
    expect(existsSync(join(dir, "slides", "chart.png"))).toBe(true);
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

  test("a source file the user adds after the batch resolved is not the batch's: revert leaves it alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "lst-dev-later-"));
    mkdirSync(join(dir, "slides"), { recursive: true });
    writeFileSync(join(dir, "main.tsx"), "slides={[A]}\n");
    const backend = createLocalBackend({ deckDir: dir, token: "t" });
    backend.takeSnapshot("b1", ["main.tsx"]);
    writeFileSync(join(dir, "slides", "02-agent.mdx"), "# agent\n");
    writeFileSync(join(dir, "main.tsx"), "slides={[A, B]}\n");
    backend.recordCreated("b1", ["main.tsx"]);
    // Half an hour later the user writes a slide by hand, then reverts b1.
    writeFileSync(join(dir, "slides", "12-closing.mdx"), "# mine\n");
    const result = backend.restoreSnapshot("b1")!;
    expect(result.restored.sort()).toEqual(["main.tsx", "slides/02-agent.mdx"]);
    expect(existsSync(join(dir, "slides", "02-agent.mdx"))).toBe(false);
    expect(readFileSync(join(dir, "slides", "12-closing.mdx"), "utf-8")).toBe("# mine\n");
  });

  test("a batch that never got a reply restores its snapshot but deletes nothing", () => {
    const dir = mkdtempSync(join(tmpdir(), "lst-dev-noreply-"));
    mkdirSync(join(dir, "slides"), { recursive: true });
    writeFileSync(join(dir, "main.tsx"), "slides={[A]}\n");
    const backend = createLocalBackend({ deckDir: dir, token: "t" });
    backend.takeSnapshot("b1", ["main.tsx"]);
    writeFileSync(join(dir, "slides", "02-new.mdx"), "# new\n");
    writeFileSync(join(dir, "main.tsx"), "slides={[A, B]}\n");
    const result = backend.restoreSnapshot("b1")!;
    expect(result.restored).toEqual(["main.tsx"]);
    expect(existsSync(join(dir, "slides", "02-new.mdx"))).toBe(true);
  });

  test("a reported path that leaves the deck through a symlink is never deleted", () => {
    const outside = mkdtempSync(join(tmpdir(), "lst-dev-outside-"));
    writeFileSync(join(outside, "theme.css"), "ORIGINAL\n");
    const dir = mkdtempSync(join(tmpdir(), "lst-dev-symlink-"));
    writeFileSync(join(dir, "main.tsx"), "x\n");
    symlinkSync(outside, join(dir, "shared"), "dir");
    const backend = createLocalBackend({ deckDir: dir, token: "t" });
    backend.takeSnapshot("b1", ["main.tsx"]);
    // The agent edits the linked theme and reports it; the link was never in
    // the existence record, so without the real-path check it would look created.
    writeFileSync(join(dir, "shared", "theme.css"), "EDITED\n");
    backend.recordCreated("b1", ["shared/theme.css"]);
    const result = backend.restoreSnapshot("b1")!;
    expect(result.restored).toEqual([]);
    expect(readFileSync(join(outside, "theme.css"), "utf-8")).toBe("EDITED\n");
  });
});

