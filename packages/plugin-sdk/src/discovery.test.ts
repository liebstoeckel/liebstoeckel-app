import { test, expect, describe } from "bun:test";
import { classifyPlugin, deckLocalPlugins, discoverFromDeps, type Lookup, type PkgJson } from "./discovery";

const pluginPkg: PkgJson = {
  name: "@acme/poll",
  version: "1.2.3",
  keywords: ["liebstoeckel-plugin", "poll"],
  liebstoeckel: { client: "./client.tsx", server: "./server.ts" },
};

describe("classifyPlugin", () => {
  test("recognizes a plugin and resolves entries against its dir", () => {
    const p = classifyPlugin(pluginPkg, "/n/@acme/poll");
    expect(p).toEqual({
      name: "@acme/poll",
      version: "1.2.3",
      dir: "/n/@acme/poll",
      clientEntry: "/n/@acme/poll/client.tsx",
      serverEntry: "/n/@acme/poll/server.ts",
    });
  });

  test("client-only plugin has no serverEntry", () => {
    const p = classifyPlugin({ ...pluginPkg, liebstoeckel: { client: "./c.tsx" } }, "/d");
    expect(p?.serverEntry).toBeUndefined();
    expect(p?.clientEntry).toBe("/d/c.tsx");
  });

  test("rejects non-plugins", () => {
    expect(classifyPlugin({ name: "react", version: "19" }, "/d")).toBeNull();
    expect(classifyPlugin({ name: "x", keywords: ["liebstoeckel-plugin"] }, "/d")).toBeNull(); // no liebstoeckel
    expect(classifyPlugin({ name: "x", liebstoeckel: { client: "c" } }, "/d")).toBeNull(); // no keyword
  });
});

describe("discoverFromDeps", () => {
  test("returns only dependencies that are plugins", () => {
    const lookup: Lookup = (name) => {
      if (name === "@acme/poll") return { pkg: pluginPkg, dir: "/n/@acme/poll" };
      if (name === "react") return { pkg: { name: "react", version: "19" }, dir: "/n/react" };
      return null;
    };
    const found = discoverFromDeps({ "@acme/poll": "*", react: "*", missing: "*" }, lookup);
    expect(found.map((p) => p.name)).toEqual(["@acme/poll"]);
  });
});

describe("deckLocalPlugins", () => {
  const deck = (plugins: unknown) => ({ name: "d", liebstoeckel: { plugins } }) as PkgJson;

  test("reads each plugin's audience fields", () => {
    expect(deckLocalPlugins(deck({ mood: { audienceWrites: ["votes", "votes", "notes"] } }), [])).toEqual({
      plugins: [{ id: "mood", audienceWrites: ["votes", "notes"] }],
      errors: [],
    });
  });

  test("nothing declared is nothing to do", () => {
    expect(deckLocalPlugins({ name: "d" }, [])).toEqual({ plugins: [], errors: [] });
    expect(deckLocalPlugins(deck({ mood: {} }), []).plugins).toEqual([]);
  });

  test("an installed plugin's id may not be taken over", () => {
    const { plugins, errors } = deckLocalPlugins(deck({ poll: { audienceWrites: ["closed"] } }), ["poll"]);
    expect(plugins).toEqual([]);
    expect(errors[0]).toContain('"poll" is the id of an installed plugin package');
  });

  test("reserved and malformed ids and field lists are errors", () => {
    const { errors } = deckLocalPlugins(
      deck({ "plugin-index": { audienceWrites: ["x"] }, "a:b": { audienceWrites: ["x"] }, ok: { audienceWrites: [""] }, two: { audienceWrites: [1] } }),
      [],
    );
    expect(errors).toHaveLength(4);
    expect(deckLocalPlugins(deck(["mood"]), []).errors[0]).toContain("must be an object");
  });
});
