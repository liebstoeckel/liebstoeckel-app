import { test, expect, describe, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectDeckTarball, embedSource, extractSource, ejectSource } from "./source-package";

// A minimal deck dir with a `files` allowlist (so pack is deterministic and ignore-clean).
function makeDeck(extra: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "srcpkg-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "fixture-deck", version: "1.0.0", files: ["index.html", "slides"] }),
  );
  writeFileSync(join(dir, "index.html"), "<!doctype html>");
  mkdirSync(join(dir, "slides"));
  writeFileSync(join(dir, "slides", "01.tsx"), "export default () => null\n");
  for (const [rel, content] of Object.entries(extra)) {
    const p = join(dir, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
  }
  return dir;
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const cleanups: string[] = [];
const track = (d: string) => (cleanups.push(d), d);
afterEach(() => {
  while (cleanups.length) rmSync(cleanups.pop()!, { recursive: true, force: true });
});

describe("collectDeckTarball", () => {
  test("packs allowlisted source, repacks zstd, lists deck-relative paths", async () => {
    const dir = track(makeDeck());
    const { gzip, zstd, files } = await collectDeckTarball(dir);
    expect(files).toEqual(expect.arrayContaining(["package.json", "index.html", "slides/01.tsx"]));
    expect(gzip.length).toBeGreaterThan(0);
    expect(zstd.length).toBeGreaterThan(0);
    // zstd payload round-trips to the same tar the gzip carries
    expect(sameBytes(Bun.zstdDecompressSync(zstd), Bun.gunzipSync(gzip))).toBe(true);
  });

  test("deterministic across runs (pack's fixed mtime + deterministic zstd)", async () => {
    const dir = track(makeDeck());
    const a = await collectDeckTarball(dir);
    const b = await collectDeckTarball(dir);
    expect(sameBytes(a.zstd, b.zstd)).toBe(true);
  });

  test("the .env allowlist keeps a stray secret out by construction", async () => {
    // .env is NOT in `files`, so pack never ships it → no gate violation, no leak.
    const dir = track(makeDeck({ ".env": "TOKEN=sk-live-abcdefghijklmnopqrstuvwxyz" }));
    const { files } = await collectDeckTarball(dir);
    expect(files).not.toContain(".env");
  });

  test("fail-closed gate: a secret in an allowlisted file aborts (overridable)", async () => {
    const dir = track(makeDeck());
    // sneak a private key into an allowlisted slide
    writeFileSync(join(dir, "slides", "02.tsx"), "// -----BEGIN OPENSSH PRIVATE KEY-----\n");
    await expect(collectDeckTarball(dir)).rejects.toThrow(/likely secrets/);
    // explicit override lets it through
    const { files } = await collectDeckTarball(dir, { allowSecret: true });
    expect(files).toContain("slides/02.tsx");
  });
});

describe("embed / extract / eject round-trip", () => {
  test("embedSource is inert and recoverable; eject restores the source tree", async () => {
    const dir = track(makeDeck());
    const { zstd } = await collectDeckTarball(dir);
    const html = embedSource("<!doctype html><body><div>deck</div></body></html>", zstd);
    // recoverable
    expect(extractSource(html)).not.toBeNull();

    const out = track(mkdtempSync(join(tmpdir(), "ejected-")));
    rmSync(out, { recursive: true, force: true }); // eject into a fresh path
    const written = await ejectSource(html, out);
    expect(written).toEqual(expect.arrayContaining(["package.json", "index.html", "slides/01.tsx"]));
    expect(existsSync(join(out, "slides", "01.tsx"))).toBe(true);
    expect(readFileSync(join(out, "slides", "01.tsx"), "utf8")).toContain("export default");
  });

  test("eject errors clearly when the HTML carries no source package", async () => {
    const out = track(mkdtempSync(join(tmpdir(), "ejected-")));
    await expect(ejectSource("<!doctype html><body></body></html>", out)).rejects.toThrow(
      /no embedded source package/,
    );
  });

  test("extractSource is null for plain HTML", () => {
    expect(extractSource("<html><body>nothing</body></html>")).toBeNull();
  });
});
