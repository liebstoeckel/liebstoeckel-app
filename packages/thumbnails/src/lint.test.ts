import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium, type Browser, type Page } from "playwright-core";
import { hasChromium, resolveChromium } from "./capture";
import { auditSlideDom } from "./lint";

/** Same container-friendly flags the capture driver uses. */
const ARGS = ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--renderer-process-limit=1"];

const available = hasChromium();

describe.skipIf(!available)("auditSlideDom (in a real browser)", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true, executablePath: resolveChromium(), args: ARGS });
    page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  const audit = async (bodyHtml: string) => {
    await page.setContent(`<!doctype html><html><body style="margin:0">${bodyHtml}</body></html>`);
    return page.evaluate(auditSlideDom, { tolerance: 3, max: 20 });
  };

  test("clean content produces no findings", async () => {
    const findings = await audit(`<div style="width:600px;overflow:hidden"><p>fits fine</p></div>`);
    expect(findings).toEqual([]);
  });

  test("flags text cut off by an overflow-hidden container", async () => {
    const findings = await audit(
      `<div style="width:120px;overflow:hidden;white-space:nowrap;font-size:20px">
         a rather long headline that cannot possibly fit
       </div>`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.kind).toBe("clipped-text");
    expect(findings[0]!.px).toBeGreaterThan(50);
    expect(findings[0]!.text).toContain("a rather long headline");
  });

  test("flags svg text clipped by the svg viewport (the chart-label case)", async () => {
    const findings = await audit(
      `<svg width="300" height="120" style="display:block">
         <text x="-40" y="60" font-size="14">Compost heap colony</text>
       </svg>`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.kind).toBe("svg-clipped-text");
    expect(findings[0]!.detail).toContain("left");
  });

  test("svg text inside the viewport is fine", async () => {
    const findings = await audit(
      `<svg width="300" height="120"><text x="10" y="60" font-size="14">Our colony</text></svg>`,
    );
    expect(findings).toEqual([]);
  });

  test("flags text positioned off the stage", async () => {
    const findings = await audit(
      `<p style="position:absolute;left:1240px;top:10px;width:200px;font-size:18px">runs off the right edge</p>`,
    );
    expect(findings.some((f) => f.kind === "offstage-text" && f.detail.includes("right"))).toBeTrue();
  });

  test("ignores aria-hidden decoration that deliberately bleeds off-canvas", async () => {
    const findings = await audit(
      `<div aria-hidden="true" style="position:absolute;left:-200px;top:-100px;width:900px;height:900px">
         <span>decorative glyph</span>
       </div>`,
    );
    expect(findings).toEqual([]);
  });

  test("ignores invisible elements", async () => {
    const findings = await audit(
      `<div style="width:80px;overflow:hidden;white-space:nowrap;display:none">hidden long text that would overflow</div>
       <div style="width:80px;overflow:hidden;white-space:nowrap;opacity:0">transparent long text that would overflow</div>`,
    );
    expect(findings).toEqual([]);
  });

  test("reports the clipping ancestor once, not every descendant", async () => {
    const findings = await audit(
      `<div style="width:100px;overflow:hidden;white-space:nowrap">
         <span><strong>deeply nested very long content that overflows a lot</strong></span>
       </div>`,
    );
    expect(findings.filter((f) => f.kind === "clipped-text")).toHaveLength(1);
  });

  test("caps findings per slide", async () => {
    const many = Array.from(
      { length: 40 },
      (_, i) =>
        `<div style="width:60px;overflow:hidden;white-space:nowrap">overflowing item number ${i} with long text</div>`,
    ).join("");
    await page.setContent(`<!doctype html><html><body>${many}</body></html>`);
    const capped = await page.evaluate(auditSlideDom, { tolerance: 3, max: 5 });
    expect(capped).toHaveLength(5);
  });
});

if (!available) {
  test("visual lint tests skipped (no Chromium available)", () => {
    expect(true).toBeTrue();
  });
}
