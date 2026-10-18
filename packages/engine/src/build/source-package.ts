import { $ } from "bun";
import { mkdtempSync, mkdirSync, rmSync, readdirSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { SOURCE_ATTR } from "./source-attr";

// Inline source package ((internal ADR)): the single-file deck carries a compressed copy of
// its own source so a compiled `.html` can be ejected back to an editable project.
// Collection reuses `bun pm pack` (npm's real ignore algorithm + `files` allowlist),
// then repacks gzip→zstd for the in-HTML embed. Everything here is Bun-native (no deps),
// so the engine never grows a dependency for this.

/** Inert <script> carrier, mirrors plugin-sdk's `embedManifest` (browser never parses it).
 *  Defined in `source-attr.ts` so browser runtime can read it without this packer. */
export { SOURCE_ATTR };

// Fail-closed gate: pack's default-ignore table misses bare `.env`/`.env.local` (only
// `.env.production`), so we add our own net + a best-effort secret-content scan.
const ENV_FILE = /(^|\/)\.env($|\.)/i;
const SECRET_SIGNATURE =
  /-----BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36}|sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}/;

// Eject is the untrusted-input path (an arbitrary HTML someone sent you). Bound the
// decompression bomb surface the traversal check can't cover.
const MAX_COMPRESSED = 8 * 1024 * 1024; // 8 MB of embedded base64-decoded zstd
const MAX_DECOMPRESSED = 64 * 1024 * 1024; // 64 MB of tar
const MAX_ENTRIES = 4000;

const PACKAGE_PREFIX = "package/";

export interface CollectOptions {
  /** Force past the secret gate (loud, explicit). */
  allowSecret?: boolean;
}

export interface DeckTarball {
  /** pack's native gzip `.tgz` bytes, npm/`bun add`-compatible (without the eject extras). */
  gzip: Uint8Array<ArrayBuffer>;
  /** repacked zstd of pack's (already-normalized) tar, the in-HTML embed payload. */
  zstd: Uint8Array<ArrayBuffer>;
  /** deck-relative paths in the embedded source (the `package/` prefix stripped). */
  files: string[];
}

/** Parse ustar entry names from a raw tar (Bun.Archive.files() is unusable; this also
 *  lets the gate run off the exact bytes we embed, with no second pack invocation). */
function tarEntryNames(tar: Uint8Array): string[] {
  const names: string[] = [];
  const dec = new TextDecoder();
  for (let off = 0; off + 512 <= tar.length; ) {
    const header = tar.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break; // end-of-archive zero blocks
    const name = dec.decode(header.subarray(0, 100)).replace(/\0.*$/s, "");
    if (!name) break;
    const sizeOct = dec.decode(header.subarray(124, 136)).replace(/\0.*$/s, "").trim();
    const size = parseInt(sizeOct, 8) || 0;
    names.push(name);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return names;
}

/** Files `bun pm pack` never ships that an ejected deck still needs: the lockfile (so
 *  the ejected project installs the versions the deck was built with) and `.gitignore`.
 *  They go into the embedded source only, after pack's own entries; the `.tgz` stays
 *  exactly what pack wrote. */
export const EJECT_EXTRAS = ["bun.lock", ".gitignore"] as const;

/** A registry or tarball URL with a user and password in it (`https://user:pass@host`). */
const URL_CREDENTIALS = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/"'@:]+:[^\s/"'@]+@/i;

/** Registry hosts a bun.lock names other than npm's own, for the build's notice that the
 *  embedded lockfile (which every audience copy carries) names them. */
export function lockfileRegistries(lock: string): string[] {
  const hosts = new Set<string>();
  for (const m of lock.matchAll(/\bhttps?:\/\/([^/\s"']+)/g)) {
    const host = m[1]!.replace(/^[^@]*@/, "").toLowerCase();
    if (host !== "registry.npmjs.org") hosts.add(host);
  }
  return [...hosts].sort();
}

/** The end of a tar's last entry: where the zero blocks that close the archive start. */
function tarEnd(tar: Uint8Array): number {
  const dec = new TextDecoder();
  let off = 0;
  while (off + 512 <= tar.length) {
    const header = tar.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const size = parseInt(dec.decode(header.subarray(124, 136)).replace(/\0.*$/s, "").trim(), 8) || 0;
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return off;
}

/** One ustar entry (header + padded body) shaped like pack's own: mode 0664, uid/gid 0,
 *  and pack's fixed mtime, so the archive stays reproducible. */
function ustarEntry(name: string, body: Uint8Array, mtimeOctal: string): Uint8Array {
  const enc = new TextEncoder();
  const header = new Uint8Array(512);
  const put = (at: number, text: string) => header.set(enc.encode(text), at);
  put(0, name);
  put(100, "000664 \0");
  put(108, "000000 \0");
  put(116, "000000 \0");
  put(124, body.length.toString(8).padStart(11, "0") + " ");
  put(136, mtimeOctal);
  put(148, "        "); // checksum field counts as spaces while summing
  put(156, "0");
  put(257, "ustar\0" + "00");
  let sum = 0;
  for (const b of header) sum += b;
  put(148, sum.toString(8).padStart(6, "0") + "\0 ");
  const out = new Uint8Array(512 + Math.ceil(body.length / 512) * 512);
  out.set(header, 0);
  out.set(body, 512);
  return out;
}

/** Append `entries` to a tar, keeping everything before them byte for byte, and close it
 *  with the two zero blocks again. The mtime is copied from the first existing entry. */
export function appendToTar(tar: Uint8Array, entries: Array<{ name: string; body: Uint8Array }>): Uint8Array<ArrayBuffer> {
  const end = tarEnd(tar);
  const mtime = end >= 512 ? new TextDecoder().decode(tar.subarray(136, 148)) : "00000000000 ";
  const parts = entries.map((e) => ustarEntry(e.name, e.body, mtime));
  const out = new Uint8Array(end + parts.reduce((n, p) => n + p.length, 0) + 1024);
  out.set(tar.subarray(0, end), 0);
  let at = end;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8000);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return true;
  return false;
}

/** Run `bun pm pack` on a deck dir, gate the result, and repack gzip→zstd.
 *  `--ignore-scripts` is a security control (pack runs prepack/prepare by default →
 *  arbitrary code); the interpreter is pinned to the running Bun via `process.execPath`,
 *  and `dir` reaches pack via `.cwd()` (never interpolated into the command). */
export async function collectDeckTarball(dir: string, opts: CollectOptions = {}): Promise<DeckTarball> {
  const work = mkdtempSync(join(tmpdir(), "lst-pack-"));
  const tgzPath = join(work, "deck.tgz");
  try {
    const res = await $`${process.execPath} pm pack --ignore-scripts --quiet --filename ${tgzPath}`
      .cwd(dir)
      .quiet()
      .nothrow();
    if (res.exitCode !== 0 || !existsSync(tgzPath)) {
      throw new Error(`\`bun pm pack\` failed in ${dir}:\n${res.stderr.toString() || res.stdout.toString()}`);
    }

    const gzip = new Uint8Array(await Bun.file(tgzPath).bytes());
    const packed = Bun.gunzipSync(gzip);
    const packedFiles = tarEntryNames(packed)
      .filter((n) => n.startsWith(PACKAGE_PREFIX))
      .map((n) => n.slice(PACKAGE_PREFIX.length))
      .filter(Boolean);
    const extras = EJECT_EXTRAS.filter((rel) => !packedFiles.includes(rel) && existsSync(join(dir, rel)));
    const files = [...packedFiles, ...extras];

    // pack default-ignores bunfig.toml; if the deck has one but it wasn't packed (not in
    // `files`), the ejected deck loses its dev-server plugins, warn, don't fail.
    if (existsSync(join(dir, "bunfig.toml")) && !files.includes("bunfig.toml")) {
      console.warn('⚠ bunfig.toml is not in the deck\'s "files", the ejected deck won\'t run in dev mode');
    }
    // A deck's own plugins live in plugins/ by convention; decks scaffolded before it was
    // listed there leave it out, and their ejected copy would not build.
    if (existsSync(join(dir, "plugins")) && !files.some((f) => f.startsWith("plugins/"))) {
      console.warn('⚠ plugins/ is not in the deck\'s "files", the ejected deck won\'t have its own plugins: add "plugins" to "files" in package.json');
    }

    // ── fail-closed gate ──────────────────────────────────────────────
    const violations: string[] = [];
    for (const rel of files) {
      if (ENV_FILE.test(rel)) {
        violations.push(`${rel} (env file)`);
        continue;
      }
      const abs = join(dir, rel);
      if (!existsSync(abs)) continue;
      const bytes = readFileSync(abs);
      if (!looksBinary(bytes) && SECRET_SIGNATURE.test(bytes.toString("utf8"))) {
        violations.push(`${rel} (secret signature)`);
      } else if (rel === "bun.lock" && URL_CREDENTIALS.test(bytes.toString("utf8"))) {
        violations.push(`${rel} (a URL with a password in it)`);
      }
    }
    if (violations.length && !opts.allowSecret) {
      throw new Error(
        `Refusing to embed source, likely secrets:\n  ${violations.join("\n  ")}\n` +
          `Add a "files" allowlist (or .npmignore) to the deck's package.json, or pass --allow-secret.`,
      );
    }

    if (extras.includes("bun.lock")) {
      const registries = lockfileRegistries(readFileSync(join(dir, "bun.lock"), "utf8"));
      if (registries.length) {
        console.warn(`⚠ the embedded bun.lock names ${registries.join(", ")}: anyone with the built .html can read it`);
      }
    }

    // Preserve pack's reproducible tar (fixed mtimes); only swap the compressor, after
    // appending the extras with the same fixed mtime. Re-taring via Bun.Archive.write
    // would stamp wall-clock mtimes and break determinism.
    const tar = extras.length
      ? appendToTar(packed, extras.map((rel) => ({ name: PACKAGE_PREFIX + rel, body: new Uint8Array(readFileSync(join(dir, rel))) })))
      : packed;
    const zstd = new Uint8Array(Bun.zstdCompressSync(tar));
    return { gzip, zstd, files };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Embed the zstd source payload as an inert <script> before the last </body>
 *  (same insertion rule as `embedManifest`: a deck's inlined JS can contain a literal
 *  "</body>", and the real document terminator is the last one). */
export function embedSource(html: string, zstd: Uint8Array): string {
  const b64 = Buffer.from(zstd).toString("base64");
  const tag = `<script type="application/octet-stream" ${SOURCE_ATTR} data-codec="zstd">${b64}</script>`;
  const at = html.lastIndexOf("</body>");
  return at >= 0 ? html.slice(0, at) + tag + html.slice(at) : html + tag;
}

/** Read the embedded zstd payload back, or null if the HTML carries no source package. */
export function extractSource(html: string): Uint8Array | null {
  const re = new RegExp(`<script[^>]*${SOURCE_ATTR}[^>]*>([\\s\\S]*?)</script>`, "i");
  const m = html.match(re);
  if (!m) return null;
  try {
    return Buffer.from(m[1]!.trim(), "base64");
  } catch {
    return null;
  }
}

export interface EjectOptions {
  /** allow extracting into a non-empty directory (default: refuse). */
  force?: boolean;
}

/** Eject the embedded source to `outDir` (the `package/` prefix stripped), or throw a
 *  clear error if the HTML has none. Untrusted-input hardened: size/entry caps against
 *  decompression bombs + per-entry name validation on top of Bun.Archive's own clamping. */
export async function ejectSource(html: string, outDir: string, opts: EjectOptions = {}): Promise<string[]> {
  const zstd = extractSource(html);
  if (!zstd) {
    throw new Error(
      "no embedded source package in this HTML, it was built with --no-inline-package " +
        "(or by an older build). Rebuild without that flag to make the deck ejectable.",
    );
  }
  if (zstd.length > MAX_COMPRESSED) throw new Error("embedded source package is implausibly large, refusing to eject");

  const tar = Bun.zstdDecompressSync(zstd);
  if (tar.length > MAX_DECOMPRESSED) throw new Error("decompressed source exceeds the size cap, refusing to eject");

  const names = tarEntryNames(tar);
  if (names.length > MAX_ENTRIES) throw new Error("source package has too many entries, refusing to eject");
  for (const n of names) {
    if (n.startsWith("/") || n.split("/").some((seg) => seg === "..")) {
      throw new Error(`unsafe path in source package: ${n}`);
    }
  }

  if (existsSync(outDir) && readdirSync(outDir).length > 0 && !opts.force) {
    throw new Error(`${outDir} is not empty, pass force to overwrite`);
  }

  // Extract to a temp dir (Bun.Archive clamps traversal), then lift package/* into outDir.
  const stage = mkdtempSync(join(tmpdir(), "lst-eject-"));
  try {
    const Archive = (Bun as unknown as { Archive: new (b: Uint8Array) => { extract(d: string): Promise<number> } }).Archive;
    await new Archive(tar).extract(stage);
    const root = join(stage, "package");
    const src = existsSync(root) ? root : stage;
    const written: string[] = [];
    const lift = (from: string, rel: string) => {
      for (const ent of readdirSync(from, { withFileTypes: true })) {
        const childRel = rel ? `${rel}/${ent.name}` : ent.name;
        const dest = join(outDir, childRel);
        if (ent.isDirectory()) {
          lift(join(from, ent.name), childRel);
        } else {
          mkdirSync(dirname(dest), { recursive: true });
          // copy (not rename): the stage temp may be on a different filesystem than outDir (EXDEV).
          copyFileSync(join(from, ent.name), dest);
          written.push(childRel);
        }
      }
    };
    lift(src, "");
    return written.sort();
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
