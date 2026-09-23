// Which files of a deck are synced sources. Pure (no fs), so the server, the
// CLI mirror and the dashboard apply one rule.

/** Directories never synced (dependencies, builds, VCS, dev state). */
export const SKIP_DIRS = new Set(["node_modules", ".git", ".liebstoeckel", "dist", "build", "out", ".cache"]);

/** Text source extensions. Binary assets are not synced in this version. */
export const SOURCE_EXTS = new Set([
  ".mdx", ".md", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".css", ".json", ".html", ".svg", ".toml", ".yaml", ".yml", ".txt",
]);

export const MAX_SOURCE_BYTES = 512 * 1024;
export const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
export const MAX_FILES = 500;

/** Whether a deck-relative path has an authoring (text source) extension. */
export function isSourceFile(rel: string): boolean {
  const dot = rel.lastIndexOf(".");
  return dot > rel.lastIndexOf("/") && SOURCE_EXTS.has(rel.slice(dot).toLowerCase());
}

/** Whether `rel` is a safe, normalized deck-relative source path: forward
 *  slashes, no absolute path, no `.`/`..`/empty segments, not inside a
 *  skipped directory, and a source extension. Everything that crosses the
 *  wire or touches a disk goes through this. */
export function isSyncPath(rel: string): boolean {
  if (rel.length === 0 || rel.length > 400) return false;
  if (rel.startsWith("/") || rel.includes("\\") || rel.includes("\0")) return false;
  const segments = rel.split("/");
  for (const s of segments) {
    if (s === "" || s === "." || s === "..") return false;
    if (SKIP_DIRS.has(s)) return false;
  }
  return isSourceFile(rel);
}

/** Why a tree is not acceptable as a deck source tree, or null. */
export function treeProblem(tree: Record<string, string>): string | null {
  const paths = Object.keys(tree);
  if (paths.length > MAX_FILES) return `too many files (${paths.length} > ${MAX_FILES})`;
  let total = 0;
  for (const path of paths) {
    if (!isSyncPath(path)) return `not a source path: ${path}`;
    const text = tree[path];
    if (typeof text !== "string") return `not text: ${path}`;
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > MAX_SOURCE_BYTES) return `file too large: ${path}`;
    total += bytes;
  }
  if (total > MAX_TOTAL_BYTES) return "deck sources too large";
  return null;
}
