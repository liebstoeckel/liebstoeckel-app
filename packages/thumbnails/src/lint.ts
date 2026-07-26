import { renderDeckSlides, type RenderDriveOptions } from "./capture";

/**
 * Visual lint: render a built deck headless (the same drive loop thumbnails
 * use) and audit each slide's DOM for content a human would call broken,
 * text cut off by a clipping container, chart text clipped by its svg
 * viewport, and text extending off the stage. Deterministic DOM math, no
 * screenshots, no model.
 */

export type VisualFindingKind = "clipped-text" | "svg-clipped-text" | "offstage-text";

export interface VisualFinding {
  /** 0-based slide index (matches spec.slides / the capture protocol). */
  slide: number;
  kind: VisualFindingKind;
  /** A snippet of the affected text. */
  text: string;
  /** Compact DOM path of the offending element, for orientation not selection. */
  path: string;
  /** How far the content overflows, in CSS px. */
  px: number;
  detail: string;
}

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

type RawFinding = Omit<VisualFinding, "slide">;

/**
 * The in-page audit. Runs inside the headless browser via page.evaluate, so it
 * must stay fully self-contained (no outer-scope references). Exported for
 * direct unit testing against hand-built pages.
 */
export const auditSlideDom = (args: { tolerance: number; max: number }): RawFinding[] => {
  const { tolerance, max } = args;
  const findings: {
    kind: "clipped-text" | "svg-clipped-text" | "offstage-text";
    text: string;
    path: string;
    px: number;
    detail: string;
  }[] = [];
  const reported = new Set<Element>();

  const visible = (el: Element): boolean => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    const opacity = parseFloat(cs.opacity);
    if (!Number.isNaN(opacity) && opacity < 0.05) return false;
    return true;
  };
  // Decorative subtrees opt out of the audit the same way they opt out of the
  // a11y tree; Atmosphere's oversized gradient blooms are aria-hidden.
  const decorative = (el: Element): boolean => el.closest('[aria-hidden="true"]') != null;

  const snippet = (el: Element): string => (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60);

  const pathOf = (el: Element): string => {
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur && cur !== document.body && parts.length < 3) {
      let seg = cur.tagName.toLowerCase();
      const cls =
        typeof (cur as HTMLElement).className === "string"
          ? (cur as HTMLElement).className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")
          : "";
      if (cls) seg += `.${cls}`;
      parts.unshift(seg);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  };

  const hasOwnText = (el: Element): boolean => {
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0) return true;
    }
    return false;
  };

  const ancestorReported = (el: Element): boolean => {
    let cur: Element | null = el;
    while (cur) {
      if (reported.has(cur)) return true;
      cur = cur.parentElement;
    }
    return false;
  };

  const push = (kind: (typeof findings)[number]["kind"], el: Element, px: number, detail: string): void => {
    if (findings.length >= max || ancestorReported(el)) return;
    reported.add(el);
    findings.push({ kind, text: snippet(el), path: pathOf(el), px: Math.round(px), detail });
  };

  // 1) Text cut off by a clipping HTML container: the element clips its own
  //    overflow AND its content wants more room AND there is text in there.
  //    Slides never scroll, so auto/scroll count as clipping too.
  for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
    if (el instanceof SVGElement) continue;
    if (!visible(el) || decorative(el)) continue;
    if (!(el.textContent ?? "").trim()) continue;
    const cs = getComputedStyle(el);
    const clips = (v: string) => v === "hidden" || v === "clip" || v === "auto" || v === "scroll";
    const ox = clips(cs.overflowX) ? el.scrollWidth - el.clientWidth : 0;
    const oy = clips(cs.overflowY) ? el.scrollHeight - el.clientHeight : 0;
    if (ox > tolerance || oy > tolerance) {
      const dims =
        ox > oy ? `${ox}px wider than its clipping container` : `${oy}px taller than its clipping container`;
      const ell = cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none" ? " (ellipsis truncation)" : "";
      push("clipped-text", el, Math.max(ox, oy), `content is ${dims}${ell}`);
    }
  }

  // 2) SVG text clipped by its svg viewport (svg overflow defaults to hidden):
  //    the classic chart failure, a tick/category label wider than the margin.
  for (const svg of Array.from(document.body.querySelectorAll("svg"))) {
    if (!visible(svg) || decorative(svg)) continue;
    if (getComputedStyle(svg).overflow === "visible") continue;
    const box = svg.getBoundingClientRect();
    for (const t of Array.from(svg.querySelectorAll("text"))) {
      if (!visible(t) || !(t.textContent ?? "").trim()) continue;
      const r = t.getBoundingClientRect();
      const px = Math.max(box.left - r.left, r.right - box.right, box.top - r.top, r.bottom - box.bottom);
      if (px > tolerance) {
        const side =
          box.left - r.left === px ? "left" : r.right - box.right === px ? "right" : box.top - r.top === px ? "top" : "bottom";
        push("svg-clipped-text", t, px, `text sticks ${Math.round(px)}px past the svg's ${side} edge (clipped)`);
      }
    }
  }

  // 3) Text extending beyond the stage (the viewport in capture mode). Checked
  //    on elements that OWN text so a full-bleed wrapper doesn't mask a leaf.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
    if (el instanceof SVGElement) continue;
    if (!visible(el) || decorative(el) || !hasOwnText(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const px = Math.max(-r.left, -r.top, r.right - vw, r.bottom - vh);
    if (px > tolerance) {
      const side = -r.left === px ? "left" : -r.top === px ? "top" : r.right - vw === px ? "right" : "bottom";
      push("offstage-text", el, px, `text extends ${Math.round(px)}px past the ${side} edge of the stage`);
    }
  }

  return findings;
};

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
  // Native authoring canvas, real font metrics; entrance motion moves text for
  // up to ~1s, so measure the settled layout.
  const drive: RenderDriveOptions = { width: 1280, height: 720, scale: 1, settleMs: 1100, ...opts };
  const { count } = await renderDeckSlides(html, drive, async (i, page) => {
    const raw = await page.evaluate(auditSlideDom, { tolerance, max });
    for (const f of raw) findings.push({ slide: i, ...f });
  });
  return { count, findings };
}
