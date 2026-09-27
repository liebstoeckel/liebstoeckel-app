import { auditSlideDom, type VisualFinding } from "@liebstoeckel/engine/build/visual-audit";
import { renderDeckSlides, type RenderDriveOptions } from "./capture";

export { auditSlideDom, type VisualFinding, type VisualFindingKind } from "@liebstoeckel/engine/build/visual-audit";

/**
 * Visual lint: render a built deck headless (the same drive loop thumbnails
 * use) and audit each slide's DOM for content a human would call broken,
 * text cut off by a clipping container, chart text clipped by its svg
 * viewport, and text extending off the stage. Deterministic DOM math, no
 * screenshots, no model.
 */

export interface VisualLintResult {
  /** Total slides the deck reported. */
  count: number;
  findings: VisualFinding[];
}

export interface VisualLintOptions extends RenderDriveOptions {
  /** Overflow below this many px is ignored (default 3, sub-antialias noise). */
  tolerancePx?: number;
  /** Cap findings per slide so one broken list doesn't flood the report. */
  maxPerSlide?: number;
}

/**
 * Lint a built single-file deck: step through every slide at the native
 * authoring size (1280x720, scale 1, real font metrics) and collect findings.
 * Needs a Chromium (same resolution chain as thumbnails); callers gate on
 * `hasChromium()` to skip cleanly.
 */
export async function lintDeckHtml(html: string, opts: VisualLintOptions = {}): Promise<VisualLintResult> {
  const tolerance = opts.tolerancePx ?? 3;
  const max = opts.maxPerSlide ?? 20;
  const findings: VisualFinding[] = [];
  // Native authoring canvas, real font metrics. The drive loop waits out fonts
  // and finite entrance animations per slide, so the settle is only a small
  // buffer for late paints, not a guess at the longest animation.
  const drive: RenderDriveOptions = { width: 1280, height: 720, scale: 1, settleMs: 250, ...opts };
  const { count } = await renderDeckSlides(html, drive, async (i, page) => {
    const raw = await page.evaluate(auditSlideDom, { tolerance, max });
    for (const f of raw) findings.push({ slide: i, ...f });
  });
  return { count, findings };
}
