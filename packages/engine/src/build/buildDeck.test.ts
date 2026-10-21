import { test, expect, describe } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { rehydrateServerBundle } from "@liebstoeckel/plugin-sdk/manifest";
import {
  buildServerBundle,
  buildPluginManifest,
  bundleDeck,
  escapeInlineModuleScript,
  stampGenerator,
  bundledEngineVersion,
  deckPluginWarnings,
  stripDevMode,
} from "./buildDeck";

describe("buildServerBundle", () => {
  // Real `Bun.build` (target:bun), isolated to a unique tmp dir. The build itself
  // is ~6ms; even under 2x-core saturation the whole file runs in <2s. The rare
  // flake is purely environmental: `bun test` runs the 76-file suite in one
  // process, so by mid-suite that process holds a lot of memory, and on a
  // memory-constrained host (free RAM low, swap active) Bun.build can stall on
  // swap for tens of seconds. Retrying doesn't help (the process stays bloated for
  // every attempt), so the only knob here is a generous timeout: it lets a stalled
  // build finish rather than reddening the suite, while still catching a true hang.
  // On a normally-resourced runner this passes in well under a second.
  test(
    "bundles a server entry (target:bun) → base64 that rehydrates & runs with ctx",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "srvplugin-"));
      const entry = join(dir, "server.ts");
      // a server plugin that bundles a local helper (proves bundling, not just copying)
      await Bun.write(join(dir, "helper.ts"), `export const bump = (n: number): number => n + 100;`);
      await Bun.write(entry, `import { bump } from "./helper"; export default (ctx: { n: number }) => bump(ctx.n);`);

      const b64 = await buildServerBundle(entry);
      expect(typeof b64).toBe("string");
      const mod = await rehydrateServerBundle(b64, "fixture");
      expect((mod.default as (c: { n: number }) => number)({ n: 5 })).toBe(105);
    },
    180_000,
  );
});

describe("buildPluginManifest", () => {
  test("returns null when package.json is missing", async () => {
    expect(await buildPluginManifest("/no/such/package.json")).toBeNull();
  });

  test("lists the deck's own plugins with the audience fields its package.json declares", async () => {
    const dir = mkdtempSync(join(tmpdir(), "localplugin-"));
    try {
      const pkg = { name: "my-deck", version: "1.0.0", liebstoeckel: { plugins: { mood: { audienceWrites: ["votes"] } } } };
      writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
      const manifest = await buildPluginManifest(join(dir, "package.json"));
      expect(manifest?.plugins).toEqual([
        { name: "my-deck#mood", version: "1.0.0", hasServer: false, id: "mood", audienceWrites: ["votes"] },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a malformed declaration fails the build", async () => {
    const dir = mkdtempSync(join(tmpdir(), "localplugin-"));
    try {
      const pkg = { name: "my-deck", liebstoeckel: { plugins: { mood: { audienceWrites: "votes" } } } };
      writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
      await expect(buildPluginManifest(join(dir, "package.json"))).rejects.toThrow("audienceWrites must be a list");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("deckPluginWarnings", () => {
  const def = {
    path: "plugins/mood.tsx",
    text: `const s = schema({ votes: t.record(t.string), "closed": t.boolean });\nexport default definePlugin({ id: "mood", state: s, client: { Slide } });`,
  };

  test("a declaration the source backs is quiet", () => {
    expect(deckPluginWarnings([{ id: "mood", audienceWrites: ["votes", "closed"] }], [def])).toEqual([]);
  });

  test("an id no deck file defines is named", () => {
    const [w] = deckPluginWarnings([{ id: "mod", audienceWrites: ["votes"] }], [def]);
    expect(w).toContain('plugin "mod"');
    expect(w).toContain("no deck file defines a plugin with that id");
  });

  test("a field no deck file has is named, with the file that defines the plugin", () => {
    const [w] = deckPluginWarnings([{ id: "mood", audienceWrites: ["vots"] }], [def]);
    expect(w).toContain('"vots"');
    expect(w).toContain("plugins/mood.tsx");
  });

  test("a placement in a slide is not a definition", () => {
    const slide = { path: "slides/a.mdx", text: `<Plugin id="mood" />` };
    expect(deckPluginWarnings([{ id: "mood", audienceWrites: ["votes"] }], [slide])).toHaveLength(1);
  });
});

describe("escapeInlineModuleScript", () => {
  test("escapes </script> inside the module bundle, keeps the real terminator", () => {
    const html = '<body><script type="module">const s="<div></script></body></html>";doStuff()</script></body></html>';
    const out = escapeInlineModuleScript(html);
    // only the </script token is neutralised (</body>, </html> untouched);
    // `<\/script>` is an identical JS string value but no longer a tag terminator
    expect(out).toContain('const s="<div><\\/script></body></html>";');
    // exactly one literal </script> remains in the document, the real terminator
    expect(out.match(/<\/script>/g)?.length).toBe(1);
    expect(out.endsWith("</script></body></html>")).toBe(true);
  });

  test("no-op when there is no inline module script", () => {
    const html = '<body><script src="x.js"></script></body>';
    expect(escapeInlineModuleScript(html)).toBe(html);
  });
});

describe("stampGenerator", () => {
  const html = '<!doctype html><html><head><title>t</title></head><body></body></html>';

  test("adds the comment after the doctype and the meta inside head", () => {
    const out = stampGenerator(html, { engine: "1.2.3", generator: { name: "cli", version: "4.5.6" } });
    expect(out).toContain("<!doctype html>\n<!-- Generated by liebstoeckel engine 1.2.3, cli 4.5.6 · https://liebstoeckel.app -->");
    expect(out).toContain('<meta name="generator" content="liebstoeckel engine 1.2.3, cli 4.5.6" />');
    // the meta lands inside <head>, before the title
    expect(out.indexOf("generator")).toBeLessThan(out.indexOf("<title>"));
  });

  test("stamps the engine version alone when no generator is given", () => {
    const out = stampGenerator(html, { engine: "1.2.3" });
    expect(out).toContain('<meta name="generator" content="liebstoeckel engine 1.2.3" />');
    expect(out).not.toContain("cli");
  });

  test("is deterministic, no timestamp, same input → same output", () => {
    const parts = { engine: "1.2.3", generator: { name: "cli", version: "4.5.6" } };
    expect(stampGenerator(html, parts)).toBe(stampGenerator(html, parts));
  });
});

describe("bundledEngineVersion", () => {
  test("names the engine the bundle loaded, not the build pipeline's", () => {
    const versions = new Map([
      ["@liebstoeckel/engine", ["0.3.10"]],
      ["@liebstoeckel/plugin-sdk", ["0.3.4"]],
    ]);
    expect(bundledEngineVersion(versions)).toBe("0.3.10");
  });

  test("null without an engine in the bundle, or with two (a refused build)", () => {
    expect(bundledEngineVersion(new Map())).toBeNull();
    expect(bundledEngineVersion(new Map([["@liebstoeckel/engine", ["0.3.10", "0.4.0"]]]))).toBeNull();
  });
});

describe("stripDevMode", () => {
  const tag = '<script data-liebstoeckel-dev>/* loader */(function(){})()</script>';

  test("removes marked tags wherever they sit, leaves everything else byte-identical", () => {
    const html = `<!doctype html>\n<html><head>\n    ${tag}\n<title>t</title></head>` +
      `<body>${tag}<script type="module">app()</script></body></html>`;
    const stripped = stripDevMode(html);
    expect(stripped).not.toContain("data-liebstoeckel-dev");
    expect(stripped).toContain("<title>t</title>");
    expect(stripped).toContain('<script type="module">app()</script>');
  });

  test("no marked tag means no change at all", () => {
    const html = '<html><head><script>keep()</script></head><body></body></html>';
    expect(stripDevMode(html)).toBe(html);
  });

  test("attribute variants (quoted value, extra attributes) are still stripped", () => {
    const html = '<p>a</p><script async data-liebstoeckel-dev="1" id="x">z()</script><p>b</p>';
    expect(stripDevMode(html)).toBe("<p>a</p><p>b</p>");
  });
});

describe("stripDevMode before escapeInlineModuleScript", () => {
  test("a dev tag after the module script does not break the module's own closer", () => {
    const html = '<body><script type="module">app("x")</script>\n<script data-liebstoeckel-dev>probe()</script>\n</body>';
    // The bundle pipeline's order: strip first, then escape.
    const out = escapeInlineModuleScript(stripDevMode(html));
    expect(out).toBe('<body><script type="module">app("x")</script>\n</body>');
  });
});

describe("bundleDeck", () => {
  // A built deck is a production artifact whatever the builder's environment says:
  // React must come in as its production build, with no dev-only JSX runtime,
  // warnings or DevTools banner. The fixture lives inside the source tree (not the
  // system tmpdir) so `react` resolves from the workspace node_modules.
  test(
    "ships React's production build and no dev-only checks even when NODE_ENV=development",
    async () => {
      const here = fileURLToPath(new URL(".", import.meta.url));
      const dir = mkdtempSync(join(here, ".vt-prodbuild-"));
      const prev = process.env.NODE_ENV;
      try {
        writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "prod-build-fixture", private: true }));
        writeFileSync(
          join(dir, "index.html"),
          `<!doctype html><html><head></head><body><div id="root"></div><script type="module" src="./entry.tsx"></script></body></html>`,
        );
        writeFileSync(
          join(dir, "entry.tsx"),
          `import { createRoot } from "react-dom/client";\n` +
            `import { warnIfBrandsMissing } from "../../brandCheck.ts";\n` +
            `import { devWarn } from "../../devLog.ts";\n` +
            `warnIfBrandsMissing(["nocturn"]);\n` +
            `devWarn("[liebstoeckel] still logged in a build");\n` +
            `const Slide = ({ items }: { items: string[] }) => <ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>;\n` +
            `createRoot(document.getElementById("root")!).render(<Slide items={["a", "b"]} />);\n`,
        );
        process.env.NODE_ENV = "development";
        const outdir = join(dir, "dist");
        await bundleDeck({
          entry: join(dir, "index.html"),
          pkgJson: join(dir, "package.json"),
          outdir,
          inlinePackage: false,
          inlineLicenses: false,
        });
        const html = await Bun.file(join(outdir, "index.html")).text();
        // React is in the bundle as its production build (the minified error helper).
        // Not the name `createRoot`: Bun 1.4 drops react-dom's unused export table and
        // renames the one function the entry calls.
        expect(html).toContain("react.dev/errors/");
        expect(html).not.toContain("jsxDEV");
        expect(html).not.toContain("Download the React DevTools");
        expect(html).not.toContain("react.development");
        // The brand-name check is authoring feedback: its body and message stay out.
        expect(html).not.toContain("is not defined, so the deck renders");
        expect(html).not.toContain("Did you mean");
        // The record the dev-mode bridge reads is development-only too; the console line stays.
        expect(html).toContain("still logged in a build");
        expect(html).not.toContain("__LIEBSTOECKEL_DEV_LOG__");
        expect(html).not.toContain("liebstoeckel:dev-log");
      } finally {
        if (prev === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = prev;
        rmSync(dir, { recursive: true, force: true });
      }
    },
    180_000,
  );
});
