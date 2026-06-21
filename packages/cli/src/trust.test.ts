import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureBuildTrust, isDeckTrusted, trustDeck } from "./trust";

// Point the ledger at a throwaway file so the real user config is never touched.
const ledgerDir = mkdtempSync(join(tmpdir(), "lst-trust-"));
const ledger = join(ledgerDir, "trusted-decks.json");
process.env.LIEBSTOECKEL_TRUST_FILE = ledger;

beforeEach(() => {
  rmSync(ledger, { force: true });
});
afterAll(() => {
  rmSync(ledgerDir, { recursive: true, force: true });
});

describe("trust ledger", () => {
  test("a fresh deck is untrusted; trustDeck remembers it", async () => {
    expect(await isDeckTrusted("/some/deck")).toBe(false);
    await trustDeck("/some/deck");
    expect(await isDeckTrusted("/some/deck")).toBe(true);
  });

  test("keyed by absolute path (relative resolves to cwd)", async () => {
    await trustDeck(".");
    expect(await isDeckTrusted(process.cwd())).toBe(true);
  });
});

describe("ensureBuildTrust", () => {
  test("already-trusted deck builds without prompting", async () => {
    await trustDeck("/trusted");
    let prompted = false;
    const ok = await ensureBuildTrust("/trusted", {
      confirm: () => {
        prompted = true;
        return false;
      },
    });
    expect(ok).toBe(true);
    expect(prompted).toBe(false);
  });

  test("pre-approved deck builds and is remembered (no prompt)", async () => {
    const ok = await ensureBuildTrust("/new", { preapproved: true });
    expect(ok).toBe(true);
    expect(await isDeckTrusted("/new")).toBe(true);
  });

  test("unfamiliar deck: confirm=yes trusts and builds", async () => {
    const ok = await ensureBuildTrust("/cloned", { confirm: () => true });
    expect(ok).toBe(true);
    expect(await isDeckTrusted("/cloned")).toBe(true);
  });

  test("unfamiliar deck: confirm=no refuses and does NOT remember", async () => {
    const ok = await ensureBuildTrust("/cloned", { confirm: () => false });
    expect(ok).toBe(false);
    expect(await isDeckTrusted("/cloned")).toBe(false);
  });

  test("unfamiliar deck with no confirm (non-interactive) refuses, fail-closed", async () => {
    const ok = await ensureBuildTrust("/cloned", {});
    expect(ok).toBe(false);
  });
});
