import { describe, expect, test } from "bun:test";
import { describeFinding, isDeniedPath, scanText, scanTree } from "./secrets.ts";

// Keys are assembled at run time so this file itself holds none.
const k = (...parts: string[]) => parts.join("");

describe("scanText", () => {
  test("finds credentials with their line and kind, never the value", () => {
    const text = [
      "# Slides",
      `aws: ${k("AKIA", "Q3XY7B2MZL5PR8TW")}`,
      `gh: ${k("ghp_", "a".repeat(20), "B".repeat(16))}`,
      k("-----BEGIN ", "RSA PRIVATE KEY-----"),
      `stripe = "${k("sk_", "live_", "51Habc", "d".repeat(20))}"`,
    ].join("\n");
    const found = scanText("a.mdx", text);
    expect(found.map((f) => [f.line, f.kind, f.strength])).toEqual([
      [2, "an AWS access key", "block"],
      [3, "a GitHub token", "block"],
      [4, "a private key", "block"],
      [5, "a Stripe secret key", "block"],
    ]);
    expect(describeFinding(found[0]!)).toBe("a.mdx:2 looks like an AWS access key");
    expect(text.slice(found[0]!.index, found[0]!.index + found[0]!.length)).toBe(k("AKIA", "Q3XY7B2MZL5PR8TW"));
  });

  test("weaker signs warn, documentation examples and placeholders pass", () => {
    expect(scanText("a.ts", 'const password = "hQ7#v9Lk2pX!mZ4r";').map((f) => f.strength)).toEqual(["warn"]);
    expect(scanText("a.ts", 'const password = "aaaaaaaaaaaaaaaaaaaa";')).toEqual([]);
    expect(scanText("a.mdx", "Keys look like AKIAIOSFODNN7EXAMPLE.")).toEqual([]);
    expect(scanText("a.mdx", `token: ${k("ghp_", "x".repeat(36))}`)).toEqual([]);
    expect(scanText("a.mdx", "A slide about sk-learn and AIza things")).toEqual([]);
  });

  test("scanTree covers every file, sorted", () => {
    const tree = { "b.ts": `x ${k("xoxb-", "1234567890-abc")}`, "a.ts": "fine" };
    expect(scanTree(tree).map((f) => f.path)).toEqual(["b.ts"]);
  });
});

describe("isDeniedPath", () => {
  test("credential files by name", () => {
    for (const p of [".env", ".env.local", "config/.env.production.json", "certs/server.pem", "id_rsa", "id_ed25519.pub", "secrets.json", "src/client_secret.ts", "aws-credentials.yaml", ".npmrc", "service-account-prod.json"]) {
      expect(isDeniedPath(p)).toBe(true);
    }
    for (const p of ["slides/01-intro.mdx", "src/id_card.tsx", "environment.md", "keynote.mdx", "data/keys.json"]) {
      expect(isDeniedPath(p)).toBe(false);
    }
  });
});
