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

/** Deck targeting ((internal ADR)): a leading positional, else `--dir`, else cwd. */
const deckDir = (args: { deck?: string; dir?: string }): string => args.deck ?? args.dir ?? ".";

/** Gate a build behind first-time trust: building a deck runs its build-time code on this
 *  machine (Bun macros, build plugins) with full FS/network access. Decks scaffolded here
 *  pass silently; an unfamiliar one is confirmed once (or pre-approved via `--trust` /
 *  `LIEBSTOECKEL_TRUST_BUILD=1`). Non-interactive without approval refuses, fail-closed.
 *  Exits the process on a no. */
async function gateBuildTrust(dir: string, trustFlag: boolean | undefined, json = false): Promise<void> {
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
  if (interactive) {
    console.error("✕ build aborted: deck not trusted.");
  } else {
    // Carry the failure + remedy as JSON on stdout when a machine asked for it ((internal ADR)),
    // so an agent learns it must re-run with --trust instead of getting empty output.
    if (json) {
      console.log(
        JSON.stringify({
          ok: false,
          error: "untrusted deck",
          hint: `building runs the deck's code; re-run with --trust (or set LIEBSTOECKEL_TRUST_BUILD=1) if you trust ${abs}`,
        }),
      );
    }
    console.error(
      `✕ refusing to build an untrusted deck non-interactively.\n` +
        `  Building runs the deck's code on this machine — only build decks you trust.\n` +
        `  If you trust ${abs}, re-run with --trust (or set LIEBSTOECKEL_TRUST_BUILD=1).`,
    );
  }
  process.exit(1);
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
    trust: {
      type: "boolean",
      description: "trust this deck's build-time code (a deck is code; remembered after the first build)",
    },
    json: { type: "boolean", description: "machine-readable JSON output (default when piped)" },
  },
  async run({ args }) {
    const dir = deckDir(args);
    // JSON output is requested explicitly or whenever stdout isn't a TTY (agent contract).
    const json = !!args.json || !process.stdout.isTTY;
    // Building runs the deck's build-time code on this machine — confirm trust first.
    await gateBuildTrust(dir, args.trust, json);
    const prev = process.cwd();
    process.chdir(resolve(dir)); // resolve(".") = cwd, so the default is a no-op
    try {
      // `--check`: validate the deck bundles (no artifact, no thumbnails) and report
      // structured diagnostics for an agent's fix loop ((internal ADR)).
      if (args.check) {
        const { checkDeck } = await import("@liebstoeckel/engine/build");
        const { ok, diagnostics } = await checkDeck({ entry: "./index.html" });
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

      await warnIfSpeakerNotes(".");
      const { buildDeck } = await import("@liebstoeckel/thumbnails/build");
      const { cliVersion } = await import("./skill");
      // In JSON mode stdout must be a single machine-readable object, so route the
      // build's human progress prose (✓ built…, license/source/thumbnail notes) to
      // stderr for the duration and print the structured result to stdout at the end.
      const realLog = console.log;
      if (json) console.log = (...a: unknown[]) => console.error(...a);
      let result;
      try {
        result = await buildDeck({
          entry: "./index.html",
          outdir: "./dist",
          inlinePackage: args.inlinePackage !== false,
          inlineLicenses: args.inlineLicenses !== false,
          allowSecret: !!args.allowSecret,
          generator: { name: "cli", version: await cliVersion() },
        });
      } finally {
        console.log = realLog;
      }
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
  },
});

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
  async run({ args }) {
    const htmlPath = args.deck;
    if (!htmlPath) {
      console.error("usage: liebstoeckel eject <deck.html> [outdir] [--force]");
      process.exit(1);
    }
    const outDir = args.outdir ?? resolve(basename(htmlPath).replace(/\.html?$/i, "") + "-source");
    const { ejectSource } = await import("@liebstoeckel/engine/build/source-package");
    try {
      const html = await Bun.file(resolve(htmlPath)).text();
      const written = await ejectSource(html, resolve(outDir), { force: !!args.force });
      console.log(`\n✓ ejected ${written.length} files → ${outDir}\n`);
      for (const f of written) console.log(`   ${f}`);
      // Rebuilding runs the deck's own build-time code (macros/build plugins);
      // `--ignore-scripts` only blocks npm lifecycle scripts, not that — so the real
      // control is to rebuild only decks you trust. `liebstoeckel build` confirms it once.
      console.log(`\n   rebuild (runs the deck's code — only rebuild decks you trust):`);
      console.log(`     cd ${outDir} && bun install --ignore-scripts && liebstoeckel build`);
      // An ejected deck isn't trusted yet, so the first rebuild prompts; non-interactively
      // (CI/agent) it refuses without --trust. Surface that so the recipe is complete.
      console.log(`   (non-interactive? add --trust to the build to skip the trust prompt)\n`);
    } catch (e) {
      console.error(`✕ ${(e as Error).message}`);
      process.exit(1);
    }
  },
});

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
  },
  async run({ args }) {
    const dir = resolve(deckDir(args));
    const out = args.out;
    // A clean "this isn't a deck" beats leaking the underlying `bun pm pack` error
    // ("package.json must have name and version") for the common wrong-directory mistake.
    if (!existsSync(join(dir, "index.html"))) {
      console.error(`✕ no deck here: ${dir}\n  run this in a deck directory (one with an index.html), or pass --dir <deck>.`);
      process.exit(1);
    }
    const { collectDeckTarball } = await import("@liebstoeckel/engine/build/source-package");
    try {
      const { gzip, files } = await collectDeckTarball(dir, { allowSecret: !!args.allowSecret });
      if (out) {
        // pack's native gzip, `bun add ./<file>.tgz`-installable (zstd is embed-only).
        await Bun.write(resolve(out), gzip);
        console.log(`\n✓ wrote ${files.length}-file source package → ${out}  (gzip; bun add-compatible)\n`);
      } else {
        console.log(`\nsource package (${files.length} files), what a build would embed:\n`);
      }
      for (const f of files) console.log(`   ${f}`);
      console.log();
    } catch (e) {
      console.error(`✕ ${(e as Error).message}`);
      process.exit(1);
    }
  },
});

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
  async run({ args }) {
    const json = !!args.json || !process.stdout.isTTY;
    const check = !!args.check;
    const dir = deckDir(args);

    // A built deck.html already carries its notices, print the embedded block
    // (no rebuild). `--check` is not meaningful here: the block is rendered text, not the
    // structured report, so license gating needs the deck source instead.
    if (looksLikeDeck(dir) && /\.html?$/i.test(dir)) {
      if (check) {
        console.error(`✕ --check needs the deck source directory (it recomputes the bundle); a built .html carries only the rendered notices.\n  try: liebstoeckel licenses <deck-dir> --check`);
        process.exit(1);
      }
      if (!existsSync(resolve(dir))) {
        console.error(`✕ no such deck file: ${dir}`);
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

    // Otherwise resolve the deck dir and compute the report from its real module graph —
    // this runs the deck's build-time code, so it's behind the same trust gate as `build`.
    await gateBuildTrust(dir, args.trust);
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
  },
});
