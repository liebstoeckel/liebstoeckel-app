import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEV_LOADER_TAG, addDevLoaderTag, hasDevLoaderTag } from "./dev-loader";
import { MIGRATIONS, findEntryFile, neededMigrations, readMigrationOptOut, runAutoPatches } from "./migrations";

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

const INDEX_HTML = `<!doctype html>
<html>
  <head>
    <title>t</title>
  </head>
  <body data-brand="liebstoeckel">
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
`;

/** The pre-0054 scaffold entry, prop variations included via the render args. */
const plainEntry = (renderArgs = `\n  <StrictMode>\n    <Present title="T" brands={["liebstoeckel"]} slides={[Intro]} />\n  </StrictMode>,\n`) =>
  `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Present } from "@liebstoeckel/engine";
import Intro from "./slides/01-intro";

createRoot(document.getElementById("root")!).render(${renderArgs});
`;

function deck(files: Record<string, string>, pkg: Record<string, unknown> = {}): string {
  dir = mkdtempSync(join(tmpdir(), "pi-migrations-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "deck", ...pkg }));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

const byId = (id: string) => {
  const m = MIGRATIONS.find((m) => m.id === id);
  if (!m) throw new Error(`no migration ${id}`);
  return m;
};

describe("findEntryFile", () => {
  test("resolves the module script tag to an existing file", () => {
    const d = deck({ "index.html": INDEX_HTML, "main.tsx": plainEntry() });
    expect(findEntryFile(d)).toBe("main.tsx");
  });

  test("accepts bare and root-relative local specifiers", () => {
    for (const src of ["main.tsx", "/main.tsx", "./main.tsx"]) {
      const d = deck({ "index.html": INDEX_HTML.replace("./main.tsx", src), "main.tsx": plainEntry() });
      expect(findEntryFile(d)).toBe("main.tsx");
      rmSync(d, { recursive: true, force: true });
      dir = null;
    }
  });

  test("rejects URL specifiers and paths escaping the deck", () => {
    for (const src of ["https://cdn.example/main.js", "http://x/main.tsx", "//cdn.example/main.js", "../main.tsx"]) {
      const d = deck({ "index.html": INDEX_HTML.replace("./main.tsx", src), "main.tsx": plainEntry() });
      expect(findEntryFile(d)).toBeNull();
      rmSync(d, { recursive: true, force: true });
      dir = null;
    }
  });

  test("null without an index.html or when the file is missing", () => {
    const d = deck({ "index.html": INDEX_HTML });
    expect(findEntryFile(d)).toBeNull();
    expect(findEntryFile(join(d, "nope"))).toBeNull();
  });
});

describe("0001-hmr-entry-boundary", () => {
  const m = byId("0001-hmr-entry-boundary");

  test("detects an unmigrated entry, not a migrated one", () => {
    const d = deck({ "index.html": INDEX_HTML, "main.tsx": plainEntry() });
    expect(m.detect(d)).toBe(true);
    writeFileSync(
      join(d, "main.tsx"),
      `const root = (import.meta.hot.data.root ??= createRoot(document.getElementById("root")!));\nroot.render(<A />);\nimport.meta.hot.accept();\n`,
    );
    expect(m.detect(d)).toBe(false);
  });

  test("an optional-chained import.meta.hot?.accept() counts as migrated", () => {
    const d = deck({
      "index.html": INDEX_HTML,
      "main.tsx": `const root = (import.meta.hot?.data.root ??= createRoot(document.getElementById("root")!));\nroot.render(<A />);\nimport.meta.hot?.accept();\n`,
    });
    expect(m.detect(d)).toBe(false);
    expect(runAutoPatches(d, ["entry"])).toEqual({ applied: [], hinted: [], warnings: [] });
  });

  test("the fully optional-chained import.meta.hot?.accept?.() counts as migrated", () => {
    const d = deck({
      "index.html": INDEX_HTML,
      "main.tsx": `const root = (import.meta.hot?.data.root ??= createRoot(document.getElementById("root")!));\nroot.render(<A />);\nimport.meta.hot?.accept?.();\n`,
    });
    expect(m.detect(d)).toBe(false);
  });

  test("a JavaScript entry is patched without the TypeScript non-null assertion", async () => {
    const jsEntry = plainEntry().replace('document.getElementById("root")!', 'document.getElementById("root")');
    const d = deck({ "index.html": INDEX_HTML.replace("./main.tsx", "./main.jsx"), "main.jsx": jsEntry });
    expect(m.autoPatch!.canApply(d)).toBe(true);
    expect(m.autoPatch!.apply(d)).toBe("main.jsx");
    const out = readFileSync(join(d, "main.jsx"), "utf-8");
    expect(out).not.toContain("!");
    expect(out).toContain('import.meta.hot.data.root ??= createRoot(document.getElementById("root")));');
    // The result must still parse as JavaScript (the `!` would be a syntax error).
    expect(() => new Bun.Transpiler({ loader: "jsx" }).transformSync(out)).not.toThrow();
    // And the TypeScript entry keeps it.
    const t = deck({ "index.html": INDEX_HTML, "main.tsx": plainEntry() });
    m.autoPatch!.apply(t);
    expect(readFileSync(join(t, "main.tsx"), "utf-8")).toContain('getElementById("root")!));');
  });

  test("no entry resolvable means nothing to detect", () => {
    const d = deck({ "index.html": INDEX_HTML });
    expect(m.detect(d)).toBe(false);
  });

  test("canApply accepts scaffold variants (props, whitespace)", () => {
    for (const args of [
      undefined,
      `<Present slides={[Intro]} />`,
      `\n  <StrictMode>\n    <Present title="X" brands={["acme"]} brandThemes={[acme]} plugins={[poll]} slides={[Intro, Data]} />\n  </StrictMode>,\n`,
    ]) {
      const d = deck({ "index.html": INDEX_HTML, "main.tsx": plainEntry(args) });
      expect(m.autoPatch!.canApply(d)).toBe(true);
      rmSync(d, { recursive: true, force: true });
      dir = null;
    }
  });

  test("canApply rejects diverged entries", () => {
    const diverged = [
      // custom wrapper: the chain is not at a line start
      plainEntry().replace("createRoot(", "const app = createRoot("),
      // existing import.meta.hot usage
      plainEntry() + `import.meta.hot.dispose(() => {});\n`,
      // multiple roots
      plainEntry() + plainEntry(),
      // no recognizable chain at all
      `render(<App />, document.getElementById("root"));\n`,
    ];
    for (const source of diverged) {
      const d = deck({ "index.html": INDEX_HTML, "main.tsx": source });
      expect(m.autoPatch!.canApply(d)).toBe(false);
      rmSync(d, { recursive: true, force: true });
      dir = null;
    }
  });

  test("apply round-trip: pattern + comment present, detect goes false", () => {
    const d = deck({ "index.html": INDEX_HTML, "main.tsx": plainEntry() });
    const file = m.autoPatch!.apply(d);
    expect(file).toBe("main.tsx");
    const out = readFileSync(join(d, "main.tsx"), "utf-8");
    expect(out).toContain("// Hot-module boundary:");
    expect(out).toContain(`const root = (import.meta.hot.data.root ??= createRoot(document.getElementById("root")!));`);
    expect(out).toContain("root.render(");
    expect(out.trimEnd().endsWith("import.meta.hot.accept();")).toBe(true);
    // the render arguments survived verbatim
    expect(out).toContain(`<Present title="T" brands={["liebstoeckel"]} slides={[Intro]} />`);
    expect(m.detect(d)).toBe(false);
    expect(m.autoPatch!.canApply(d)).toBe(false);
  });

  test("apply preserves indentation of an indented chain", () => {
    const d = deck({ "index.html": INDEX_HTML, "main.tsx": `  createRoot(document.getElementById("root")!).render(<A />);\n` });
    m.autoPatch!.apply(d);
    const out = readFileSync(join(d, "main.tsx"), "utf-8");
    expect(out).toContain(`  const root = (import.meta.hot.data.root ??= createRoot`);
    expect(out).toContain(`  // Hot-module boundary:`);
  });
});

describe("0002-dev-loader-tag", () => {
  const m = byId("0002-dev-loader-tag");

  test("detect matches the tag helpers; apply is addDevLoaderTag and idempotent", () => {
    const d = deck({ "index.html": INDEX_HTML, "main.tsx": plainEntry() });
    expect(m.detect(d)).toBe(true);
    expect(m.autoPatch!.canApply(d)).toBe(true);
    expect(m.autoPatch!.apply(d)).toBe("index.html");
    const html = readFileSync(join(d, "index.html"), "utf-8");
    expect(hasDevLoaderTag(html)).toBe(true);
    expect(html).toContain(`${DEV_LOADER_TAG}\n  </head>`);
    expect(addDevLoaderTag(html)).toBe(html);
    expect(m.detect(d)).toBe(false);
  });

  test("the tag takes the </head> line's indentation plus one level, and the file's line endings", () => {
    const lf = addDevLoaderTag("<html>\n<head>\n<title>t</title>\n</head>\n<body></body>\n</html>\n");
    expect(lf).toContain(`\n  ${DEV_LOADER_TAG}\n</head>`);
    const crlf = addDevLoaderTag("<html>\r\n  <head>\r\n    <title>t</title>\r\n  </head>\r\n<body></body>\r\n</html>\r\n");
    expect(crlf).toContain(`\r\n    ${DEV_LOADER_TAG}\r\n  </head>`);
    expect(crlf).not.toMatch(/[^\r]\n/);
  });

  test("falls back to <body when there is no </head>", () => {
    const d = deck({ "index.html": `<html><body><div id="root"></div></body></html>` });
    expect(m.autoPatch!.canApply(d)).toBe(true);
    m.autoPatch!.apply(d);
    expect(readFileSync(join(d, "index.html"), "utf-8")).toContain(`${DEV_LOADER_TAG}<body`);
  });

  test("headless, bodyless HTML is not a recognized shape (hint, never prepend)", () => {
    const d = deck({ "index.html": `<div id="root"></div>` });
    expect(m.detect(d)).toBe(true);
    expect(m.autoPatch!.canApply(d)).toBe(false);
  });
});

describe("readMigrationOptOut", () => {
  test("valid entries suppress; empty reasons and unknown ids warn instead", () => {
    const d = deck({}, {
      liebstoeckel: {
        migrationOptOut: {
          "0001-hmr-entry-boundary": "custom HMR",
          "0002-dev-loader-tag": "   ",
          "9999-nope": "whatever",
        },
      },
    });
    const { optOut, warnings } = readMigrationOptOut(d);
    expect(optOut.get("0001-hmr-entry-boundary")).toBe("custom HMR");
    expect(optOut.has("0002-dev-loader-tag")).toBe(false);
    expect(warnings).toHaveLength(2);
    expect(warnings.join("\n")).toContain("0002-dev-loader-tag");
    expect(warnings.join("\n")).toContain("9999-nope");
  });

  test("absent package.json or key means no suppressions, no warnings", () => {
    const d = deck({});
    expect(readMigrationOptOut(d)).toEqual({ optOut: new Map(), warnings: [] });
    expect(readMigrationOptOut(join(d, "nope"))).toEqual({ optOut: new Map(), warnings: [] });
  });
});

describe("neededMigrations", () => {
  test("reports both seeds needed and autoPatchable on a pre-dev-mode deck", () => {
    const d = deck({
      "index.html": INDEX_HTML.replace(DEV_LOADER_TAG, ""),
      "main.tsx": plainEntry(),
    });
    const { migrations, warnings } = neededMigrations(d);
    expect(warnings).toEqual([]);
    expect(migrations.map((m) => [m.id, m.needed, m.autoPatchable])).toEqual([
      ["0001-hmr-entry-boundary", true, true],
      ["0002-dev-loader-tag", true, true],
    ]);
    expect(migrations[0]!.reference).toBe("references/migrations/0001-hmr-entry-boundary.md");
  });

  test("filters by surface", () => {
    const d = deck({ "index.html": INDEX_HTML, "main.tsx": plainEntry() });
    expect(neededMigrations(d, ["entry"]).migrations.map((m) => m.id)).toEqual(["0001-hmr-entry-boundary"]);
    expect(neededMigrations(d, ["index.html"]).migrations.map((m) => m.id)).toEqual(["0002-dev-loader-tag"]);
  });

  test("a suppressed id skips detect and reports why", () => {
    const d = deck(
      { "index.html": INDEX_HTML, "main.tsx": plainEntry() },
      { liebstoeckel: { migrationOptOut: { "0001-hmr-entry-boundary": "custom HMR" } } },
    );
    const [first] = neededMigrations(d, ["entry"]).migrations;
    expect(first).toEqual({
      id: "0001-hmr-entry-boundary",
      needed: false,
      since: "0.3.11",
      reference: "references/migrations/0001-hmr-entry-boundary.md",
      reason: expect.any(String),
      autoPatchable: false,
      suppressed: true,
      suppressReason: "custom HMR",
    });
  });
});

describe("runAutoPatches (the dev boot host)", () => {
  test("patches both surfaces of an unmigrated scaffold-shaped deck", () => {
    const d = deck({
      "index.html": INDEX_HTML,
      "main.tsx": plainEntry(),
    });
    const result = runAutoPatches(d, ["entry", "index.html"]);
    expect(result.warnings).toEqual([]);
    expect(result.hinted).toEqual([]);
    expect(result.applied.map((a) => [a.id, a.file])).toEqual([
      ["0001-hmr-entry-boundary", "main.tsx"],
      ["0002-dev-loader-tag", "index.html"],
    ]);
    expect(readFileSync(join(d, "main.tsx"), "utf-8")).toContain("import.meta.hot.accept();");
    expect(hasDevLoaderTag(readFileSync(join(d, "index.html"), "utf-8"))).toBe(true);
    // second boot: everything migrated, nothing to do
    expect(runAutoPatches(d, ["entry", "index.html"])).toEqual({ applied: [], hinted: [], warnings: [] });
  });

  test("a diverged entry is hinted, never written (invariant)", () => {
    const source = plainEntry() + `import.meta.hot.dispose(() => {});\n`;
    const d = deck({ "index.html": INDEX_HTML, "main.tsx": source });
    const result = runAutoPatches(d, ["entry"]);
    expect(result.applied).toEqual([]);
    expect(result.hinted.map((h) => h.id)).toEqual(["0001-hmr-entry-boundary"]);
    expect(result.hinted[0]!.reference).toBe("references/migrations/0001-hmr-entry-boundary.md");
    expect(readFileSync(join(d, "main.tsx"), "utf-8")).toBe(source);
  });

  test("suppressed ids are skipped silently, their opt-out warnings still surface", () => {
    const d = deck(
      { "index.html": INDEX_HTML.replace(DEV_LOADER_TAG, ""), "main.tsx": plainEntry() },
      { liebstoeckel: { migrationOptOut: { "0001-hmr-entry-boundary": "custom HMR", "0002-dev-loader-tag": "" } } },
    );
    const result = runAutoPatches(d, ["entry", "index.html"]);
    // 0001 suppressed (untouched); 0002's empty reason does NOT suppress, so it patches
    expect(result.applied.map((a) => a.id)).toEqual(["0002-dev-loader-tag"]);
    expect(result.warnings).toHaveLength(1);
    expect(readFileSync(join(d, "main.tsx"), "utf-8")).toBe(plainEntry());
  });
});
