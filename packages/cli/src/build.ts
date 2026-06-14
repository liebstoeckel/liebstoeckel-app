// `liebstoeckel build|eject|pack|licenses` — the deck build/inspect commands.
// Heavy engine/thumbnails modules are imported lazily inside each `run` so the
// umbrella pays for them only when the command is actually invoked.
import { defineCommand } from "citty";
import { resolve, basename } from "node:path";
import { looksLikeDeck } from "./targeting";

/** Deck targeting ((internal ADR)): a leading positional, else `--dir`, else cwd. */
const deckDir = (args: { deck?: string; dir?: string }): string => args.deck ?? args.dir ?? ".";

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
    json: { type: "boolean", description: "machine-readable JSON output (default when piped)" },
  },
  async run({ args }) {
    const dir = deckDir(args);
    const prev = process.cwd();
    process.chdir(resolve(dir)); // resolve(".") = cwd, so the default is a no-op
    try {
      // `--check`: validate the deck bundles (no artifact, no thumbnails) and report
      // structured diagnostics for an agent's fix loop ((internal ADR)).
      if (args.check) {
        const { checkDeck } = await import("@liebstoeckel/engine/build");
        const { ok, diagnostics } = await checkDeck({ entry: "./index.html" });
        const json = !!args.json || !process.stdout.isTTY;
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
      const { cliVersion } = await import("./skill");
      await buildDeck({
        entry: "./index.html",
        outdir: "./dist",
        inlinePackage: args.inlinePackage !== false,
        inlineLicenses: args.inlineLicenses !== false,
        allowSecret: !!args.allowSecret,
        generator: { name: "cli", version: await cliVersion() },
      });
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
      console.log(`\n   rebuild (untrusted deck? keep --ignore-scripts):`);
      console.log(`     cd ${outDir} && bun install --ignore-scripts && bun run build\n`);
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
    const { collectDeckTarball } = await import("@liebstoeckel/engine/build/source-package");
    try {
      const { gzip, files } = await collectDeckTarball(dir, { allowSecret: !!args.allowSecret });
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
  },
  async run({ args }) {
    const json = !!args.json || !process.stdout.isTTY;
    const check = !!args.check;
    const dir = deckDir(args);

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
  },
});
