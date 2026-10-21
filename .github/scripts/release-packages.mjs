// Packs, checks and publishes the framework packages for the public release
// workflows. Plain Node (no dependencies), so it also runs on a runner that has
// no Bun; only `pack` needs Bun.
//
//   node .github/scripts/release-packages.mjs pack <outdir>
//       bun pm pack every package under packages/ that is not private into
//       <outdir>, and write <outdir>/packages.json: name, version, file and npm
//       integrity of each tarball, in dependency order (a package after the
//       packages it depends on).
//   node .github/scripts/release-packages.mjs compare <packages.json>
//       compare the tarballs with the integrity list in $EXPECTED_INTEGRITY
//       (a JSON object "name@version" -> "sha512-..."): every expected entry
//       the npm registry does not have yet must exist and match, byte for
//       byte. Versions already on npm are not compared (nothing to publish; an
//       unchanged package may pack differently than when it was released).
//   node .github/scripts/release-packages.mjs publish <packages.json>
//       compare as above, then npm publish each matching tarball. Nothing is
//       published unless every compared entry matched.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The public packages: every directory under packages/ whose package.json is not
 * private. (A test in the internal repo checks this is the set release-please
 * versions.)
 */
export function packageDirs(root) {
  return readdirSync(join(root, "packages"))
    .filter((d) => existsSync(join(root, "packages", d, "package.json")))
    .filter((d) => JSON.parse(readFileSync(join(root, "packages", d, "package.json"), "utf8")).private !== true)
    .sort()
    .map((d) => `packages/${d}`);
}

/** npm's integrity string for a tarball's bytes. */
export function integrityOf(bytes) {
  return "sha512-" + createHash("sha512").update(bytes).digest("base64");
}

/** The file name `bun pm pack` (and `npm pack`) gives a scoped package. */
export function tarballName(name, version) {
  return `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
}

/**
 * Orders packages so each one comes after the set's packages it depends on. Ties
 * keep the input order. Peer dependencies don't count: a peer may point back (the
 * dev server names the CLI as its peer), and nothing installs it from the package.
 */
export function dependencyOrder(pkgs) {
  const names = new Set(pkgs.map((p) => p.name));
  const deps = new Map(
    pkgs.map((p) => [
      p.name,
      Object.keys({ ...p.dependencies, ...p.optionalDependencies }).filter(
        (d) => names.has(d) && d !== p.name,
      ),
    ]),
  );
  const out = [];
  const state = new Map();
  const visit = (name, path) => {
    if (state.get(name) === "done") return;
    if (state.get(name) === "visiting") throw new Error(`dependency cycle: ${[...path, name].join(" -> ")}`);
    state.set(name, "visiting");
    for (const d of deps.get(name)) visit(d, [...path, name]);
    state.set(name, "done");
    out.push(name);
  };
  for (const p of pkgs) visit(p.name, []);
  const byName = new Map(pkgs.map((p) => [p.name, p]));
  return out.map((n) => byName.get(n));
}

/**
 * Checks packed tarballs against the integrity list of the internal release.
 * Returns the entries to publish and the problems; any problem means nothing
 * may be published.
 */
export function compareIntegrity(packed, expected, published = new Set()) {
  const problems = [];
  const byKey = new Map(packed.map((p) => [`${p.name}@${p.version}`, p]));
  const keys = Object.keys(expected).filter((k) => !published.has(k));
  if (Object.keys(expected).length === 0) problems.push("the expected integrity list is empty");
  for (const key of keys) {
    const p = byKey.get(key);
    if (!p) problems.push(`${key}: not among the packed packages (${packed.map((x) => `${x.name}@${x.version}`).join(", ")})`);
    else if (p.integrity !== expected[key]) problems.push(`${key}: integrity differs (packed ${p.integrity}, released ${expected[key]})`);
  }
  const matched = packed.filter((p) => !published.has(`${p.name}@${p.version}`) && expected[`${p.name}@${p.version}`] === p.integrity);
  return { matched, problems };
}

function pack(outdir) {
  const root = process.cwd();
  mkdirSync(outdir, { recursive: true });
  const abs = resolve(outdir);
  const pkgs = packageDirs(root).map((dir) => ({ dir, ...JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8")) }));
  const packed = [];
  for (const p of dependencyOrder(pkgs)) {
    execFileSync("bun", ["pm", "pack", "--destination", abs, "--quiet"], { cwd: join(root, p.dir), stdio: ["ignore", "ignore", "inherit"] });
    const file = tarballName(p.name, p.version);
    packed.push({ name: p.name, version: p.version, file, integrity: integrityOf(readFileSync(join(abs, file))) });
  }
  writeFileSync(join(abs, "packages.json"), JSON.stringify(packed, null, 2) + "\n");
  for (const p of packed) console.log(`${p.name}@${p.version}  ${p.integrity}`);
}

function readCompare(listFile) {
  const packed = JSON.parse(readFileSync(listFile, "utf8"));
  const raw = process.env.EXPECTED_INTEGRITY;
  if (!raw) throw new Error("EXPECTED_INTEGRITY is not set");
  const expected = JSON.parse(raw);
  const published = new Set(
    Object.keys(expected).filter((key) => {
      const at = key.lastIndexOf("@");
      return onRegistry(key.slice(0, at), key.slice(at + 1));
    }),
  );
  for (const key of published) console.log(`already on npm, not compared: ${key}`);
  const result = compareIntegrity(packed, expected, published);
  if (result.matched.length === 0 && result.problems.length === 0) console.log("nothing new to publish");
  for (const p of result.matched) console.log(`same bytes as the internal release: ${p.name}@${p.version}`);
  if (result.problems.length) {
    for (const m of result.problems) console.error(`mismatch: ${m}`);
    process.exit(1);
  }
  return result.matched;
}

function onRegistry(name, version) {
  try {
    execFileSync("npm", ["view", `${name}@${version}`, "version"], { stdio: ["ignore", "pipe", "ignore"], shell: process.platform === "win32" });
    return true;
  } catch {
    return false;
  }
}

function publish(listFile) {
  const dir = resolve(listFile, "..");
  for (const p of readCompare(listFile)) {
    const args = ["publish", join(dir, p.file), "--access", "public"];
    if (p.version.includes("-")) args.push("--tag", "next");
    console.log(`npm ${args.join(" ")}`);
    execFileSync("npm", args, { stdio: "inherit" });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "pack" && arg) pack(arg);
  else if (cmd === "compare" && arg) readCompare(arg);
  else if (cmd === "publish" && arg) publish(arg);
  else {
    console.error("usage: release-packages.mjs pack <outdir> | compare <packages.json> | publish <packages.json>");
    process.exit(2);
  }
}
