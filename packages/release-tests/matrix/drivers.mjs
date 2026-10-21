// Sets up the browser drivers (../scripts/*.ts) in a folder of their own with the
// Playwright they need, so Node runs them on a runner that has no checkout install.
// Node 22.18 and later run the .ts files by stripping their types.
//   node drivers.mjs <dir>
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = process.argv[2] && resolve(process.argv[2]);
if (!dir) {
  console.error("usage: drivers.mjs <dir>");
  process.exit(2);
}
const pkg = join(import.meta.dirname, "..");
const playwright = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")).dependencies["playwright-core"];
mkdirSync(dir, { recursive: true });
for (const f of readdirSync(join(pkg, "scripts"))) if (f.endsWith(".ts")) copyFileSync(join(pkg, "scripts", f), join(dir, f));
writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "release-drivers", private: true, type: "module" }, null, 2) + "\n");
execFileSync("npm", ["install", "--no-audit", "--no-fund", `playwright-core@${playwright}`], { cwd: dir, stdio: "inherit", shell: process.platform === "win32" });
console.log(`drivers in ${dir} with playwright-core ${playwright}`);
