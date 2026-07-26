import { describe, expect, test } from "bun:test";
import { normalizeBinaryPath, systemChromiumCandidates } from "./capture";

describe("systemChromiumCandidates", () => {
  test("honors PUPPETEER_EXECUTABLE_PATH and CHROME_PATH first", () => {
    const c = systemChromiumCandidates({ PUPPETEER_EXECUTABLE_PATH: "/p/chrome", CHROME_PATH: "/c/chrome" });
    expect(c[0]).toBe("/p/chrome");
    expect(c[1]).toBe("/c/chrome");
  });

  test("always offers the macOS app bundle paths", () => {
    const c = systemChromiumCandidates({});
    expect(c).toContain("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    expect(c).toContain("/Applications/Chromium.app/Contents/MacOS/Chromium");
  });

  test("derives a Windows path from PROGRAMFILES", () => {
    const c = systemChromiumCandidates({ PROGRAMFILES: "C:\\Program Files" });
    expect(c.some((p) => p.includes("Google") && p.endsWith("chrome.exe"))).toBe(true);
  });

  test("omits env-derived entries when those vars are unset", () => {
    const c = systemChromiumCandidates({});
    expect(c).not.toContain("");
    // no PROGRAMFILES → no chrome.exe candidate
    expect(c.some((p) => p.endsWith("chrome.exe"))).toBe(false);
  });

  test("finds Windows roots under their real mixed-case env names", () => {
    // Windows canonically sets "ProgramFiles(x86)"/"LocalAppData", and a plain
    // env object (spawn env, tests) is case-sensitive, so the lookup must not
    // depend on an uppercase key being present.
    const c = systemChromiumCandidates({
      "ProgramFiles(x86)": "C:\\Program Files (x86)",
      LocalAppData: "C:\\Users\\u\\AppData\\Local",
    });
    expect(c.some((p) => p.startsWith("C:\\Program Files (x86)") && p.endsWith("chrome.exe"))).toBe(true);
    expect(c.some((p) => p.startsWith("C:\\Users\\u\\AppData\\Local") && p.endsWith("chrome.exe"))).toBe(true);
  });

  test("honors ProgramW6432 and mixed-case env vars", () => {
    const c = systemChromiumCandidates({ ProgramW6432: "C:\\Program Files", Chrome_Path: "D:\\my\\chrome.exe" });
    expect(c.some((p) => p.startsWith("C:\\Program Files") && p.endsWith("chrome.exe"))).toBe(true);
    expect(c).toContain("D:\\my\\chrome.exe");
  });

  test("offers Edge as a Windows fallback, ordered after every Chrome candidate", () => {
    const c = systemChromiumCandidates({ PROGRAMFILES: "C:\\Program Files" });
    const edge = c.findIndex((p) => p.endsWith("msedge.exe"));
    expect(edge).toBeGreaterThan(-1);
    const lastChrome = c.map((p) => p.endsWith("chrome.exe")).lastIndexOf(true);
    expect(edge).toBeGreaterThan(lastChrome);
  });

  test("deduplicates candidates when roots repeat", () => {
    const c = systemChromiumCandidates({ PROGRAMFILES: "C:\\Program Files", ProgramW6432: "C:\\Program Files" });
    expect(new Set(c).size).toBe(c.length);
  });
});

describe("normalizeBinaryPath", () => {
  test("strips surrounding quotes and whitespace", () => {
    expect(normalizeBinaryPath('  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" ')).toBe(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    );
    expect(normalizeBinaryPath("'/usr/bin/chromium'")).toBe("/usr/bin/chromium");
  });

  test("leaves a clean path alone", () => {
    expect(normalizeBinaryPath("/usr/bin/chromium")).toBe("/usr/bin/chromium");
  });
});
