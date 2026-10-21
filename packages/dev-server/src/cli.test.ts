import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serverInfoPath } from "./paths";

// `dev --dir <elsewhere>` serves the deck from any working directory, and a
// signal to the process stops the server and removes its server.json.

function makeDeck(): string {
  const dir = mkdtempSync(join(tmpdir(), "lst-dev-cli-"));
  // A dependency-free deck: the dev server serves it without any packages.
  writeFileSync(join(dir, "index.html"), '<html><body><script type="module" src="./main.ts"></script></body></html>');
  writeFileSync(join(dir, "main.ts"), "console.log('deck');\n");
  return dir;
}

// Windows has no SIGTERM: killing a process there ends it without running its
// handlers (Ctrl+C in a console arrives as SIGINT instead), so the test cannot run.
const NO_SIGTERM = process.platform === "win32";

describe("dev --dir from elsewhere", () => {
  test.skipIf(NO_SIGTERM)(`SIGTERM stops the server and removes server.json${NO_SIGTERM ? " (skipped: Windows has no SIGTERM)" : ""}`, async () => {
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
      // The server has 300ms of shutdown grace; give it a little more.
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

/** One `liebstoeckel dev poll` run against the deck, parsed. */
async function devPoll(deck: string, timeoutMs = 5_000): Promise<Record<string, unknown>> {
  const proc = Bun.spawn([process.execPath, join(import.meta.dir, "cli.ts"), "poll", "--dir", deck, "--timeout", String(timeoutMs)], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return JSON.parse(out.trim().split("\n").pop()!) as Record<string, unknown>;
}

describe("deck warnings in the dev terminal and dev poll", () => {
  test("a [liebstoeckel] warning the deck reports prints one terminal line and arrives as a deck_log event", async () => {
    const deck = makeDeck();
    const proc = Bun.spawn([process.execPath, join(import.meta.dir, "cli.ts"), "--port", "0", "--json"], {
      cwd: deck,
      stdout: "pipe",
      stderr: "pipe",
    });
    let out = "";
    let err = "";
    const drain = Promise.all([
      (async () => {
        for await (const chunk of proc.stdout) out += new TextDecoder().decode(chunk);
      })(),
      (async () => {
        for await (const chunk of proc.stderr) err += new TextDecoder().decode(chunk);
      })(),
    ]);
    try {
      const deadline = Date.now() + 60_000;
      let info: { url?: string } | undefined;
      while (!info && Date.now() < deadline) {
        const line = out.split("\n").find((l) => l.startsWith("{"));
        if (line) info = JSON.parse(line);
        else await Bun.sleep(100);
      }
      if (!info?.url) throw new Error(`no startup JSON; output:\n${out}\n${err}`);
      const token = JSON.parse(readFileSync(serverInfoPath(deck), "utf-8")).token as string;
      // What the sidebar sends when the deck frame reports the engine's brand check.
      const message = '[liebstoeckel] brand "nocturn" is not defined, so the deck renders without theme tokens. Did you mean "nocturne"?';
      const res = await fetch(`${info.url}/__dev/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, level: "warn", message }),
      });
      expect(res.status).toBe(200);
      const event = await devPoll(deck);
      expect(event).toMatchObject({ type: "deck_log", level: "warn", message: message.replace("[liebstoeckel] ", "") });
      expect(String(event._instructions)).toStartWith("No reply");
      for (let i = 0; i < 50 && !err.includes("deck: brand"); i++) await Bun.sleep(100);
      expect(err).toContain('⚠ deck: brand "nocturn" is not defined');
    } finally {
      proc.kill();
      await proc.exited;
      await drain.catch(() => {});
    }
  }, 90_000);
});

describe("dev with a Bun plugin in bunfig.toml", () => {
  test("serves the deck, names the plugin in the terminal and on dev poll, and says so again once it is removed", async () => {
    const deck = makeDeck();
    writeFileSync(join(deck, "bunfig.toml"), '[serve.static]\nplugins = ["bun-plugin-tailwind", "./plugins/my-plugin.ts"]\n');
    const proc = Bun.spawn([process.execPath, join(import.meta.dir, "cli.ts"), "--port", "0", "--json"], {
      cwd: deck,
      stdout: "pipe",
      stderr: "pipe",
    });
    let out = "";
    let err = "";
    const drain = Promise.all([
      (async () => {
        for await (const chunk of proc.stdout) out += new TextDecoder().decode(chunk);
      })(),
      (async () => {
        for await (const chunk of proc.stderr) err += new TextDecoder().decode(chunk);
      })(),
    ]);
    try {
      const deadline = Date.now() + 60_000;
      let info: { url?: string; pluginProblems?: { plugin: string }[] } | undefined;
      while (!info && Date.now() < deadline) {
        const line = out.split("\n").find((l) => l.startsWith("{"));
        if (line) info = JSON.parse(line);
        else await Bun.sleep(100);
      }
      if (!info?.url) throw new Error(`no startup JSON; output:\n${out}\n${err}`);
      // Only the plugin the scaffold did not write is a problem.
      expect(info.pluginProblems?.map((p) => p.plugin)).toEqual(["./plugins/my-plugin.ts"]);
      expect(err).toContain('plugin "./plugins/my-plugin.ts" is a Bun plugin');
      const status = await devPoll(deck);
      expect(status).toMatchObject({ type: "plugin_status", ok: false, problems: [{ plugin: "./plugins/my-plugin.ts" }] });
      expect(String(status.fix)).toContain("remove it from [serve.static] plugins");

      // The deck is served anyway (the plugin may not have mattered); the page's
      // overlay names the problem.
      const token = JSON.parse(readFileSync(serverInfoPath(deck), "utf-8")).token as string;
      const page = await fetch(`${info.url}/deck/${token}/`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("@lst/runtime.js");

      // Remove the entry: dev poll hears that it is fine now.
      writeFileSync(join(deck, "bunfig.toml"), '[serve.static]\nplugins = ["bun-plugin-tailwind"]\n');
      expect(await devPoll(deck)).toMatchObject({ type: "plugin_status", ok: true, problems: [] });
    } finally {
      proc.kill();
      await proc.exited;
      await drain.catch(() => {});
    }
  }, 90_000);
});
