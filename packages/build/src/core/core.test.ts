import { describe, expect, test } from "bun:test";
import { outputRelative } from "./build.ts";
import { virtualDir } from "./path.ts";
import { codeBlocks, compileCodeFile } from "./code-file.ts";
import { cssProblem } from "./css-gate.ts";
import { gatedFiles, GateError, MemoryFiles, recordingFiles } from "./files.ts";
import { htmlEntries, inlineHtml } from "./html.ts";
import { expandMacros, macroProblems } from "./macro.ts";
import { findComponents, matchBrace } from "./refresh.ts";
import { Resolver } from "./resolve.ts";
import { rebaseUrls } from "./tailwind.ts";

function tree(files: Record<string, string>): MemoryFiles {
  const m = new MemoryFiles();
  for (const [p, t] of Object.entries(files)) m.write(p, t);
  return m;
}

describe("resolver", () => {
  const files = tree({
    "/deck/main.tsx": "",
    "/deck/package.json": JSON.stringify({ name: "deck", imports: { "#x": "./main.tsx" }, browser: { "./other.ts": "./main.tsx" } }),
    "/deck/other.ts": "",
    "/node_modules/pkg/package.json": JSON.stringify({ name: "pkg", exports: { ".": { browser: "./b.js", default: "./n.js" }, "./sub/*": "./lib/*.js" } }),
    "/node_modules/pkg/b.js": "",
    "/node_modules/pkg/n.js": "",
    "/node_modules/pkg/lib/a.js": "",
  });

  test("exports conditions and patterns", () => {
    const r = new Resolver(files);
    expect(r.resolve("pkg", "/deck")).toEqual({ path: "/node_modules/pkg/b.js" });
    expect(r.resolve("pkg/sub/a", "/deck")).toEqual({ path: "/node_modules/pkg/lib/a.js" });
  });

  test("a deck's own redirects count locally and not when the profile refuses them", () => {
    expect(new Resolver(files).resolve("#x", "/deck")).toEqual({ path: "/deck/main.tsx" });
    expect(new Resolver(files).resolve("./other.ts", "/deck")).toEqual({ path: "/deck/main.tsx" });
    const hosted = new Resolver(files, { redirects: (dir) => dir !== "/deck" });
    expect(hosted.resolve("#x", "/deck")).toBeNull();
    expect(hosted.resolve("./other.ts", "/deck")).toEqual({ path: "/deck/other.ts" });
    // Third-party packages keep their exports.
    expect(hosted.resolve("pkg", "/deck")).toEqual({ path: "/node_modules/pkg/b.js" });
  });
});

describe("the gate", () => {
  const disk = tree({
    "/app/deck/a/x.css": "@import './y.css';",
    "/app/deck/a/bad.css": "@plugin 'x';",
    "/app/deck/a/out.css": "@import '../../secret.css';",
    "/app/secret.css": "",
    "/app/node_modules/react/index.js": "",
    "/etc/passwd": "root",
  });
  const gated = gatedFiles(disk, { deckRoot: "/app/deck/a", trustedRoots: ["/app/node_modules"], cssProblem: (css, file, scope) => cssProblem(disk, css, file, scope) });

  test("reads the deck and the trusted trees, nothing else", () => {
    expect(gated.read("/app/deck/a/x.css")).not.toBeNull();
    expect(gated.read("/app/node_modules/react/index.js")).not.toBeNull();
    expect(() => gated.read("/etc/passwd")).toThrow(GateError);
    expect(() => gated.read("/app/secret.css")).toThrow(/not allowed in the hosted preview/);
  });

  test("checks deck stylesheets before anything reads them", () => {
    expect(() => gated.read("/app/deck/a/bad.css")).toThrow(/@plugin/);
    expect(() => gated.read("/app/deck/a/out.css")).toThrow(/outside the deck/);
  });
});

describe("the code step", () => {
  test("allows only codeStory and code from the engine", () => {
    expect(macroProblems('import { codeStory } from "@liebstoeckel/engine/code" with { type: "macro" };')).toEqual([]);
    expect(macroProblems('import { x } from "./m.ts" with { type: "macro" };')[0]).toMatch(/imports \.\/m\.ts as a macro/);
    expect(macroProblems('import { x } from "macro:./m.ts";')[0]).toMatch(/"macro:" prefix/);
    expect(macroProblems('import { evil } from "@liebstoeckel/engine/code" with { type: "macro" };')[0]).toMatch(/only codeStory and code/);
    expect(macroProblems('import { x } from "./m.ts" with { /* c */ type: "macro" };').length).toBe(1);
    expect(macroProblems('import { x } from "./m.ts";')).toEqual([]);
  });

  test("replaces a literal call with its tokens and drops the import", async () => {
    const out = await expandMacros('import { codeStory as cs } from "@liebstoeckel/engine/code" with { type: "macro" };\nexport const s = cs([{ code: `const a = 1`, lang: "ts" }]);', "a.tsx");
    expect(out).not.toContain("@liebstoeckel/engine/code");
    expect(out).toContain('"content":"const"');
  });

  test("refuses arguments that are not literals", async () => {
    await expect(expandMacros('import { code } from "@liebstoeckel/engine/code" with { type: "macro" };\ncode(x);', "a.tsx")).rejects.toThrow(/literal arguments only/);
  });
});

describe("code files", () => {
  test("every fenced block is a state, its info string the language", () => {
    const blocks = codeBlocks("# greet\n\n```ts\nconst a = 1\n```\n\ntext\n\n~~~~py title\nx = 1\n~~~~\n\n```\nplain\n```\n");
    expect(blocks.map((b) => [b.lang, b.code])).toEqual([
      ["ts", "const a = 1"],
      ["py", "x = 1"],
      ["text", "plain"],
    ]);
  });

  test("compiles to the tokenized states and refuses a file without fences", async () => {
    const js = await compileCodeFile("```ts\nfunction greet(name) {\n  return name\n}\n```\n", "g.code.md");
    const steps = JSON.parse(js.slice("export default ".length, -2));
    expect(steps).toHaveLength(1);
    // No per-line time limit: the first line splits into its own tokens even cold.
    expect(steps[0].lines[0].map((t: { content: string }) => t.content)).toContain("greet");
    await expect(compileCodeFile("no fences", "g.code.md")).rejects.toThrow(/no fenced code blocks/);
  });
});

describe("the refresh pass", () => {
  test("finds top-level components with their hook calls", () => {
    const code = [
      "function Intro() {",
      '  const [n, setN] = useState(0);',
      '  const s = "}";',
      "  useEffect(() => { if (/}/.test(s)) setN(1); });",
      '  return jsx("div", { children: n });',
      "}",
      "var Card = (props) => {",
      "  const x = React.useMemo(() => 1, []);",
      "  return x;",
      "};",
      "const Memo = memo(function Inner() { return null; });",
      "const COLORS = { a: 1 };",
      "function helper() { useState(); }",
      "export { Intro as default, Card };",
    ].join("\n");
    expect(findComponents(code)).toEqual([
      { name: "Intro", signature: "useState,useEffect" },
      { name: "Card", signature: "useMemo" },
      { name: "Memo", signature: "" },
    ]);
  });

  test("matches braces past strings, templates and comments", () => {
    const src = "{ a('}'); `${ {} }`; // }\n /* } */ }";
    expect(matchBrace(src, 0)).toBe(src.length - 1);
  });
});

describe("html", () => {
  test("reads the entries and inlines the bundle", () => {
    const html = '<!doctype html><html><head><script data-liebstoeckel-dev>x</script></head><body><script type="module" src="./main.tsx"></script></body></html>';
    expect(htmlEntries(html).scripts).toEqual(["./main.tsx"]);
    const out = inlineHtml(html, 'console.log("</script>")', "a{}");
    expect(out).not.toContain("data-liebstoeckel-dev");
    expect(out).toContain("<\\/script");
    expect(out).toContain("<style>a{}</style></head>");
  });
});

describe("tailwind url rebasing", () => {
  test("points an imported stylesheet's relative urls at their files", () => {
    const files = tree({ "/deck/css/img/a.png": "x", "/deck/main.css": "" });
    const css = 'a{background:url("img/a.png")} b{src:url(@fontsource/x/a.woff2)} c{background:url(data:x)}';
    expect(rebaseUrls(files, css, "/deck/css", "/deck")).toBe('a{background:url("./css/img/a.png")} b{src:url(@fontsource/x/a.woff2)} c{background:url(data:x)}');
  });
});

describe("recording", () => {
  test("a recorded tree answers like the original", () => {
    const disk = tree({ "/a/b.txt": "hi" });
    const rec = recordingFiles(disk);
    rec.files.read("/a/b.txt");
    rec.files.stat("/a");
    const replay = new MemoryFiles(rec.snapshot());
    expect(new TextDecoder().decode(replay.read("/a/b.txt")!)).toBe("hi");
    expect(replay.stat("/a")).toBe("dir");
  });
});

describe("outputRelative", () => {
  test("output files and metafile keys map to the same name on POSIX and Windows", () => {
    expect(outputRelative("/deps/react-AB12.js", "/deps")).toBe("react-AB12.js");
    expect(outputRelative("deps/chunks/X1.js", "/deps")).toBe("chunks/X1.js");
    expect(outputRelative("C:\\deps\\chunks\\X1.js", "/deps")).toBe("chunks/X1.js");
    expect(outputRelative("C:/deps/a.css", "/deps")).toBe("a.css");
  });
});

describe("virtualDir", () => {
  test("esbuild's native resolveDir maps back to the virtual tree", () => {
    expect(virtualDir("/slides")).toBe("/slides");
    expect(virtualDir("C:\\")).toBe("/");
    expect(virtualDir("C:\\slides\\deep")).toBe("/slides/deep");
    expect(virtualDir(undefined)).toBe("/");
  });
});
