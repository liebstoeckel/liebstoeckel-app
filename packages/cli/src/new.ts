import { existsSync } from "node:fs";
import { join } from "node:path";

export const VALID_NAME = /^[a-z0-9][a-z0-9-]*$/;

const titleCase = (name: string) => name.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export interface ScaffoldOptions {
  brand?: string;
  /** parent directory for the new deck (default: ./presentations) */
  dir?: string;
}

/** Pure: the file map for a new minimal deck (deck-relative path → contents).
 *  Kept as plain templates so a richer template library can grow from here. */
export function deckFiles(name: string, brand = "liebstoeckel"): Record<string, string> {
  const title = titleCase(name);
  const pkg = {
    name: `@liebstoeckel/${name}`,
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
      "@liebstoeckel/engine": "workspace:*",
      "@liebstoeckel/theme": "workspace:*",
    },
    devDependencies: { "@liebstoeckel/thumbnails": "workspace:*" },
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

/** Write a new minimal deck to disk. Throws on an invalid name or existing dir. */
export async function scaffold(
  name: string,
  opts: ScaffoldOptions = {},
): Promise<{ dir: string; files: string[] }> {
  if (!VALID_NAME.test(name)) {
    throw new Error(`invalid deck name "${name}" — use lower-case letters, digits and hyphens`);
  }
  const brand = opts.brand ?? "liebstoeckel";
  const root = opts.dir ?? join(process.cwd(), "presentations");
  const dir = join(root, name);
  if (existsSync(dir)) throw new Error(`${dir} already exists`);

  const files = deckFiles(name, brand);
  for (const [rel, content] of Object.entries(files)) {
    await Bun.write(join(dir, rel), content);
  }
  return { dir, files: Object.keys(files) };
}
