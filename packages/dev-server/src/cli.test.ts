import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

describe("dev with a bundler plugin that does not resolve", () => {
  test("serves an error page for the deck, stays up, and mounts the deck once the plugin appears", async () => {
    const deck = makeDeck();
    writeFileSync(join(deck, "bunfig.toml"), '[serve.static]\nplugins = ["./plugins/missing-plugin.ts"]\n');
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
      expect(info.pluginProblems?.map((p) => p.plugin)).toEqual(["./plugins/missing-plugin.ts"]);
      expect(err).toContain('plugin "./plugins/missing-plugin.ts"');
      expect(err).toContain("bun install");
      // An agent on `dev poll` hears it too, with the fix.
      const status = await devPoll(deck);
      expect(status).toMatchObject({ type: "plugin_status", ok: false, problems: [{ plugin: "./plugins/missing-plugin.ts" }] });
      expect(String(status.fix)).toContain("bun install");

      const token = JSON.parse(readFileSync(serverInfoPath(deck), "utf-8")).token as string;
      const page = await fetch(`${info.url}/deck/${token}/`);
      expect(page.status).toBe(503);
      expect(await page.text()).toContain("./plugins/missing-plugin.ts");
      // The process is still there: the dev UI and the protocol keep answering.
      expect((await fetch(`${info.url}/`)).status).toBe(200);
      expect(JSON.parse(await (await fetch(`${info.url}/__dev/ping`)).text())).toEqual({ ok: true });
      expect(await (await fetch(`${info.url}/deck/${token}/__plugins`)).json()).toMatchObject({ ok: false });

      // Fix the install: the status turns ok and the deck route serves the deck.
      mkdirSync(join(deck, "plugins"), { recursive: true });
      writeFileSync(join(deck, "plugins", "missing-plugin.ts"), "export default { name: 'noop', setup() {} };\n");
      // No browser needed: a waiting poll resolves the plugins again and reports it.
      expect(await devPoll(deck)).toMatchObject({ type: "plugin_status", ok: true, problems: [] });
      expect(await (await fetch(`${info.url}/deck/${token}/__plugins`)).json()).toMatchObject({ ok: true });
      const deckPage = await fetch(`${info.url}/deck/${token}/`);
      expect(deckPage.status).toBe(200);
      expect(await deckPage.text()).toContain("<script");
      expect((await fetch(`${info.url}/__dev/ping`)).status).toBe(200);
    } finally {
      proc.kill();
      await proc.exited;
      await drain.catch(() => {});
    }
  }, 90_000);
});
