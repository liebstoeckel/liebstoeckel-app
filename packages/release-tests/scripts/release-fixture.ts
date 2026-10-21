// Copy the release fixture deck (../release-fixture) to a directory of its own and
// point every @liebstoeckel/* dependency at one release, so it installs from a
// registry the way a user's deck does:
//
//   bun packages/release-tests/scripts/release-fixture.ts <target-dir> <version-or-dist-tag>
//
// e.g. `... /tmp/fixture 0.4.0-rc.1` or `... /tmp/fixture rc`. A dist-tag is written
// as-is (`"rc"`), so the install resolves it; a version is written exactly.
// The target must not exist yet. Then: `liebstoeckel install --dir <target>` and
// `liebstoeckel build --dir <target>`; README.md lists the golden hashes.
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [target, release] = process.argv.slice(2);
if (!target || !release) {
  console.error("usage: bun packages/release-tests/scripts/release-fixture.ts <target-dir> <version-or-dist-tag>");
  process.exit(2);
}
const dest = resolve(target);
if (existsSync(dest)) {
  console.error(`${dest} exists already; pick a new directory`);
  process.exit(1);
}
const src = join(import.meta.dirname, "..", "release-fixture");
const skip = new Set(["README.md", "node_modules", "dist", "bun.lock"]);
cpSync(src, dest, { recursive: true, filter: (p) => !skip.has(p.slice(src.length + 1).split(/[\\/]/)[0] ?? "") });

const pjPath = join(dest, "package.json");
const pj = JSON.parse(readFileSync(pjPath, "utf8"));
for (const field of ["dependencies", "devDependencies"]) {
  for (const [name, range] of Object.entries(pj[field] ?? {})) {
    if (range === "RELEASE") pj[field][name] = release;
  }
}
writeFileSync(pjPath, JSON.stringify(pj, null, 2) + "\n");
console.log(`release fixture at ${dest}, @liebstoeckel/* at ${release}`);
