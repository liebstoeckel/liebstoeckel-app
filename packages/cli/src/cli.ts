#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { scaffold } from "./new";

const HELP = `liebstoeckel — code-first presentations

usage:
  liebstoeckel new <name> [--brand <brand>] [--dir <parent>] [--no-org-brand]   scaffold a new deck as ./<name> (or under --dir)
  liebstoeckel add [<category>] <name>... [--dir <deck>] [--dry] [--force] [--json]   scaffold registry items (chart, hook, …) into a deck as owned source
  liebstoeckel registry list|view <name> [--json]   browse the chart/component registry (JSON for agents)
  liebstoeckel build [dir|--dir <deck>] [--no-inline-package] [--check]   build a deck (default: cwd) → one self-contained .html (+ thumbnails)
  liebstoeckel eject <deck.html> [outdir] [--force]   recover a built deck's editable source
  liebstoeckel pack [dir|--dir <deck>] [-o <file.tgz>] [--allow-secret]   inspect/emit the source a build embeds (default: cwd)
  liebstoeckel licenses [deck.html|dir|--dir <deck>] [--json] [--check]   report third-party licenses bundled into a deck (--check fails on non-standard licenses)
  liebstoeckel live [deck|dir|--dir <deck>] [opts]   present live (default: cwd; LAN, or --relay <url> --relay-token <tok>)
  liebstoeckel relay [opts]                    run a public relay (--port, --tokens, --public-url)
  liebstoeckel thumbs <deck.html> [opts]       (re)generate thumbnails for a built deck
  liebstoeckel export [deck.html|dir|--dir <deck>] [opts]   export slides (default: cwd) to PNG or PDF (--format, --slides 1,3,5-7, -o)
  liebstoeckel skill install|update [--target all] [--dir <deck>]   install/refresh the agent skill (SKILL.md + AGENTS.md) for deck authoring

cloud (coming soon — the hosted service is not generally available yet):
  liebstoeckel login --api <https://app-host>   sign in to liebstoeckel cloud (device flow)
  liebstoeckel push <deck.html> [--title <t>] [--name <key>] [--new] [--org <slug>]   upload/update a deck (re-push = new version)
  liebstoeckel orgs [use <slug>]               list your workspaces / set the default org for \`push\`
  liebstoeckel decks [--org <slug>]            list your cloud decks (with view counts) in an org
  liebstoeckel brand list|push <file>|pull [name]   share org brands: push/pull theme token sets (registry, (internal ADR))

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

/** The deck a command acts on ((internal ADR)): a leading positional, else `--dir
 *  <deck>`, else the current directory. Returns the deck and argv with the
 *  consumed token removed (other flags + their values pass through untouched). */
function resolveDeck(argv: string[]): { dir: string; rest: string[] } {
  if (argv[0] && !argv[0].startsWith("-")) return { dir: argv[0], rest: argv.slice(1) };
  const i = argv.indexOf("--dir");
  if (i >= 0 && argv[i + 1]) {
    return { dir: argv[i + 1]!, rest: [...argv.slice(0, i), ...argv.slice(i + 2)] };
  }
  return { dir: ".", rest: argv };
}

async function runNew(argv: string[]) {
  const name = argv.find((a) => !a.startsWith("-"));
  if (!name) {
    console.error("usage: liebstoeckel new <name> [--brand <brand>] [--dir <parent>] [--no-org-brand]");
    process.exit(1);
  }
  try {
    const { dir, files } = await scaffold(name, {
      brand: flag(argv, "--brand"),
      dir: flag(argv, "--dir"),
      noOrgBrand: has(argv, "--no-org-brand"),
    });
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
  const { dir } = resolveDeck(argv);
  const prev = process.cwd();
  process.chdir(resolve(dir)); // resolve(".") = cwd, so the default is a no-op
  try {
    // `--check`: validate the deck bundles (no artifact, no thumbnails) and report
    // structured diagnostics for an agent's fix loop ((internal ADR)).
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
      inlineLicenses: !has(argv, "--no-inline-licenses"),
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
  const dir = resolve(resolveDeck(argv).dir);
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

async function runLicenses(argv: string[]) {
  const json = has(argv, "--json") || !process.stdout.isTTY;
  const check = has(argv, "--check");
  const { dir, rest } = resolveDeck(argv);

  // A built deck.html already carries its notices — print the embedded block
  // (no rebuild). `--check` is not meaningful here: the block is rendered text, not the
  // structured report, so license gating needs the deck source instead.
  if (looksLikeDeck(dir) && /\.html?$/i.test(dir)) {
    if (check) {
      console.error(`✕ --check needs the deck source directory (it recomputes the bundle); a built .html carries only the rendered notices.\n  try: liebstoeckel licenses <deck-dir> --check`);
      process.exit(1);
    }
    const { extractLicenses } = await import("@liebstoeckel/engine/build/licenses");
    const notices = extractLicenses(await Bun.file(resolve(dir)).text());
    if (!notices) {
      console.error(`✕ no embedded license notices in ${dir} (built with --no-inline-licenses or an older build)`);
      process.exit(1);
    }
    if (json) console.log(JSON.stringify({ source: "embedded", notices }, null, 2));
    else console.log(notices);
    return;
  }

  // Otherwise resolve the deck dir and compute the report from its real module graph.
  const prev = process.cwd();
  process.chdir(resolve(dir));
  try {
    const { collectDeckLicenses } = await import("@liebstoeckel/engine/build");
    const report = await collectDeckLicenses({ entry: "./index.html" });
    const ok = report.flagged.length === 0;
    if (json) {
      console.log(JSON.stringify({ ok, ...report }, null, 2));
    } else {
      console.log(`\nthird-party licenses bundled into this deck (${report.packages.length} packages):\n`);
      for (const p of report.packages) {
        const mark = report.flagged.some((f) => f.name === p.name && f.version === p.version) ? " ⚠" : "";
        console.log(`  ${`${p.name}@${p.version}`.padEnd(40)} ${p.license}${mark}`);
      }
      if (report.firstParty.length) console.log(`\n  + ${report.firstParty.length} liebstoeckel package(s) — MPL-2.0`);
      if (!ok) {
        console.error(`\n⚠ ${report.flagged.length} non-standard license(s) — review before distributing:`);
        for (const f of report.flagged) console.error(`    ${f.name}@${f.version}  ${f.license}`);
      } else {
        console.log(`\n✓ all bundled licenses are standard permissive / embeddable.`);
      }
    }
    if (check && !ok) process.exit(1);
  } finally {
    process.chdir(prev);
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  // Best-effort reminders (stderr-only; off for --json/pipes/CI, see update.ts):
  // a cached "new CLI version" note and a "deck skill older than the CLI" note.
  try {
    const { updateReminder, skillReminder } = await import("./update");
    await updateReminder(rest);
    await skillReminder(flag(rest, "--dir") ?? ".", rest);
  } catch {
    // reminders must never break a command
  }
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
    case "orgs":
      return (await import("./cloud")).runOrgs(rest);
    case "decks":
      return (await import("./cloud")).runDecks(rest);
    case "brand":
      return (await import("./cloud")).runBrand(rest);
    case "build":
      return runBuild(rest);
    case "eject":
      return runEject(rest);
    case "pack":
      return runPack(rest);
    case "licenses":
      return runLicenses(rest);
    case "live": {
      // Resolve the deck (positional | --dir | cwd) and pass it as the positional
      // the live runner expects ((internal ADR)).
      const { dir, rest: r } = resolveDeck(rest);
      return (await import("@liebstoeckel/live-server/cli")).runLive([dir, ...r]);
    }
    case "relay":
      return (await import("@liebstoeckel/present-relay/cli")).runRelay(rest);
    case "thumbs":
      return (await import("@liebstoeckel/thumbnails/cli")).runThumbs(rest);
    case "export": {
      const { dir, rest: r } = resolveDeck(rest);
      return (await import("@liebstoeckel/thumbnails/cli")).runExport([dir, ...r]);
    }
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
