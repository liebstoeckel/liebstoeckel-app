import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findEntryFile, parseImports, parseSlideIdentifiers, resolveSlideFiles } from "./slides";

const ENTRY = `
import { StrictMode } from "react";
import { Present } from "@liebstoeckel/engine";
import Title from "./slides/01-title.mdx";
import Agenda from "./slides/02-agenda.mdx";
import Closing, { notes } from "./slides/03-closing";
import { Travel as Trip } from "./slides/06-travel";

createRoot(document.getElementById("root")!).render(
  <Present slides={[Title, Agenda, Closing, Trip]} />,
);
`;

describe("parseImports", () => {
  test("default, default+named, and aliased named imports", () => {
    const map = parseImports(ENTRY);
    expect(map.get("Title")).toBe("./slides/01-title.mdx");
    expect(map.get("Closing")).toBe("./slides/03-closing");
    expect(map.get("notes")).toBe("./slides/03-closing");
    expect(map.get("Trip")).toBe("./slides/06-travel");
    expect(map.get("Present")).toBe("@liebstoeckel/engine");
  });
});

describe("parseSlideIdentifiers", () => {
  test("ordered identifiers from the JSX prop", () => {
    expect(parseSlideIdentifiers(ENTRY)).toEqual(["Title", "Agenda", "Closing", "Trip"]);
  });

  test("non-identifier items become empty holes; missing array is null", () => {
    expect(parseSlideIdentifiers("render({ slides: [A, wrap(B), C] })")).toEqual(["A", "", "C"]);
    expect(parseSlideIdentifiers("nothing here")).toBeNull();
  });

  test("nested brackets inside the array do not truncate the scan", () => {
    expect(parseSlideIdentifiers("slides={[A, B]} other={[1,2]}")).toEqual(["A", "B"]);
  });
});

describe("resolveSlideFiles against a real deck layout", () => {
  test("maps identifiers to existing files, extensionless imports resolved", () => {
    const dir = mkdtempSync(join(tmpdir(), "lst-dev-slides-"));
    mkdirSync(join(dir, "slides"), { recursive: true });
    writeFileSync(join(dir, "index.html"), '<html><body><script type="module" src="./main.tsx"></script></body></html>');
    writeFileSync(join(dir, "main.tsx"), ENTRY);
    writeFileSync(join(dir, "slides", "01-title.mdx"), "# t");
    writeFileSync(join(dir, "slides", "02-agenda.mdx"), "# a");
    writeFileSync(join(dir, "slides", "03-closing.tsx"), "export default () => null");
    // 06-travel deliberately missing on disk
    expect(resolveSlideFiles(dir)).toEqual([
      "slides/01-title.mdx",
      "slides/02-agenda.mdx",
      "slides/03-closing.tsx",
      null,
    ]);
  });

  test("no entry script or no slides array yields null", () => {
    const dir = mkdtempSync(join(tmpdir(), "lst-dev-slides2-"));
    writeFileSync(join(dir, "index.html"), "<html><body></body></html>");
    expect(findEntryFile(dir)).toBeNull();
    expect(resolveSlideFiles(dir)).toBeNull();
  });
});
