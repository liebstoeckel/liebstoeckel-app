import { test, expect, describe } from "bun:test";
import { classifyPlugin, discoverFromDeps, type Lookup, type PkgJson } from "./discovery";

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
