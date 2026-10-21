import { test, expect, describe } from "bun:test";
import { browserSuite, chromiumAvailable, withPage } from "./harness";

// The harness bounds every browser action, so a stuck step fails on its own with a
// message that names the locator instead of hanging until bun's test timeout.
describe.skipIf(!chromiumAvailable())(browserSuite("withPage timeouts (headless Chromium)"), () => {
  test("an action that cannot complete fails within its timeout, naming the locator", async () => {
    const started = Date.now();
    let message = "";
    try {
      await withPage({ actionTimeout: 500 }, async (page) => {
        await page.setContent("<p>nothing to click</p>");
        await page.locator("#no-such-button").click();
      });
    } catch (e) {
      message = String(e);
    }
    expect(message).toContain("Timeout 500ms exceeded");
    expect(message).toContain("#no-such-button");
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 30_000);
});
