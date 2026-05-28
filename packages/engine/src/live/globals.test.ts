import { test, expect, describe } from "bun:test";
import { definePlugin, schema, t, type ClientProps, type GlobalProps } from "@liebstoeckel/plugin-sdk";
import { globalPlugins } from "./globals";

const slideOnly = definePlugin<{ n: number }>({
  id: "slideOnly",
  state: schema({ n: t.number }),
  client: { Slide: (_: ClientProps<{ n: number }>) => null },
});

const withGlobal = (id: string) =>
  definePlugin<{ n: number }>({
    id,
    state: schema({ n: t.number }),
    client: {
      Slide: (_: ClientProps<{ n: number }>) => null,
      global: { Control: (_: GlobalProps<{ n: number }>) => null },
    },
  });

describe("globalPlugins", () => {
  test("returns only plugins exposing client.global", () => {
    const a = withGlobal("a");
    const registry = { slideOnly, a };
    expect(globalPlugins(registry).map((e) => e.id)).toEqual(["a"]);
  });

  test("preserves registration (insertion) order", () => {
    const registry = { x: withGlobal("x"), slideOnly, y: withGlobal("y") };
    expect(globalPlugins(registry).map((e) => e.id)).toEqual(["x", "y"]);
  });

  test("a registry with no global plugins returns []", () => {
    expect(globalPlugins({ slideOnly })).toEqual([]);
  });
});
