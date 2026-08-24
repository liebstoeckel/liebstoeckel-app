import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serverInfoPath } from "./paths";

// `dev --dir <elsewhere>` re-execs itself with the deck as cwd (Bun reads the
// deck's bunfig.toml from the process cwd). The child is the real server, so
// a signal aimed at the parent alone must take the child down with it.

function makeDeck(): string {
  const dir = mkdtempSync(join(tmpdir(), "lst-dev-cli-"));
  // A dependency-free deck: the HTML pipeline bundles it without any packages.
  writeFileSync(join(dir, "index.html"), '<html><body><script type="module" src="./main.ts"></script></body></html>');
  writeFileSync(join(dir, "main.ts"), "console.log('deck');\n");
  return dir;
}

describe("dev --dir re-exec", () => {
  test("SIGTERM to the parent stops the child server and removes server.json", async () => {
    const deck = makeDeck();
    const elsewhere = mkdtempSync(join(tmpdir(), "lst-dev-cwd-"));
    mkdirSync(elsewhere, { recursive: true });
    const proc = Bun.spawn([process.execPath, join(import.meta.dir, "cli.ts"), "--dir", deck, "--port", "0", "--json"], {
      cwd: elsewhere,
      stdout: "pipe",
      stderr: "pipe",
    });
    let out = "";
    const drain = (async () => {
      for await (const chunk of proc.stdout) out += new TextDecoder().decode(chunk);
    })();
    try {
      const deadline = Date.now() + 60_000;
      let info: { url?: string } | undefined;
      while (!info && Date.now() < deadline) {
        const line = out.split("\n").find((l) => l.startsWith("{"));
        if (line) info = JSON.parse(line);
        else await Bun.sleep(100);
      }
      if (!info?.url) throw new Error(`no startup JSON; output:\n${out}`);
      expect(JSON.parse(await (await fetch(`${info.url}/__dev/ping`)).text())).toEqual({ ok: true });
      expect(existsSync(serverInfoPath(deck))).toBe(true);

      proc.kill("SIGTERM");
      await proc.exited;
      // The child had 300ms of shutdown grace; give it a little more.
      let gone = false;
      for (let i = 0; i < 50 && !gone; i++) {
        await Bun.sleep(100);
        gone = await fetch(`${info.url}/__dev/ping`).then(() => false, () => true);
      }
      expect(gone).toBe(true);
      expect(existsSync(serverInfoPath(deck))).toBe(false);
    } finally {
      proc.kill();
      await drain.catch(() => {});
    }
  }, 90_000);
});
