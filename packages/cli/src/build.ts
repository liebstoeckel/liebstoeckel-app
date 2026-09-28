// `liebstoeckel build|eject|pack|licenses`, the deck build/inspect commands.
// Heavy engine/thumbnails modules are imported lazily inside each `run` so the
// umbrella pays for them only when the command is actually invoked.
import { defineCommand } from "citty";
import { resolve, basename, join } from "node:path";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { looksLikeDeck } from "./targeting";
import { ensureBuildTrust } from "./trust";
import { CliError, reporting, usageError, wantsJson, withLogToStderr } from "./output";

/** Deck targeting ((internal ADR)): a leading positional, else `--dir`, else cwd. */
const deckDir = (args: { deck?: string; dir?: string }): string => args.deck ?? args.dir ?? ".";

/** Gate a build behind first-time trust: building a deck runs its build-time code on this
 *  machine (Bun macros, build plugins) with full FS/network access. Decks scaffolded here
 *  pass silently; an unfamiliar one is confirmed once (or pre-approved via `--trust` /
 *  `LIEBSTOECKEL_TRUST_BUILD=1`). Non-interactive without approval refuses, fail-closed.
 *  Throws an `untrusted_deck` failure on a no. */
async function gateBuildTrust(dir: string, trustFlag: boolean | undefined): Promise<void> {
  const abs = resolve(dir);
  const preapproved = trustFlag === true || process.env.LIEBSTOECKEL_TRUST_BUILD === "1";
  const interactive = !!process.stdin.isTTY && !!process.stdout.isTTY;
  const ok = await ensureBuildTrust(abs, {
    preapproved,
    confirm: interactive
      ? (d) => {
          console.error(
            `\n⚠ Building a deck runs its code on your machine.\n` +
              `  A liebstoeckel deck is real code: building it executes the deck's build-time\n` +
              `  modules (Bun macros, build plugins) with full access to your files and network.\n` +
              `  Only build decks you trust.\n\n  Deck: ${d}`,
          );
          // Bun's confirm() reads a yes/no from the TTY; defaults to no on empty/EOF.
          return confirm("  Trust this deck and build it?");
        }
      : undefined,
  });
  if (ok) return;
  if (interactive) throw new CliError("build aborted: deck not trusted", { code: "untrusted_deck" });
  // Non-interactive: frame trust as a HUMAN decision, never a flag to self-apply. An agent
  // reads stdout and stderr alike, and one that adds the approval flag on its own has
  // bypassed the gate, so neither the error nor the hint names it (the docs and
  // `build --help` do, for the human).
  throw new CliError("untrusted deck", {
    code: "untrusted_deck",
    hint:
      `building runs this deck's code on this machine; trusting it is a decision for a human who has ` +
      `reviewed ${abs}, not for an agent to make on its own (see \`liebstoeckel build --help\`)`,
  });
}

/** Best-effort scan of a deck's source for speaker notes. Notes are compiled into the
 *  built .html and are NOT hidden from a live audience, so the author deserves a heads-up.
 *  Prunes node_modules/dist/dot-dirs and stops at the first hit. */
async function deckHasSpeakerNotes(dir: string): Promise<boolean> {
  const NOTES = /export\s+(?:const|let|var|function)\s+notes\b|^\s*notes\s*:/m;
  const SKIP = new Set(["node_modules", "dist", ".git"]);
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    let entries: Dirent[];
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP.has(e.name) && !e.name.startsWith(".")) stack.push(join(d, e.name));
        continue;
      }
      if (/\.(mdx?|tsx?|jsx?)$/.test(e.name)) {
        try {
          if (NOTES.test(await Bun.file(join(d, e.name)).text())) return true;
        } catch {
          /* ignore unreadable file */
        }
      }
    }
  }
  return false;
}

async function warnIfSpeakerNotes(dir: string): Promise<void> {
  if (await deckHasSpeakerNotes(dir)) {
    console.error(
      `⚠ This deck includes speaker notes. Speaker notes are bundled into the built\n` +
        `  .html and are NOT hidden from a live audience — anyone with the viewer link\n` +
        `  can read them. Don't put confidential content in speaker notes.`,
    );
  }
}

/** The `--visual` report: lint findings, or why the pass was skipped. */
interface VisualLintReport {
  skipped?: string;
  count: number;
  findings: import("@liebstoeckel/thumbnails").VisualFinding[];
}

/** Bundle the deck (cwd) to a temp dir with embeds off, render it headless, and
 *  lint every slide for cut-off/overflowing text. Skips (never fails) when no
 *  Chromium is available, mirroring the thumbnails policy. */
async function runVisualLint(json: boolean): Promise<VisualLintReport> {
  const { hasChromium, lintDeckHtml } = await import("@liebstoeckel/thumbnails");
  if (!hasChromium()) {
    return {
      skipped: "no Chromium (run `liebstoeckel doctor --install-chromium` or set LIEBSTOECKEL_CHROMIUM)",
      count: 0,
      findings: [],
    };
  }
  const { bundleDeck } = await import("@liebstoeckel/engine/build");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const outdir = await mkdtemp(join(tmpdir(), "lst-visual-"));
  // The lint bundle is throwaway: no source/license embeds, and its progress
  // prose stays off stdout in JSON mode (single machine-readable object).
  const realLog = console.log;
  if (json) console.log = (...a: unknown[]) => console.error(...a);
  try {
    await bundleDeck({ entry: "./index.html", outdir, outfile: "lint.html", inlinePackage: false, inlineLicenses: false });
    const html = await Bun.file(join(outdir, "lint.html")).text();
    const { count, findings } = await lintDeckHtml(html);
    return { count, findings };
  } finally {
    console.log = realLog;
    await rm(outdir, { recursive: true, force: true });
  }
}

export const buildCommand = defineCommand({
  meta: {
    name: "build",
    description: "build a deck → one self-contained .html (+ thumbnails)",
  },
  args: {
    deck: { type: "positional", required: false, description: "deck directory (default: cwd)", valueHint: "dir" },
    dir: { type: "string", description: "deck directory (alternative to the positional)", valueHint: "deck" },
    "inline-package": {
      type: "boolean",
      default: true,
      description: "embed the recoverable source package",
      negativeDescription: "do not embed the source package",
    },
    "inline-licenses": {
      type: "boolean",
      default: true,
      description: "embed third-party license notices",
      negativeDescription: "do not embed license notices",
    },
    "allow-secret": { type: "boolean", description: "allow packing files outside the deck's `files` allowlist" },
    check: { type: "boolean", description: "validate the deck bundles without writing an artifact" },
    visual: {
      type: "boolean",
      description: "with --check: also render headless and lint for cut-off text and overflowing containers (needs Chromium)",
    },
    trust: {
      type: "boolean",
      description: "trust this deck's build-time code (a deck is code; remembered after the first build)",
    },
    json: { type: "boolean", description: "machine-readable JSON output (default when piped)" },
  },
  run({ args }) {
    const dir = deckDir(args);
    // JSON output is requested explicitly or whenever stdout isn't a TTY (agent contract).
    const json = wantsJson(args.json);
    return reporting(json, () => runBuild(dir, args, json));
  },
});

async function runBuild(
  dir: string,
  args: { check?: boolean; visual?: boolean; trust?: boolean; inlinePackage?: boolean; inlineLicenses?: boolean; allowSecret?: boolean },
  json: boolean,
): Promise<void> {
  // Building runs the deck's build-time code on this machine, so confirm trust first.
  await gateBuildTrust(dir, args.trust);
  const prev = process.cwd();
  process.chdir(resolve(dir)); // resolve(".") = cwd, so the default is a no-op
  try {
    // `--check`: validate the deck bundles (no artifact, no thumbnails) and report
    // structured diagnostics for an agent's fix loop. `--visual` adds a
    // headless render pass that lints every slide for cut-off/overflowing text.
    if (args.check) {
      const { checkDeck } = await import("@liebstoeckel/engine/build");
      const { ok, diagnostics } = await withLogToStderr(json, () => checkDeck({ entry: "./index.html" }));
      const visual = ok && args.visual ? await runVisualLint(json) : undefined;
      const allOk = ok && (visual == null || visual.skipped != null || visual.findings.length === 0);
      if (json) {
        console.log(JSON.stringify({ ok: allOk, diagnostics, ...(visual ? { visual } : {}) }, null, 2));
      } else {
        if (ok) console.log("✓ deck builds (check passed)");
        else {
          for (const d of diagnostics) {
            const loc = d.file ? ` ${d.file}${d.line ? `:${d.line}` : ""}` : "";
            console.error(`✕${loc} ${d.message}`);
          }
        }
        if (visual) {
          if (visual.skipped) {
            console.log(`- visual lint skipped: ${visual.skipped}`);
          } else if (visual.findings.length === 0) {
            console.log(`✓ visual lint clean (${visual.count} slides)`);
          } else {
            console.error(`⚠ visual lint: ${visual.findings.length} finding(s) across ${visual.count} slides`);
            for (const f of visual.findings) {
              console.error(`  slide[${f.slide}] ${f.kind} "${f.text}": ${f.detail}  (${f.path})`);
            }
          }
        }
      }
      if (!allOk) process.exit(1);
      return;
    }
    if (args.visual) throw usageError("--visual is a lint pass on --check", "run: liebstoeckel build --check --visual");

    await warnIfSpeakerNotes(".");
    const { buildDeck } = await import("@liebstoeckel/thumbnails/build");
    const { cliVersion } = await import("./skill");
    // In JSON mode stdout must be a single machine-readable object, so route the
    // build's human progress prose (✓ built…, license/source/thumbnail notes) to
    // stderr for the duration and print the structured result to stdout at the end.
    const generator = { name: "cli", version: await cliVersion() };
    const result = await withLogToStderr(json, async () => {
      try {
        return await buildDeck({
          entry: "./index.html",
          outdir: "./dist",
          inlinePackage: args.inlinePackage !== false,
          inlineLicenses: args.inlineLicenses !== false,
          allowSecret: !!args.allowSecret,
          generator,
        });
      } catch (err) {
        throw new CliError(err instanceof Error ? err.message : String(err), { code: "build_failed" });
      }
    });
    if (json) {
      console.log(
        JSON.stringify({
          ok: true,
          artifact: resolve(result.artifact),
          outfile: result.outfile,
          thumbnails: result.thumbnails,
          ...(result.thumbnailsSkipped ? { thumbnailsSkipped: result.thumbnailsSkipped } : {}),
        }),
      );
    }
  } finally {
    process.chdir(prev);
  }
}

export const ejectCommand = defineCommand({
  meta: {
    name: "eject",
    description: "recover a built deck's editable source",
  },
  args: {
    deck: { type: "positional", required: false, description: "built deck .html", valueHint: "deck.html" },
    outdir: { type: "positional", required: false, description: "output directory", valueHint: "outdir" },
    force: { type: "boolean", description: "overwrite an existing output directory" },
  },
  run({ args }) {
    return reporting(false, () => runEject(args));
  },
});

async function runEject(args: { deck?: string; outdir?: string; force?: boolean }): Promise<void> {
  const htmlPath = args.deck;
  if (!htmlPath) throw usageError("no deck given: liebstoeckel eject <deck.html> [outdir] [--force]");
  const outDir = args.outdir ?? resolve(basename(htmlPath).replace(/\.html?$/i, "") + "-source");
  const { ejectSource } = await import("@liebstoeckel/engine/build/source-package");
  try {
    const html = await Bun.file(resolve(htmlPath)).text();
    const written = await ejectSource(html, resolve(outDir), { force: !!args.force });
    console.log(`\n✓ ejected ${written.length} files → ${outDir}\n`);
    for (const f of written) console.log(`   ${f}`);
    // Rebuilding runs the deck's own build-time code (macros/build plugins);
    // `--ignore-scripts` only blocks npm lifecycle scripts, not that, so the real
    // control is to rebuild only decks you trust. `liebstoeckel build` confirms it once.
    console.log(`\n   rebuild (runs the deck's code; only rebuild decks you trust):`);
    console.log(`     cd ${outDir} && bun install --ignore-scripts && liebstoeckel build`);
    // An ejected deck isn't trusted yet, so the first rebuild asks you to confirm. Frame
    // that as a human decision, deliberately NOT "just add --trust", which trains an agent
    // to self-approve a deck it didn't write (the exact bypass the gate exists to prevent).
    console.log(`   the first rebuild asks you to confirm trust: that's a human decision, not one for an agent.\n`);
  } catch (e) {
    throw new CliError((e as Error).message, { code: "eject_failed" });
  }
}

export const packCommand = defineCommand({
  meta: {
    name: "pack",
    description: "inspect/emit the source a build embeds (default: cwd)",
  },
  args: {
    deck: { type: "positional", required: false, description: "deck directory (default: cwd)", valueHint: "dir" },
    dir: { type: "string", description: "deck directory (alternative to the positional)", valueHint: "deck" },
    out: { type: "string", alias: "o", description: "write the source package to this .tgz", valueHint: "file.tgz" },
    "allow-secret": { type: "boolean", description: "allow packing files outside the deck's `files` allowlist" },
    json: { type: "boolean", description: "machine-readable JSON output (default when piped)" },
  },
  run({ args }) {
    const json = wantsJson(args.json);
    return reporting(json, () => runPack(args, json));
  },
});

async function runPack(args: { deck?: string; dir?: string; out?: string; allowSecret?: boolean }, json: boolean): Promise<void> {
  const dir = resolve(deckDir(args));
  const out = args.out;
  // A clean "this isn't a deck" beats leaking the underlying `bun pm pack` error
  // ("package.json must have name and version") for the common wrong-directory mistake.
  if (!existsSync(join(dir, "index.html"))) {
    throw new CliError(`no deck here: ${dir}`, {
      code: "not_a_deck",
      hint: "run this in a deck directory (one with an index.html), or pass --dir <deck>",
    });
  }
  const { collectDeckTarball } = await import("@liebstoeckel/engine/build/source-package");
  try {
    const { gzip, files } = await withLogToStderr(json, () => collectDeckTarball(dir, { allowSecret: !!args.allowSecret }));
    if (out) await Bun.write(resolve(out), gzip);
    if (json) {
      console.log(JSON.stringify({ dir, files, out: out ? resolve(out) : null }));
      return;
    }
    if (out) {
      // pack's native gzip, `bun add ./<file>.tgz`-installable (zstd is embed-only).
      console.log(`\n✓ wrote ${files.length}-file source package → ${out}  (gzip; bun add-compatible)\n`);
    } else {
      console.log(`\nsource package (${files.length} files), what a build would embed:\n`);
    }
    for (const f of files) console.log(`   ${f}`);
    console.log();
  } catch (e) {
    if (e instanceof CliError) throw e;
    throw new CliError((e as Error).message, { code: "pack_failed" });
  }
}

export const licensesCommand = defineCommand({
  meta: {
    name: "licenses",
    description: "report third-party licenses bundled into a deck",
  },
  args: {
    deck: { type: "positional", required: false, description: "built deck .html or deck dir (default: cwd)", valueHint: "deck.html|dir" },
    dir: { type: "string", description: "deck directory (alternative to the positional)", valueHint: "deck" },
    json: { type: "boolean", description: "machine-readable JSON output (default when piped)" },
    check: { type: "boolean", description: "fail on non-standard licenses (needs the deck source dir)" },
    trust: {
      type: "boolean",
      description: "trust this deck's build-time code (recomputing from source runs it; remembered)",
    },
  },
  run({ args }) {
    const json = wantsJson(args.json);
    return reporting(json, () => runLicenses(args, json));
  },
});

async function runLicenses(args: { deck?: string; dir?: string; check?: boolean; trust?: boolean }, json: boolean): Promise<void> {
  const check = !!args.check;
  const dir = deckDir(args);

  // A built deck.html already carries its notices, print the embedded block
  // (no rebuild). `--check` is not meaningful here: the block is rendered text, not the
  // structured report, so license gating needs the deck source instead.
  if (looksLikeDeck(dir) && /\.html?$/i.test(dir)) {
    if (check) {
      throw usageError(
        "--check needs the deck source directory (it recomputes the bundle); a built .html carries only the rendered notices",
        "try: liebstoeckel licenses <deck-dir> --check",
      );
    }
    if (!existsSync(resolve(dir))) throw new CliError(`no such deck file: ${dir}`, { code: "not_found" });
    const { extractLicenses } = await import("@liebstoeckel/engine/build/licenses");
    const notices = extractLicenses(await Bun.file(resolve(dir)).text());
    if (!notices) {
      throw new CliError(`no embedded license notices in ${dir}`, {
        code: "no_notices",
        hint: "it was built with --no-inline-licenses or by an older version; run licenses on the deck source directory instead",
      });
    }
    if (json) console.log(JSON.stringify({ source: "embedded", notices }, null, 2));
    else console.log(notices);
    return;
  }

  // Otherwise resolve the deck dir and compute the report from its real module graph;
  // this runs the deck's build-time code, so it's behind the same trust gate as `build`.
  await gateBuildTrust(dir, args.trust);
  const prev = process.cwd();
  process.chdir(resolve(dir));
  try {
    const { collectDeckLicenses } = await import("@liebstoeckel/engine/build");
    const report = await withLogToStderr(json, () => collectDeckLicenses({ entry: "./index.html" }));
    const ok = report.flagged.length === 0;
    if (json) {
      console.log(JSON.stringify({ ok, ...report }, null, 2));
    } else {
      console.log(`\nthird-party licenses bundled into this deck (${report.packages.length} packages):\n`);
      for (const p of report.packages) {
        const mark = report.flagged.some((f) => f.name === p.name && f.version === p.version) ? " ⚠" : "";
        console.log(`  ${`${p.name}@${p.version}`.padEnd(40)} ${p.license}${mark}`);
      }
      if (report.firstParty.length) console.log(`\n  + ${report.firstParty.length} liebstoeckel package(s), MPL-2.0`);
      if (!ok) {
        console.error(`\n⚠ ${report.flagged.length} non-standard license(s), review before distributing:`);
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
