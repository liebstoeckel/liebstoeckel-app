import { describe, expect, test } from "bun:test";
import { folderAt, folderTree, normalizePath, pickDecks, type CloudDeck, type CloudFolder } from "./library";

const folders: CloudFolder[] = [
  { id: "f2", parentId: "f1", name: "Q4", path: "Sales/Q4" },
  { id: "f1", parentId: null, name: "Sales", path: "Sales" },
  { id: "f3", parentId: null, name: "Archive", path: "Archive" },
];

describe("folder paths", () => {
  test("normalized: outer and doubled slashes and spaces go", () => {
    expect(normalizePath(" /Sales//Q4/ ")).toBe("Sales/Q4");
    expect(normalizePath("/")).toBe("");
  });
  test("looked up regardless of case; the root is null, a missing folder undefined", () => {
    expect(folderAt(folders, "sales/q4")?.id).toBe("f2");
    expect(folderAt(folders, "/")).toBeNull();
    expect(folderAt(folders, "Sales/Q3")).toBeUndefined();
  });
  test("shown as a tree, children under their parent, sorted by name", () => {
    expect(folderTree(folders)).toEqual(["Archive", "Sales", "  Q4"]);
  });
});

describe("naming decks", () => {
  const deck = (id: string, deckKey: string | null): CloudDeck => ({
    id,
    deckKey,
    title: id,
    version: 1,
    shared: false,
    shareSlug: null,
    views: 0,
    uniqueViews: 0,
  });
  test("by id or key, each once, and the rest reported missing", () => {
    const decks = [deck("d1", "pitch"), deck("d2", null)];
    expect(pickDecks(decks, ["pitch", "d2", "d1", "nope"])).toEqual({ found: [decks[0]!, decks[1]!], missing: ["nope"] });
  });
});
