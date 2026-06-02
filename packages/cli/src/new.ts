import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const VALID_NAME = /^[a-z0-9][a-z0-9-]*$/;

const titleCase = (name: string) => name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export interface ScaffoldOptions {
  brand?: string;
  /** parent directory for the new deck (default: the current working directory) */
  dir?: string;
}

/** Pure: the file map for a new minimal deck (deck-relative path → contents).
 *  Kept as plain templates so a richer template library can grow from here. */
/** Per-dependency version ranges for the scaffolded deck (ADR 0051). Independent
 *  versioning (RELEASE_PLAN.md), so each is resolved from its OWN package. */
export interface DeckDeps {
  engine?: string;
  theme?: string;
  thumbnails?: string;
}

export function deckFiles(
  name: string,
  brand = "liebstoeckel",
  deps: DeckDeps = {},
): Record<string, string> {
  const range = (k: keyof DeckDeps) => deps[k] ?? "workspace:*";
  const title = titleCase(name);
  const pkg = {
    // A scaffolded deck is the user's own private project — a BARE name, not the
    // framework's `@liebstoeckel/` npm scope (ADR 0054). Only the framework
    // *dependencies* below keep that scope.
    name,
    version: "0.0.0",
    private: true,
    type: "module",
    // Allowlist of what `bun pm pack` ships — and therefore what `liebstoeckel build`
    // embeds as recoverable source and `eject` restores (ADR 0039). Deny-by-default:
    // a stray .env / secret is never packed because it isn't listed here. bunfig.toml
    // MUST stay listed — pack default-ignores it, and the ejected deck needs it for dev.
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
      "assets",
      "public",
    ],
    scripts: { dev: "bun --hot ./server.ts", build: "bun run build.ts" },
    dependencies: {
      "@liebstoeckel/engine": range("engine"),
      "@liebstoeckel/theme": range("theme"),
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
    <title>${title}</title>
  </head>
  <body data-brand="${brand}">
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
`,

    "bunfig.toml": `# Plugins for the HMR dev server (Bun.serve HTML routes). The build path uses
# Bun.build()'s plugins array in build.ts instead.
[serve.static]
plugins = ["bun-plugin-tailwind", "../../packages/engine/src/build/mdx-plugin.ts", "../../packages/engine/src/build/visx-esm-plugin.ts"]
`,

    "server.ts": `import index from "./index.html";

// Dev server with frontend HMR + React Fast Refresh.
const server = Bun.serve({
  routes: { "/": index },
  development: { hmr: true, console: true },
  hostname: "0.0.0.0",
  port: 3000,
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

import Intro from "./slides/01-intro";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Present title="${title}" brands={["${brand}"]} slides={[Intro]} />
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
 *  OWN package (independent versioning — RELEASE_PLAN.md). Falls back to the CLI's
 *  version (lockstep approximation when the dep can't be resolved, e.g. a
 *  standalone CLI), then to `workspace:*` so an in-repo deck still links locally
 *  (ADR 0051). */
async function depRange(name: string): Promise<string> {
  try {
    const own = caret(nearestPkgVersion(import.meta.resolveSync(name)));
    if (own) return own;
  } catch {
    /* not resolvable from here (e.g. a published standalone CLI) — fall through */
  }
  try {
    const cli = (await Bun.file(new URL("../package.json", import.meta.url)).json()) as {
      version?: string;
    };
    return caret(cli.version) ?? "workspace:*";
  } catch {
    return "workspace:*";
  }
}

/** Write a new minimal deck to disk. Throws on an invalid name or existing dir. */
export async function scaffold(
  name: string,
  opts: ScaffoldOptions = {},
): Promise<{ dir: string; files: string[] }> {
  if (!VALID_NAME.test(name)) {
    throw new Error(`invalid deck name "${name}" — use lower-case letters, digits and hyphens`);
  }
  const brand = opts.brand ?? "liebstoeckel";
  // The deck materializes in the current directory as ./<name> (least surprising).
  // Override the parent with --dir (e.g. --dir presentations).
  const root = opts.dir ? resolve(opts.dir) : process.cwd();
  const dir = join(root, name);
  if (existsSync(dir)) throw new Error(`${dir} already exists`);

  const files = deckFiles(name, brand, {
    engine: await depRange("@liebstoeckel/engine"),
    theme: await depRange("@liebstoeckel/theme"),
    thumbnails: await depRange("@liebstoeckel/thumbnails"),
  });
  for (const [rel, content] of Object.entries(files)) {
    await Bun.write(join(dir, rel), content);
  }
  return { dir, files: Object.keys(files) };
}
