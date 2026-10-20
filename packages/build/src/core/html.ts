// esbuild has no HTML entry points, so the core reads a deck's index.html itself:
// it finds the module scripts and stylesheets, and after the bundle it writes one
// self-contained file (the job Bun's `compile: true` does today).

export interface HtmlEntries {
  /** `src` of every `<script type="module" src>`, in document order */
  scripts: string[];
  /** `href` of every `<link rel="stylesheet" href>` that is a local file */
  styles: string[];
}

const MODULE_SCRIPT = /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
const STYLESHEET = /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*\/?>/gi;
const isLocal = (url: string) => !/^(https?:)?\/\//.test(url) && !url.startsWith("data:");

export function htmlEntries(html: string): HtmlEntries {
  const scripts = [...html.matchAll(MODULE_SCRIPT)].map((m) => m[1]!).filter(isLocal);
  const styles = [...html.matchAll(STYLESHEET)].map((m) => m[1]!).filter(isLocal);
  return { scripts, styles };
}

/** Drop the deck's dev-mode loader (`<script data-liebstoeckel-dev>`), as the build does today. */
export function stripDevMode(html: string): string {
  return html.replace(/[ \t]*<script[^>]*\bdata-liebstoeckel-dev\b[^>]*>[\s\S]*?<\/script>\r?\n?/gi, "");
}

/** A `</script` inside the inlined module would end the tag early. */
export function escapeInlineScript(js: string): string {
  return js.replace(/<\/script/gi, "<\\/script");
}

export function escapeInlineStyle(css: string): string {
  return css.replace(/<\/style/gi, "<\\/style");
}

/** Replace the entries with the inlined bundle: CSS into <head>, JS where the first module script was. */
export function inlineHtml(html: string, js: string, css: string): string {
  let out = stripDevMode(html);
  let placed = false;
  out = out.replace(MODULE_SCRIPT, (tag, src: string) => {
    if (!isLocal(src)) return tag;
    if (placed) return "";
    placed = true;
    return `<script type="module">${escapeInlineScript(js)}</script>`;
  });
  out = out.replace(STYLESHEET, (tag, href: string) => (isLocal(href) ? "" : tag));
  if (css) {
    const style = `<style>${escapeInlineStyle(css)}</style>`;
    out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, (m) => `  ${style}${m}`) : style + out;
  }
  return out;
}
