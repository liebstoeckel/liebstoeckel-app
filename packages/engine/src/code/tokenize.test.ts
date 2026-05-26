import { test, expect, describe } from "bun:test";
import { tokenizeStep } from "./tokenize";

describe("tokenizeStep (Shiki, build-time)", () => {
  test("tokenizes TS into lines whose colors are brand-bound CSS vars", async () => {
    const step = await tokenizeStep("const a = 1\nconst b = 2", "ts");
    expect(step.lang).toBe("typescript");
    expect(step.lines.length).toBe(2);
    const flat = step.lines.flat();
    expect(flat.map((t) => t.content).join("")).toContain("const");
    // css-variables theme → every color is a var(--shiki-*) reference, never a hex
    const colored = flat.filter((t) => t.color);
    expect(colored.length).toBeGreaterThan(0);
    expect(colored.every((t) => t.color!.startsWith("var(--shiki-"))).toBe(true);
  }, 20_000);

  test("a 'ts' alias resolves and trailing newline is trimmed to N lines", async () => {
    const step = await tokenizeStep("type X = number\n", "ts");
    expect(step.lines.length).toBe(1);
  }, 20_000);

  test("unknown language falls back to plain text (no throw)", async () => {
    const step = await tokenizeStep("hello world", "not-a-lang");
    expect(step.lines.length).toBe(1);
    expect(step.lines[0]!.map((t) => t.content).join("")).toBe("hello world");
  }, 20_000);
});
