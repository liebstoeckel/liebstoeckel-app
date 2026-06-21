// Bundle-time third-party license collection.
//
// A built deck inlines its client import graph, React, Motion, Yjs, the variable
// fonts, into one minified `.html`. Every one of those licenses (MIT, OFL-1.1, and
// our own MPL-2.0) requires its notice to travel with the redistributed code, but
// `minify:true` strips all comments. So we recompute the notice from the *actual*
// module graph of each build and embed it as an inert <script> (same minify-proof
// carrier as `embedSource`/`embedManifest`). Recomputing per build is the point:
// swap a font or add a chart lib and the notice updates itself, declared
// package.json deps would lie. Everything here is Bun-native (no new dependency).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, sep } from "node:path";

/** Inert <script> carrier, the browser never parses it (mirrors SOURCE_ATTR). */
export const LICENSE_ATTR = "data-liebstoeckel-licenses";

const NODE_MODULES = `${sep}node_modules${sep}`;
const FIRST_PARTY = "@liebstoeckel/";

/** SPDX ids we consider satisfiable by attribution alone (no copyleft/source duties
 *  beyond shipping the notice, which we do). `licenses --check` fails on anything
 *  outside this set, a GPL/AGPL/CC-BY/unknown dep should be a loud build-time stop,
 *  not a silent ship. OFL-1.1 is here because we only ever *embed* fonts (allowed),
 *  never sell them standalone; MPL-2.0 is our own + build-tool-only deps. */
export const ALLOWED_SPDX = new Set([
  "MIT",
  "MIT-0",
  "ISC",
  "0BSD",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "Unlicense",
  "CC0-1.0",
  "Python-2.0",
  "OFL-1.1",
  "MPL-2.0",
]);

export interface LicensePackage {
  name: string;
  version: string;
  /** SPDX id (or expression) as declared in the package's package.json. */
  license: string;
  /** Verbatim LICENSE/COPYING text when the package ships one, else a synthesized
   *  fallback (see `fallbackLicenseText`); null only if neither is available. */
  text: string | null;
  /** True when `text` came from a real file on disk (vs. an SPDX template). */
  fromFile: boolean;
}

export interface LicenseReport {
  /** Third-party packages whose code/assets landed in the bundle. */
  packages: LicensePackage[];
  /** @liebstoeckel/* packages that contributed (all MPL-2.0; reported once). */
  firstParty: string[];
  /** SPDX ids present that are NOT in ALLOWED_SPDX (drives `--check`). */
  flagged: { name: string; version: string; license: string }[];
}

/** A recorder plugin + a `report()` that resolves the recorded paths to packages.
 *  Add `plugin` to a `Bun.build({ plugins })` array; call `report()` after a
 *  successful build. The plugin only observes (always returns undefined), so it
 *  never alters resolution or loading. Proven to capture both JS modules and
 *  CSS `url()` font assets (the resolved absolute path carries the version). */
export function createLicenseCollector(opts: { selfName?: string } = {}): {
  plugin: import("bun").BunPlugin;
  report: () => LicenseReport;
} {
  const paths = new Set<string>();
  const record = (p: string | undefined) => {
    // Only absolute, real on-disk paths map to a package; ignore bare specifiers,
    // virtual modules (`\0`-prefixed), and data: URIs.
    if (p && p.startsWith(sep) && !p.includes("\0")) paths.add(p);
  };
  // ONLY hook onLoad, never onResolve. A catch-all `onResolve` that returns undefined
  // is NOT a no-op in Bun's bundler: registering it perturbs resolution enough to
  // miscompile some modules under minification (observed: a deck importing `@visx/shape`
  // built minified threw `ReferenceError: <mangled> is not defined` from d3-shape's stack
  // code, because a declaration got dropped while its reference survived). `onLoad` with a
  // catch-all filter that returns undefined IS inert, and its `args.path` is the resolved
  // absolute path of every loaded module (including CSS `url()` font assets), so it
  // captures the full graph (fonts included) without touching the output.
  const plugin: import("bun").BunPlugin = {
    name: "liebstoeckel-license-collector",
    setup(build) {
      build.onLoad({ filter: /.*/ }, (args) => {
        record(args.path);
        return undefined;
      });
    },
  };
  return { plugin, report: () => buildReport(paths, opts.selfName) };
}

/** Resolve a set of absolute file paths to their owning packages and build a report.
 *  `selfName` (the deck's own package name) is excluded, a deck never lists itself.
 *  Exported for the CLI's collect-from-dir path and for tests. */
export function buildReport(paths: Iterable<string>, selfName?: string): LicenseReport {
  const thirdParty = new Map<string, LicensePackage>(); // name@version → pkg
  const firstParty = new Set<string>();
  const flagged: LicenseReport["flagged"] = [];

  for (const p of paths) {
    const pkgDir = nearestPackageDir(p);
    if (!pkgDir) continue;
    let meta: { name?: string; version?: string; license?: string; author?: unknown };
    try {
      meta = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
    } catch {
      continue;
    }
    if (!meta.name) continue;
    if (selfName && meta.name === selfName) continue; // the deck never lists itself

    // First-party (@liebstoeckel/*) by name, works whether they resolve to the
    // monorepo's packages/*/src or to an installed node_modules/.bun/@liebstoeckel+*.
    if (meta.name.startsWith(FIRST_PARTY)) {
      firstParty.add(meta.name); // all MPL-2.0, reported once
      continue;
    }
    // Everything else is third-party only if it lives under node_modules; a local
    // dir that isn't @liebstoeckel is the deck's own source, skip it.
    if (!p.includes(NODE_MODULES)) continue;
    const key = `${meta.name}@${meta.version ?? "?"}`;
    if (thirdParty.has(key)) continue;

    const license = normalizeLicense(meta.license);
    const { text, fromFile } = readLicense(pkgDir, license, meta);
    thirdParty.set(key, { name: meta.name, version: meta.version ?? "?", license, text, fromFile });
    if (!spdxAllowed(license)) flagged.push({ name: meta.name, version: meta.version ?? "?", license });
  }

  const packages = [...thirdParty.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { packages, firstParty: [...firstParty].sort(), flagged };
}

/** Walk up from a file to the nearest directory containing a package.json. Stops at
 *  a `node_modules`-segment boundary's package so a nested dep maps to itself. */
function nearestPackageDir(file: string): string | null {
  let dir = dirname(file);
  // bound the walk; deep node_modules nesting is still shallow in practice
  for (let i = 0; i < 50; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/** Reduce package.json `license`/`licenses` to an SPDX id/expression string. */
export function normalizeLicense(license: unknown): string {
  if (typeof license === "string") return license;
  if (license && typeof license === "object") {
    const l = license as { type?: string };
    if (l.type) return l.type;
  }
  if (Array.isArray(license)) {
    return (license as { type?: string }[]).map((l) => l.type ?? "UNKNOWN").join(" OR ");
  }
  return "UNKNOWN";
}

/** True if every required term of an SPDX expression is in ALLOWED_SPDX. For an
 *  `OR` expression, one allowed term suffices; for `AND` (and bare ids), all must
 *  be allowed. Parenthesised/compound expressions fall back to "all terms allowed". */
export function spdxAllowed(expr: string): boolean {
  const ids = expr.match(/[A-Za-z0-9.+-]+/g)?.filter((t) => !/^(OR|AND|WITH)$/i.test(t)) ?? [];
  if (ids.length === 0) return false;
  const allowed = (id: string) => ALLOWED_SPDX.has(id);
  if (/\bOR\b/i.test(expr)) return ids.some(allowed);
  return ids.every(allowed);
}

const LICENSE_FILES = ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "LICENCE.md", "COPYING", "COPYING.md"];

function readLicense(
  pkgDir: string,
  license: string,
  meta: { name?: string; version?: string; author?: unknown },
): { text: string | null; fromFile: boolean } {
  for (const f of LICENSE_FILES) {
    const path = join(pkgDir, f);
    if (existsSync(path)) {
      try {
        return { text: readFileSync(path, "utf8").trim(), fromFile: true };
      } catch {
        /* fall through */
      }
    }
  }
  // some packages name it LICENSE-MIT etc.
  try {
    const alt = readdirSync(pkgDir).find((n) => /^licen[cs]e/i.test(n));
    if (alt) return { text: readFileSync(join(pkgDir, alt), "utf8").trim(), fromFile: true };
  } catch {
    /* ignore */
  }
  return { text: fallbackLicenseText(license, meta), fromFile: false };
}

/** Authorship line for templated short licenses (MIT/ISC/BSD). */
function copyrightHolder(meta: { author?: unknown }): string {
  const a = meta.author as string | { name?: string } | undefined;
  if (typeof a === "string") return a.replace(/\s*<[^>]*>/, "").replace(/\s*\([^)]*\)/, "").trim();
  if (a && typeof a === "object" && a.name) return a.name;
  return "the authors";
}

/** Short SPDX templates for the permissive licenses that occasionally ship no
 *  LICENSE file. Longer licenses (Apache-2.0, MPL-2.0, OFL-1.1) effectively always
 *  ship their own file in practice; if one ever doesn't we record the SPDX id +
 *  canonical URL rather than inline several KB of boilerplate per package. */
export function fallbackLicenseText(license: string, meta: { author?: unknown }): string | null {
  const holder = copyrightHolder(meta);
  const id = license.trim();
  if (id === "MIT" || id === "ISC") {
    const grant =
      id === "MIT"
        ? `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.`
        : `Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.`;
    return `${id} License\n\nCopyright (c) ${holder}\n\n${grant}\n\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`;
  }
  if (id === "0BSD") {
    return `BSD Zero Clause License\n\nCopyright (c) ${holder}\n\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted.\n\nTHE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE.`;
  }
  const url = `https://spdx.org/licenses/${encodeURIComponent(id)}.html`;
  return `${id}\n\nCopyright (c) ${holder}\nFull license text: ${url}`;
}

export interface RenderOptions {
  /** First-party notice prepended verbatim (our MPL-2.0 line + source URL). */
  selfNotice?: string;
}

const DIVIDER = "\n\n" + "-".repeat(72) + "\n\n";

/** Render the human-readable THIRD_PARTY_NOTICES text from a report. */
export function renderNotices(report: LicenseReport, opts: RenderOptions = {}): string {
  const parts: string[] = [];
  parts.push(
    "THIRD-PARTY SOFTWARE NOTICES\n\n" +
      "This file is generated at build time from the modules actually bundled into\n" +
      "this presentation. It is regenerated on every build, so it reflects exactly\n" +
      "the third-party code and fonts embedded in this .html file.",
  );
  if (opts.selfNotice) parts.push(opts.selfNotice.trim());
  if (report.firstParty.length) {
    parts.push(
      "liebstoeckel framework packages (MPL-2.0):\n  " +
        report.firstParty.join("\n  ") +
        "\nSource: https://github.com/liebstoeckel/liebstoeckel",
    );
  }
  for (const p of report.packages) {
    const header = `${p.name}@${p.version} ,  ${p.license}`;
    parts.push(p.text ? `${header}\n\n${p.text}` : header);
  }
  return parts.join(DIVIDER) + "\n";
}

/** Embed the notices as an inert <script> before the last </body> (same insertion
 *  rule and rationale as embedSource: survives minification, immune to the
 *  `</body>`-in-a-literal hazard since the payload is plain text we control). */
export function embedLicenses(html: string, notices: string): string {
  const tag = `<script type="text/plain" ${LICENSE_ATTR}>\n${notices}\n</script>`;
  const at = html.lastIndexOf("</body>");
  return at >= 0 ? html.slice(0, at) + tag + html.slice(at) : html + tag;
}

/** Read an embedded notices block back, or null if the HTML carries none. */
export function extractLicenses(html: string): string | null {
  const re = new RegExp(`<script[^>]*${LICENSE_ATTR}[^>]*>([\\s\\S]*?)</script>`, "i");
  const m = html.match(re);
  return m ? m[1]!.trim() : null;
}
