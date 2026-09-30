import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describeSkipped, exclusionOf, listDeckSources } from "./source-files.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "source-files-"));
  dirs.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

describe("listDeckSources", () => {
  test("respects .gitignore from the repository root down, with negation and nested files", () => {
    const root = tree({
      ".git/HEAD": "ref: x\n",
      ".gitignore": "*.draft.mdx\nprivate/\n",
      "talks/deck/.gitignore": "notes/*\n!notes/keep.md\n",
      "talks/deck/slides/a.mdx": "a",
      "talks/deck/slides/b.draft.mdx": "b",
      "talks/deck/private/c.mdx": "c",
      "talks/deck/notes/x.md": "x",
      "talks/deck/notes/keep.md": "k",
      "talks/deck/.env.json": "{}",
      "talks/deck/node_modules/p/index.js": "",
    });
    const deck = join(root, "talks/deck");
    const listing = listDeckSources(deck);
    expect(listing.paths).toEqual(["notes/keep.md", "slides/a.mdx"]);
    expect(listing.skipped).toEqual([
      { path: ".env.json", reason: "denylist" },
      { path: "notes/x.md", reason: "gitignore" },
      { path: "slides/b.draft.mdx", reason: "gitignore" },
    ]);
    expect(exclusionOf(deck, "private/c.mdx")).toBe("gitignore");
    expect(exclusionOf(deck, "slides/z.draft.mdx")).toBe("gitignore");
    expect(exclusionOf(deck, "notes/keep.md")).toBeNull();
    expect(exclusionOf(deck, "config/secrets.json")).toBe("denylist");
    expect(describeSkipped(listing.skipped, 2)).toBe(
      "3 source files not synced: .env.json (looks like a credentials file), notes/x.md (.gitignore), and 1 more",
    );
  });

  test("outside a repository only the deck's own .gitignore counts", () => {
    const root = tree({ ".gitignore": "*.mdx\n", "deck/.gitignore": "b.mdx\n", "deck/a.mdx": "a", "deck/b.mdx": "b" });
    expect(listDeckSources(join(root, "deck")).paths).toEqual(["a.mdx"]);
  });
});
