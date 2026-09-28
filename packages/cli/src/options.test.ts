import { describe, expect, test } from "bun:test";
import { defineCommand } from "citty";
import { findUnknownOptions, suggestOption, unknownIn } from "./options";

const leafA = defineCommand({
  meta: { name: "list" },
  args: {
    json: { type: "boolean" },
    org: { type: "string" },
    "inline-package": { type: "boolean", default: true },
    out: { type: "string", alias: "o" },
    deck: { type: "positional", required: false },
  },
  run() {},
});
const leafB = defineCommand({ meta: { name: "use" }, args: { slug: { type: "positional", required: false } }, run() {} });
const withArgsAndSub = defineCommand({
  meta: { name: "dev" },
  args: { dir: { type: "string" }, json: { type: "boolean" } },
  subCommands: { poll: defineCommand({ meta: { name: "poll" }, args: { timeout: { type: "string" } }, run() {} }) },
  run() {},
});
const root = defineCommand({
  meta: { name: "liebstoeckel" },
  subCommands: {
    orgs: () => Promise.resolve(defineCommand({ meta: { name: "orgs" }, subCommands: { list: leafA, use: leafB }, default: "list" })),
    decks: leafA,
    dev: () => withArgsAndSub,
  },
});

const unknown = async (argv: string[]) => (await findUnknownOptions(root, argv)).unknown.map((u) => u.option);

describe("unknown options", () => {
  test("declared options in every accepted spelling pass", async () => {
    expect(await unknown(["decks", "--json", "--org", "acme", "--no-inline-package", "--inlinePackage", "-o", "x.tgz", "deck"])).toEqual([]);
    expect(await unknown(["decks", "--org=acme", "--no-json", "--help"])).toEqual([]);
  });

  test("an undeclared option is reported, with the command it went to", async () => {
    const r = await findUnknownOptions(root, ["decks", "--jsonn"]);
    expect(r.unknown).toEqual([{ option: "--jsonn", command: "liebstoeckel decks", suggestion: "--json" }]);
  });

  test("the value of a string option is not mistaken for an option", async () => {
    expect(await unknown(["decks", "--org", "--weird-slug"])).toEqual([]);
  });

  test("--no- works only for booleans", async () => {
    expect(await unknown(["decks", "--no-org"])).toEqual(["--no-org"]);
  });

  test("the default subcommand receives the parent's argv", async () => {
    const r = await findUnknownOptions(root, ["orgs", "--json"]);
    expect(r.unknown).toEqual([]);
    expect(r.leaf.path).toEqual(["orgs", "list"]);
    expect(await unknown(["orgs", "use", "acme", "--json"])).toEqual(["--json"]);
  });

  test("a command with options and a subcommand splits the argv like citty", async () => {
    expect(await unknown(["dev", "--dir", "x", "--json"])).toEqual([]);
    expect(await unknown(["dev", "poll", "--timeout", "5"])).toEqual([]);
    expect(await unknown(["dev", "poll", "--json"])).toEqual(["--json"]);
  });

  test("an option before the command name belongs to the root", async () => {
    expect(await unknown(["--json", "decks"])).toEqual(["--json"]);
    expect(await unknown(["--version"])).toEqual([]);
  });

  test("everything after -- is left alone", async () => {
    expect(await unknown(["decks", "--", "--anything"])).toEqual([]);
  });

  test("short clusters and negative numbers", () => {
    expect(unknownIn(["-ho"], { out: { type: "string", alias: "o" } }, false)).toEqual([]);
    expect(unknownIn(["-x"], {}, false)).toEqual(["-x"]);
    expect(unknownIn(["-1"], {}, false)).toEqual([]);
  });

  test("suggestions only when close", () => {
    const args = { json: { type: "boolean" }, "allow-secret": { type: "boolean" } };
    expect(suggestOption("--josn", args)).toBe("--json");
    expect(suggestOption("--allow-secrets", args)).toBe("--allow-secret");
    expect(suggestOption("--frobnicate", args)).toBeUndefined();
  });
});
