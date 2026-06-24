import { describe, expect, test } from "bun:test";
import { systemChromiumCandidates } from "./capture";

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
});
