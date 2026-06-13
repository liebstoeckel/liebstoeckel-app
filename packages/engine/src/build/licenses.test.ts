import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ALLOWED_SPDX,
  buildReport,
  embedLicenses,
  extractLicenses,
  fallbackLicenseText,
  normalizeLicense,
  renderNotices,
  spdxAllowed,
} from "./licenses";

describe("normalizeLicense", () => {
  test("string passes through", () => expect(normalizeLicense("MIT")).toBe("MIT"));
  test("legacy {type} object", () => expect(normalizeLicense({ type: "ISC" })).toBe("ISC"));
  test("missing → UNKNOWN", () => expect(normalizeLicense(undefined)).toBe("UNKNOWN"));
});

describe("spdxAllowed", () => {
  test("bare permissive id", () => expect(spdxAllowed("MIT")).toBe(true));
  test("OFL + MPL are allowed (fonts / first-party)", () => {
    expect(spdxAllowed("OFL-1.1")).toBe(true);
    expect(spdxAllowed("MPL-2.0")).toBe(true);
  });
  test("OR needs only one allowed term", () => expect(spdxAllowed("(MIT OR Apache-2.0)")).toBe(true));
  test("OR where one side is copyleft still ok", () => expect(spdxAllowed("(GPL-3.0-only OR MIT)")).toBe(true));
  test("AND needs every term allowed", () => {
    expect(spdxAllowed("MIT AND ISC")).toBe(true);
    expect(spdxAllowed("MIT AND GPL-3.0-only")).toBe(false);
  });
  test("copyleft / unknown rejected", () => {
    expect(spdxAllowed("GPL-3.0-or-later")).toBe(false);
    expect(spdxAllowed("LGPL-3.0")).toBe(false);
    expect(spdxAllowed("CC-BY-4.0")).toBe(false);
    expect(spdxAllowed("UNKNOWN")).toBe(false);
    expect(spdxAllowed("")).toBe(false);
  });
  test("allowlist is the single source of truth", () => expect(ALLOWED_SPDX.has("MIT")).toBe(true));
});

describe("fallbackLicenseText", () => {
  test("MIT template carries the grant + holder", () => {
    const t = fallbackLicenseText("MIT", { author: "Ryan Day <x@y.z>" })!;
    expect(t).toContain("Permission is hereby granted");
    expect(t).toContain("Ryan Day");
  });
  test("unknown license → SPDX pointer, never silently empty", () => {
    const t = fallbackLicenseText("Custom-1.0", {})!;
    expect(t).toContain("spdx.org/licenses/Custom-1.0");
  });
});

describe("buildReport (path → package mapping)", () => {
  // Hermetic fixture: a fake node_modules tree fed real on-disk paths.
  const root = mkdtempSync(join(tmpdir(), "lic-test-"));
  const pkg = (rel: string, json: object, license?: string) => {
    const dir = join(root, rel);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify(json));
    if (license) writeFileSync(join(dir, "LICENSE"), license);
    return join(dir, "index.js");
  };
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const reactPath = pkg("node_modules/react", { name: "react", version: "19.2.6", license: "MIT" }, "MIT real text");
  const fontPath = pkg(
    "node_modules/@fontsource-variable/fraunces",
    { name: "@fontsource-variable/fraunces", version: "5.2.9", license: "OFL-1.1" },
    "SIL OPEN FONT LICENSE real text",
  );
  const gplPath = pkg("node_modules/somegpl", { name: "somegpl", version: "1.0.0", license: "GPL-3.0-only" });
  const nolicPath = pkg("node_modules/qrcode", {
    name: "qrcode",
    version: "1.5.4",
    license: "MIT",
    author: "Ryan Day",
  }); // no LICENSE file → fallback
  const firstParty = pkg("node_modules/@liebstoeckel/engine", {
    name: "@liebstoeckel/engine",
    version: "0.3.3",
    license: "MPL-2.0",
  });
  const selfPath = pkg("deck-src", { name: "my-deck", version: "0.0.0" }); // deck's own source (not node_modules)

  const report = buildReport([reactPath, fontPath, gplPath, nolicPath, firstParty, selfPath], "my-deck");

  test("third-party packages collected & deduped", () => {
    const names = report.packages.map((p) => `${p.name}@${p.version}`);
    expect(names).toContain("react@19.2.6");
    expect(names).toContain("@fontsource-variable/fraunces@5.2.9");
    expect(names).toContain("qrcode@1.5.4");
  });
  test("real LICENSE text read from disk; missing one synthesized", () => {
    expect(report.packages.find((p) => p.name === "react")!.text).toContain("MIT real text");
    expect(report.packages.find((p) => p.name === "react")!.fromFile).toBe(true);
    const q = report.packages.find((p) => p.name === "qrcode")!;
    expect(q.fromFile).toBe(false);
    expect(q.text).toContain("Permission is hereby granted");
  });
  test("@liebstoeckel/* is first-party (MPL), reported once, not third-party", () => {
    expect(report.firstParty).toContain("@liebstoeckel/engine");
    expect(report.packages.some((p) => p.name.startsWith("@liebstoeckel/"))).toBe(false);
  });
  test("the deck's own package is excluded entirely", () => {
    expect(report.packages.some((p) => p.name === "my-deck")).toBe(false);
    expect(report.firstParty).not.toContain("my-deck");
  });
  test("non-permissive licenses are flagged for --check", () => {
    expect(report.flagged.map((f) => f.name)).toEqual(["somegpl"]);
  });
});

describe("renderNotices + embed/extract roundtrip", () => {
  const report = buildReport([], undefined);
  report.packages.push({ name: "react", version: "19.2.6", license: "MIT", text: "MIT BODY", fromFile: true });
  report.firstParty.push("@liebstoeckel/engine");
  const notices = renderNotices(report, { selfNotice: "MPL self notice + source url" });

  test("notices include self, first-party, and a third-party body", () => {
    expect(notices).toContain("MPL self notice + source url");
    expect(notices).toContain("@liebstoeckel/engine");
    expect(notices).toContain("react@19.2.6");
    expect(notices).toContain("MIT BODY");
  });

  test("embed → extract survives an HTML document", () => {
    const html = "<html><body><h1>deck</h1></body></html>";
    const out = embedLicenses(html, notices);
    expect(out).toContain("data-liebstoeckel-licenses");
    expect(extractLicenses(out)).toBe(notices.trim());
  });

  test("extract returns null when no block present", () => {
    expect(extractLicenses("<html><body>nope</body></html>")).toBeNull();
  });
});
