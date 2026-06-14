/**
 * Generates `architecture.drawio` from the OSS package dependency graph.
 *
 * The layers are real nodes (not full-width bands), so the picture is an actual
 * `uses` graph: every arrow points from a consumer to something it depends on,
 * matching the intra-repo `@liebstoeckel/*` deps in the package manifests. The
 * five edges are the transitive reduction of that graph (Engine is the hub;
 * Theme+Components and Plugins are foundations with no outgoing deps).
 *
 * elkjs does the placement + orthogonal edge routing (layered, top→bottom), so
 * non-adjacent links never cut through a box. Edit the `nodes`/`edges` spec
 * below and re-run; the layout recomputes:
 *
 *   bun packages/docs/diagrams/architecture.gen.ts
 *
 * then export to SVG (the committed asset the docs site serves):
 *
 *   xvfb-run -a drawio --no-sandbox --export --format svg \
 *     --output packages/docs/public/diagrams/architecture.svg \
 *     packages/docs/diagrams/architecture.drawio
 */
import ELK from "elkjs/lib/elk.bundled.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// elkjs's bundled "fake worker" require breaks under Bun, so hand it Bun's
// native Worker pointed at elk's worker script.
const workerUrl = createRequire(import.meta.url).resolve("elkjs/lib/elk-worker.min.js");

type Node = {
  id: string;
  title: string;
  role: string;
  fill: string;
  stroke: string;
};

// Layer nodes. `role` is one short line under the bold title — the longer
// package lists live in the prose beside the diagram, not in the box.
const nodes: Node[] = [
  { id: "decks", title: "Decks", role: "presentations/*", fill: "#dbeafe", stroke: "#1e3a5f" },
  { id: "cli", title: "CLI", role: "new · build · live · relay · thumbs", fill: "#f1f5f9", stroke: "#475569" },
  { id: "delivery", title: "Delivery", role: "live-server · relay · thumbnails", fill: "#fee2e2", stroke: "#991b1b" },
  { id: "engine", title: "Engine", role: "renders decks", fill: "#fef3c7", stroke: "#92660a" },
  { id: "theme", title: "Theme + Components", role: "tokens · components", fill: "#e0e7ff", stroke: "#3730a3" },
  { id: "plugins", title: "Plugins", role: "sdk · ui · poll · qa · reactions", fill: "#dcfce7", stroke: "#166534" },
];

// Transitive reduction of the layer-level `uses` graph: source uses target.
const edges: [string, string][] = [
  ["decks", "engine"],
  ["engine", "theme"],
  ["engine", "plugins"],
  ["delivery", "engine"],
  ["cli", "delivery"],
];

// Node size: wide enough for the longest of the two lines, clamped.
const sizeOf = (n: Node) => {
  const w = Math.min(290, Math.max(150, Math.round(Math.max(n.title.length * 8.2, n.role.length * 6.4) + 34)));
  return { width: w, height: 54 };
};

const elk = new ELK({ workerUrl, workerFactory: (url: string) => new Worker(url) });
const layout = await elk.layout({
  id: "root",
  layoutOptions: {
    "elk.algorithm": "layered",
    "elk.direction": "DOWN",
    "elk.edgeRouting": "ORTHOGONAL",
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    "elk.layered.spacing.nodeNodeBetweenLayers": "64",
    "elk.spacing.nodeNode": "56",
    "elk.spacing.edgeNode": "28",
  },
  children: nodes.map((n) => ({ id: n.id, ...sizeOf(n) })),
  edges: edges.map(([s, t], i) => ({ id: `e${i}`, sources: [s], targets: [t] })),
});

const byId = new Map(nodes.map((n) => [n.id, n]));
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const cells: string[] = [];
for (const c of layout.children ?? []) {
  const n = byId.get(c.id)!;
  const value = esc(`<b>${n.title}</b><br><font style="font-size:11px">${n.role}</font>`);
  const style = `rounded=1;whiteSpace=wrap;html=1;fillColor=${n.fill};strokeColor=${n.stroke};fontColor=#0f172a;fontSize=13;arcSize=14;verticalAlign=middle;`;
  cells.push(
    `    <mxCell id="${c.id}" value="${value}" style="${style}" vertex="1" parent="1">` +
      `<mxGeometry x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" as="geometry"/></mxCell>`,
  );
}
for (const e of layout.edges ?? []) {
  const sec = e.sections?.[0];
  const pts = (sec?.bendPoints ?? []).map((p) => `<mxPoint x="${p.x}" y="${p.y}"/>`).join("");
  const arr = pts ? `<Array as="points">${pts}</Array>` : "";
  const style = "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;strokeColor=#64748b;";
  cells.push(
    `    <mxCell id="${e.id}" style="${style}" edge="1" parent="1" source="${e.sources![0]}" target="${e.targets![0]}">` +
      `<mxGeometry relative="1" as="geometry">${arr}</mxGeometry></mxCell>`,
  );
}

const xml = `<mxGraphModel adaptiveColors="auto">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
${cells.join("\n")}
  </root>
</mxGraphModel>
`;

const out = fileURLToPath(new URL("./architecture.drawio", import.meta.url));
writeFileSync(out, xml);
console.log(`wrote ${out}`);

// The elk Worker keeps Bun's event loop alive; exit once the file is written.
process.exit(0);
