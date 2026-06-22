import { defineCommand } from "citty";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const VALID_NAME = /^[a-z0-9][a-z0-9-]*$/;

const titleCase = (name: string) => name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export interface ScaffoldOptions {
  brand?: string;
  /** parent directory for the new deck (default: the current working directory) */
  dir?: string;
  /** opt out of auto-applying the logged-in org's default brand ((internal ADR)) */
  noOrgBrand?: boolean;
}

/** Pure: the file map for a new minimal deck (deck-relative path → contents).
 *  Kept as plain templates so a richer template library can grow from here. */
/** Per-dependency version ranges for the scaffolded deck ((internal ADR)). Independently
 *  versioned, so each is resolved from its OWN package. */
export interface DeckDeps {
  engine?: string;
  theme?: string;
  thumbnails?: string;
}

export function deckFiles(
  name: string,
  brand = "liebstoeckel",
  deps: DeckDeps = {},
  orgBrand?: { name: string; source: string; dependencies?: string[] },
): Record<string, string> {
  const range = (k: keyof DeckDeps) => deps[k] ?? "workspace:*";
  const title = titleCase(name);
  // When `new` is run logged-in, the org's default brand ((internal ADR)) is baked in:
  // a local brands/<name>.ts wired via <Present brandThemes>, self-contained.
  const brandId = orgBrand?.name ?? brand;
  const brandImport = orgBrand ? `import orgBrand from "./brands/${orgBrand.name}";\n` : "";
  const brandThemesProp = orgBrand ? " brandThemes={[orgBrand]}" : "";
  // The default brand's catalog fonts ((internal ADR)) are @fontsource packages the baked
  // brands/<name>.ts imports, add them so the deck's `bun install` fetches the
  // webfont (built decks inline it). `latest` (a third-party dist-tag) since the CLI
  // can't resolve their version like the framework deps; the lockfile pins on install.
  const fontDeps = Object.fromEntries((orgBrand?.dependencies ?? []).map((p) => [p, "latest"]));
  const pkg = {
    // A scaffolded deck is the user's own private project, a BARE name, not the
    // framework's `@liebstoeckel/` npm scope ((internal ADR)). Only the framework
    // *dependencies* below keep that scope.
    name,
    version: "0.0.0",
    private: true,
    type: "module",
    // Allowlist of what `bun pm pack` ships, and therefore what `liebstoeckel build`
    // embeds as recoverable source and `eject` restores ((internal ADR)). Deny-by-default:
    // a stray .env / secret is never packed because it isn't listed here. bunfig.toml
    // MUST stay listed, pack default-ignores it, and the ejected deck needs it for dev.
    // Add new top-level source dirs here as the deck grows (the build warns if you forget).
    files: [
      "index.html",
      "main.tsx",
      "server.ts",
      "build.ts",
      "bunfig.toml",
      "slides",
      "elements",
      "components",
      "charts",
      "brands",
      "assets",
      "public",
    ],
    scripts: { dev: "bun --hot ./server.ts", build: "bun run build.ts" },
    dependencies: {
      "@liebstoeckel/engine": range("engine"),
      "@liebstoeckel/theme": range("theme"),
      ...fontDeps,
    },
    devDependencies: { "@liebstoeckel/thumbnails": range("thumbnails") },
  };

  return {
    "package.json": JSON.stringify(pkg, null, 2) + "\n",

    // Defense-in-depth for decks used outside the monorepo: keep build output and
    // secrets out of version control (and the `files` allowlist above keeps them out
    // of the packed/embedded source regardless).
    ".gitignore": `node_modules/
dist/
*.tgz
.env
.env.*
`,

    "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link
      rel="icon"
      href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23121212'/%3E%3Crect x='7' y='9' width='18' height='13' rx='2' fill='none' stroke='%23c8a96a' stroke-width='2'/%3E%3C/svg%3E"
    />
    <title>${title}</title>
  </head>
  <body data-brand="${brandId}">
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
`,

    "bunfig.toml": `# Plugins for the HMR dev server (Bun.serve HTML routes). The build path uses
# Bun.build()'s plugins array in build.ts instead.
[serve.static]
plugins = ["bun-plugin-tailwind", "@liebstoeckel/engine/mdx-plugin", "@liebstoeckel/engine/visx-esm-plugin"]
`,

    "server.ts": `import index from "./index.html";

// Dev server with frontend HMR + React Fast Refresh.
const server = Bun.serve({
  routes: { "/": index },
  development: { hmr: true, console: true },
  hostname: "0.0.0.0",
  port: Number(process.env.PORT) || 3000,
});

console.log(\`▶  http://localhost:\${server.port}\`);
`,

    "build.ts": `import { buildDeck } from "@liebstoeckel/thumbnails/build";

// Single self-contained .html + slide thumbnails (skip with LIEBSTOECKEL_NO_THUMBS=1).
await buildDeck({ entry: "./index.html", outdir: "./dist" });
`,

    "main.tsx": `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Present } from "@liebstoeckel/engine";
import "@liebstoeckel/theme/styles.css";
${brandImport}
import Intro from "./slides/01-intro";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Present title="${title}" brands={["${brandId}"]}${brandThemesProp} slides={[Intro]} />
  </StrictMode>,
);
`,

    "slides/01-intro.tsx": `import { Step } from "@liebstoeckel/engine";

export default function Intro() {
  return (
    <div className="w-full">
      <div className="mb-5 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
        <span className="h-px w-8 bg-accent" />
        liebstoeckel
      </div>
      <h1 className="font-heading text-[88px] font-semibold leading-[0.95] tracking-[-0.03em] text-text">
        ${title}
      </h1>
      <div className="mt-10 space-y-4 font-body text-2xl text-muted">
        <Step>▹ Edit slides/01-intro.tsx</Step>
        <Step>▹ Add slides and wire them up in main.tsx</Step>
        <Step>▹ bun run build → one self-contained .html</Step>
      </div>
    </div>
  );
}
`,
    // Org default brand baked in as owned source ((internal ADR)).
    ...(orgBrand ? { [`brands/${orgBrand.name}.ts`]: orgBrand.source } : {}),
  };
}

/** Version string from the nearest package.json above a resolved module path. */
function nearestPkgVersion(entry: string): string | null {
  let dir = dirname(entry.startsWith("file://") ? fileURLToPath(entry) : entry);
  for (let i = 0; i < 6 && dir !== dirname(dir); i++) {
    const pj = join(dir, "package.json");
    if (existsSync(pj)) {
      try {
        return (JSON.parse(readFileSync(pj, "utf8")) as { version?: string }).version ?? null;
      } catch {
        return null;
      }
    }
    dir = dirname(dir);
  }
  return null;
}

const caret = (v: string | null | undefined) => (v && v !== "0.0.0" ? `^${v}` : null);

/** The `^<version>` range to scaffold for a framework dep, read from that dep's
 *  OWN resolved package (independently versioned, (internal ADR)).
 *
 *  Invariant: every scaffolded dependency MUST be a direct dependency of
 *  `@liebstoeckel/cli`, so it is installed alongside the CLI and resolvable both
 *  in-repo and standalone. We rely on that and **fail loud** if it doesn't hold.
 *  The old fallback to the CLI's *own* version was only correct under lockstep;
 *  with graph-driven versioning it would silently stamp a wrong, lockstep-shaped
 *  pin onto a package that no longer shares the CLI's version, a far worse failure
 *  than a clear error. */
function depRange(name: string): string {
  let resolved: string;
  try {
    resolved = import.meta.resolveSync(name);
  } catch (err) {
    throw new Error(
      `scaffold: cannot resolve ${name} to read its version. Every scaffolded ` +
        `dependency must be a direct dependency of @liebstoeckel/cli so it is ` +
        `installed alongside the CLI ((internal ADR)). Original error: ${(err as Error).message}`,
    );
  }
  const version = nearestPkgVersion(resolved);
  const range = caret(version);
  if (!range) {
    throw new Error(
      `scaffold: resolved ${name} but its package.json has no usable version ` +
        `(found ${version ?? "none"}); cannot emit a real range for it ((internal ADR)).`,
    );
  }
  return range;
}

/** Write a new minimal deck to disk. Throws on an invalid name or existing dir. */
export async function scaffold(
  name: string,
  opts: ScaffoldOptions = {},
): Promise<{ dir: string; files: string[]; brand: string }> {
  if (!VALID_NAME.test(name)) {
    throw new Error(`invalid deck name "${name}", use lower-case letters, digits and hyphens`);
  }
  const brand = opts.brand ?? "liebstoeckel";
  // Unless a brand was named explicitly (or opted out), bake the logged-in org's
  // default brand so new decks are on-brand instantly ((internal ADR)). Best effort, // never blocks scaffolding when offline / not logged in.
  const orgBrand = !opts.brand && !opts.noOrgBrand ? await (await import("./cloud")).fetchDefaultBrand() : null;

  // The deck materializes in the current directory as ./<name> (least surprising).
  // Override the parent with --dir (e.g. --dir presentations).
  const root = opts.dir ? resolve(opts.dir) : process.cwd();
  const dir = join(root, name);
  if (existsSync(dir)) throw new Error(`${dir} already exists`);

  const files = deckFiles(
    name,
    brand,
    {
      engine: depRange("@liebstoeckel/engine"),
      theme: depRange("@liebstoeckel/theme"),
      thumbnails: depRange("@liebstoeckel/thumbnails"),
    },
    orgBrand ?? undefined,
  );
  for (const [rel, content] of Object.entries(files)) {
    await Bun.write(join(dir, rel), content);
  }
  // A deck scaffolded here is authored by this user — trust it so building it never
  // trips the untrusted-deck confirmation gate (see trust.ts).
  await (await import("./trust")).trustDeck(dir);
  return { dir, files: Object.keys(files), brand: orgBrand?.name ?? brand };
}

export const newCommand = defineCommand({
  meta: {
    name: "new",
    description: "scaffold a new deck as ./<name> (or under --dir)",
  },
  args: {
    name: {
      type: "positional",
      required: false,
      description: "deck name (lower-case letters, digits, hyphens)",
      valueHint: "name",
    },
    brand: { type: "string", description: "brand to apply", valueHint: "brand" },
    dir: { type: "string", description: "parent directory for the new deck", valueHint: "parent" },
    "org-brand": {
      type: "boolean",
      default: true,
      description: "apply the logged-in org's default brand",
      negativeDescription: "do not apply the org default brand",
    },
  },
  async run({ args }) {
    const name = args.name;
    if (!name) {
      console.error("usage: liebstoeckel new <name> [--brand <brand>] [--dir <parent>] [--no-org-brand]");
      process.exit(1);
    }
    try {
      const { dir, files } = await scaffold(name, {
        brand: args.brand,
        dir: args.dir,
        noOrgBrand: args.orgBrand === false,
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
  },
});
