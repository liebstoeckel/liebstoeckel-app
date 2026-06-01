#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { scaffold } from "./new";

const HELP = `liebstoeckel — code-first presentations

usage:
  liebstoeckel new <name> [--brand <brand>]   scaffold a new deck under ./presentations
  liebstoeckel add [<category>] <name>... [--dir <deck>] [--dry] [--force] [--json]   scaffold registry items (charts, …) into a deck as owned source
  liebstoeckel registry list|view <name> [--json]   browse the chart/component registry (JSON for agents)
  liebstoeckel build [dir] [--no-inline-package] [--check]   build a deck → one self-contained .html (+ thumbnails)
  liebstoeckel eject <deck.html> [outdir] [--force]   recover a built deck's editable source
  liebstoeckel pack [dir] [-o <file.tgz>] [--allow-secret]   inspect/emit the source a build embeds
  liebstoeckel live <deck|dir> [opts]          present live (LAN, or --relay <url> --relay-token <tok>)
  liebstoeckel relay [opts]                    run a public relay (--port, --tokens, --public-url)
  liebstoeckel thumbs <deck.html> [opts]       (re)generate thumbnails for a built deck
  liebstoeckel export <deck.html|dir> [opts]   export slides to PNG or PDF (--format, --slides 1,3,5-7, -o)
  liebstoeckel skill install [--target all] [--dir <deck>]   install the agent skill (SKILL.md + AGENTS.md) for deck authoring
  liebstoeckel login --api <https://app-host>   sign in to liebstoeckel cloud (device flow)
  liebstoeckel push <deck.html> [--title <t>]   upload a built deck to your cloud dashboard

  liebstoeckel <deck|dir> [opts]               shorthand for \`liebstoeckel live <deck>\`

  (alias: \`lst\` — e.g. \`lst build\`, \`lst new deck\`)
`;

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

const has = (argv: string[], name: string): boolean => argv.includes(name);

const looksLikeDeck = (s: string | undefined): boolean =>
  !!s && (/\.html?$/i.test(s) || existsSync(resolve(s)));

async function runNew(argv: string[]) {
  const name = argv.find((a) => !a.startsWith("-"));
  if (!name) {
    console.error("usage: liebstoeckel new <name> [--brand <brand>]");
    process.exit(1);
  }
  try {
    const { dir, files } = await scaffold(name, { brand: flag(argv, "--brand") });
    console.log(`\n✓ created deck "${name}" → ${dir}\n`);
    for (const f of files) console.log(`   ${f}`);
    console.log(`\n   next:`);
    console.log(`     bun install`);
    console.log(`     liebstoeckel live ${dir}      # or: bun --cwd ${dir} run dev\n`);
  } catch (e) {
    console.error(`✕ ${(e as Error).message}`);
    process.exit(1);
  }
}

async function runBuild(argv: string[]) {
  const target = argv.find((a) => !a.startsWith("-"));
  const prev = process.cwd();
  if (target) process.chdir(resolve(target));
  try {
    // `--check`: validate the deck bundles (no artifact, no thumbnails) and report
    // structured diagnostics for an agent's fix loop (ADR 0045).
    if (has(argv, "--check")) {
      const { checkDeck } = await import("@liebstoeckel/engine/build");
      const { ok, diagnostics } = await checkDeck({ entry: "./index.html" });
      const json = has(argv, "--json") || !process.stdout.isTTY;
      if (json) {
        console.log(JSON.stringify({ ok, diagnostics }, null, 2));
      } else if (ok) {
        console.log("✓ deck builds (check passed)");
      } else {
        for (const d of diagnostics) {
          const loc = d.file ? ` ${d.file}${d.line ? `:${d.line}` : ""}` : "";
          console.error(`✕${loc} ${d.message}`);
        }
      }
      if (!ok) process.exit(1);
      return;
    }

    const { buildDeck } = await import("@liebstoeckel/thumbnails/build");
    await buildDeck({
      entry: "./index.html",
      outdir: "./dist",
      inlinePackage: !has(argv, "--no-inline-package"),
      allowSecret: has(argv, "--allow-secret"),
    });
  } finally {
    process.chdir(prev);
  }
}

async function runEject(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith("-"));
  const htmlPath = positional[0];
  if (!htmlPath) {
    console.error("usage: liebstoeckel eject <deck.html> [outdir] [--force]");
    process.exit(1);
  }
  const outDir = positional[1] ?? resolve(basename(htmlPath).replace(/\.html?$/i, "") + "-source");
  const { ejectSource } = await import("@liebstoeckel/engine/build/source-package");
  try {
    const html = await Bun.file(resolve(htmlPath)).text();
    const written = await ejectSource(html, resolve(outDir), { force: has(argv, "--force") });
    console.log(`\n✓ ejected ${written.length} files → ${outDir}\n`);
    for (const f of written) console.log(`   ${f}`);
    console.log(`\n   rebuild (untrusted deck? keep --ignore-scripts):`);
    console.log(`     cd ${outDir} && bun install --ignore-scripts && bun run build\n`);
  } catch (e) {
    console.error(`✕ ${(e as Error).message}`);
    process.exit(1);
  }
}

async function runPack(argv: string[]) {
  const dir = resolve(argv.find((a) => !a.startsWith("-")) ?? ".");
  const out = flag(argv, "-o");
  const { collectDeckTarball } = await import("@liebstoeckel/engine/build/source-package");
  try {
    const { gzip, files } = await collectDeckTarball(dir, { allowSecret: has(argv, "--allow-secret") });
    if (out) {
      // pack's native gzip — `bun add ./<file>.tgz`-installable (zstd is embed-only).
      await Bun.write(resolve(out), gzip);
      console.log(`\n✓ wrote ${files.length}-file source package → ${out}  (gzip; bun add-compatible)\n`);
    } else {
      console.log(`\nsource package (${files.length} files) — what a build would embed:\n`);
    }
    for (const f of files) console.log(`   ${f}`);
    console.log();
  } catch (e) {
    console.error(`✕ ${(e as Error).message}`);
    process.exit(1);
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "new":
      return runNew(rest);
    case "add":
      return (await import("./add")).runAdd(rest);
    case "registry":
      return (await import("./registry")).runRegistry(rest);
    case "skill":
      return (await import("./skill")).runSkill(rest);
    case "login":
      return (await import("./cloud")).runLogin(rest);
    case "push":
      return (await import("./cloud")).runPush(rest);
    case "build":
      return runBuild(rest);
    case "eject":
      return runEject(rest);
    case "pack":
      return runPack(rest);
    case "live":
      return (await import("@liebstoeckel/live-server/cli")).runLive(rest);
    case "relay":
      return (await import("@liebstoeckel/present-relay/cli")).runRelay(rest);
    case "thumbs":
      return (await import("@liebstoeckel/thumbnails/cli")).runThumbs(rest);
    case "export":
      return (await import("@liebstoeckel/thumbnails/cli")).runExport(rest);
    case undefined:
    case "-h":
    case "--help":
      console.log(HELP);
      return;
    default:
      // shorthand: `liebstoeckel <deck>` → live
      if (looksLikeDeck(cmd)) {
        return (await import("@liebstoeckel/live-server/cli")).runLive([cmd!, ...rest]);
      }
      console.error(`unknown command: ${cmd}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

if (import.meta.main) void main();
