import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

// The protocol and bridge entries are meant to be imported by hosts that are
// neither Bun nor Node (a Vite-built control app, a browser). Anything in their
// import graphs that reaches for `bun`, a Node builtin, or the CLI package
// would break that host at build time, silently, the next time someone adds
// a convenient import. This test walks both graphs and refuses.

const ENTRIES = ["src/protocol.ts", "src/bridge.ts"];
const ROOT = resolve(import.meta.dir, "..");

const NODE_BUILTINS = new Set([
  "assert", "buffer", "child_process", "crypto", "events", "fs", "http", "https", "module", "net", "os", "path",
  "process", "readline", "stream", "url", "util", "worker_threads", "zlib",
]);

function isForbidden(specifier: string): boolean {
  if (specifier === "bun" || specifier.startsWith("bun:")) return true;
  if (specifier.startsWith("node:")) return true;
  if (NODE_BUILTINS.has(specifier)) return true;
  if (specifier === "@liebstoeckel/cli" || specifier.startsWith("@liebstoeckel/cli/")) return true;
  return false;
}

function resolveRelative(from: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate) && !candidate.endsWith("/")) {
      try {
        if (readFileSync(candidate)) return candidate;
      } catch {
        // directory or unreadable: try the next candidate
      }
    }
  }
  return null;
}

/** Walk relative imports from `entry`; returns `{file, specifier}` pairs that hit the forbidden list. */
export function forbiddenImports(entry: string): Array<{ file: string; specifier: string }> {
  const transpiler = new Bun.Transpiler({ loader: "ts" });
  const seen = new Set<string>();
  const queue = [resolve(entry)];
  const hits: Array<{ file: string; specifier: string }> = [];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const code = readFileSync(file, "utf-8");
    for (const { path: specifier } of transpiler.scanImports(code)) {
      if (isForbidden(specifier)) hits.push({ file, specifier });
      const next = resolveRelative(file, specifier);
      if (next) queue.push(next);
    }
  }
  return hits;
}

describe("import-leaf entries", () => {
  for (const entry of ENTRIES) {
    test(`${entry} pulls in no bun / node / CLI imports`, () => {
      expect(forbiddenImports(join(ROOT, entry))).toEqual([]);
    });
  }

  test("the walker catches a forbidden import two hops down", () => {
    const dir = mkdtempSync(join(tmpdir(), "lst-leaf-"));
    writeFileSync(join(dir, "entry.ts"), 'export { x } from "./mid";\n');
    writeFileSync(join(dir, "mid.ts"), 'import { readFileSync } from "node:fs";\nexport const x = readFileSync;\n');
    expect(forbiddenImports(join(dir, "entry.ts"))).toEqual([{ file: join(dir, "mid.ts"), specifier: "node:fs" }]);
  });
});
