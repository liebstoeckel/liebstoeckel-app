// Copies a deck to another folder the way a user moves one: its sources and its
// bun.lock, without node_modules and dist (the copy installs and builds again).
//   node copy-deck.mjs <from> <to>
import { cpSync, existsSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const [from, to] = process.argv.slice(2).map((p) => (p ? resolve(p) : p));
if (!from || !to) {
  console.error("usage: copy-deck.mjs <from> <to>");
  process.exit(2);
}
if (existsSync(to)) {
  console.error(`${to} exists already`);
  process.exit(1);
}
const skip = new Set(["node_modules", "dist"]);
cpSync(from, to, { recursive: true, filter: (p) => !skip.has(relative(from, p).split(sep)[0] ?? "") });
console.log(`copied ${from} to ${to}`);
