// Prints the sha256 of a file (the release matrix compares built decks by it).
//   node sha256.mjs <file>
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: sha256.mjs <file>");
  process.exit(2);
}
console.log(createHash("sha256").update(readFileSync(file)).digest("hex"));
