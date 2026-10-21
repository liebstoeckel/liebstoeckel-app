// Checks what a build or an export wrote:
//   node check-build.mjs <deck.html> --thumbnails <n>   the deck embeds n slide thumbnails
//   node check-build.mjs --png <dir> <n>                 n PNG files, each a real PNG
//   node check-build.mjs --pdf <file> <n>                a PDF of n pages
// Options combine; exit 1 names every check that failed.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const problems = [];
const take = (flag) => {
  const i = args.indexOf(flag);
  if (i < 0) return null;
  const v = args.splice(i, 3);
  return v.slice(1);
};

const thumbs = take("--thumbnails");
const png = take("--png");
const pdf = take("--pdf");
const [html] = args;

if (thumbs) {
  const want = Number(thumbs[0]);
  const text = readFileSync(html, "utf8");
  const m = /<script[^>]*data-liebstoeckel-thumbnails[^>]*>([\s\S]*?)<\/script>/.exec(text);
  const got = m ? Object.keys(JSON.parse(m[1]).thumbs ?? {}).length : 0;
  if (got !== want) problems.push(`${html}: ${got} thumbnails, wanted ${want}`);
  else console.log(`${want} thumbnails in ${html}`);
}
if (png) {
  const [dir, n] = png;
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".png")) : [];
  const bad = files.filter((f) => readFileSync(join(dir, f)).subarray(0, 8).toString("hex") !== "89504e470d0a1a0a");
  if (files.length !== Number(n)) problems.push(`${dir}: ${files.length} PNG files, wanted ${n}`);
  else if (bad.length) problems.push(`${dir}: not PNG: ${bad.join(", ")}`);
  else console.log(`${n} PNG files in ${dir}`);
}
if (pdf) {
  const [file, n] = pdf;
  const text = existsSync(file) ? readFileSync(file).toString("latin1") : "";
  const counts = [...text.matchAll(/\/Type\s*\/Pages[^>]*\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  const pages = counts.length ? Math.max(...counts) : 0;
  if (!text.startsWith("%PDF-")) problems.push(`${file}: not a PDF`);
  else if (pages !== Number(n)) problems.push(`${file}: ${pages} pages, wanted ${n}`);
  else console.log(`${n} pages in ${file}`);
}
for (const p of problems) console.error(p);
process.exit(problems.length ? 1 : 0);
