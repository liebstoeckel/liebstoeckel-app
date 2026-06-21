import { test, expect, describe } from "bun:test";
import { podOrdinal, ordinalTag, relayPublicBaseFromPod } from "./addressing";

describe("relay per-pod addressing ((internal ticket))", () => {
  test("podOrdinal parses the StatefulSet ordinal, else null", () => {
    expect(podOrdinal("liebstoeckel-relay-0")).toBe(0);
    expect(podOrdinal("liebstoeckel-relay-7")).toBe(7);
    expect(podOrdinal("liebstoeckel-relay-123")).toBe(123);
    expect(podOrdinal(undefined)).toBeNull();
    expect(podOrdinal("no-ordinal")).toBeNull();
    expect(podOrdinal("relay-x")).toBeNull();
  });

  test("ordinalTag zero-pads to width 3 and never truncates", () => {
    expect(ordinalTag(0)).toBe("000");
    expect(ordinalTag(7)).toBe("007");
    expect(ordinalTag(42)).toBe("042");
    expect(ordinalTag(123)).toBe("123");
    expect(ordinalTag(1234)).toBe("1234");
  });

  test("relayPublicBaseFromPod derives the per-pod host and trims trailing slash", () => {
    const tpl = "https://liebstoeckel-relayNNN.example.com";
    expect(relayPublicBaseFromPod("liebstoeckel-relay-0", tpl)).toBe("https://liebstoeckel-relay000.example.com");
    expect(relayPublicBaseFromPod("liebstoeckel-relay-7", tpl)).toBe("https://liebstoeckel-relay007.example.com");
    expect(relayPublicBaseFromPod("liebstoeckel-relay-12", `${tpl}/`)).toBe(
      "https://liebstoeckel-relay012.example.com",
    );
    // future prod domain works the same way
    expect(relayPublicBaseFromPod("liebstoeckel-relay-3", "https://liveNNN.liebdecks.app")).toBe(
      "https://live003.liebdecks.app",
    );
  });

  test("returns undefined when it can't derive (caller falls back)", () => {
    const tpl = "https://liebstoeckel-relayNNN.example.com";
    expect(relayPublicBaseFromPod(undefined, tpl)).toBeUndefined();
    expect(relayPublicBaseFromPod("liebstoeckel-relay-0", undefined)).toBeUndefined();
    expect(relayPublicBaseFromPod("liebstoeckel-relay-0", "https://no-placeholder.example")).toBeUndefined();
    expect(relayPublicBaseFromPod("garbage", tpl)).toBeUndefined();
  });
});
