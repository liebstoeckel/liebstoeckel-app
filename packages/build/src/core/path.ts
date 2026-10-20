// POSIX path helpers for the virtual file tree. The core never touches node:path,
// so the same code runs under Bun and in a browser worker. Every path is absolute
// and starts with "/" (the root of the tree, the repository root on disk).

export function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return "/" + out.join("/");
}

export function join(...parts: string[]): string {
  return normalize(parts.join("/"));
}

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function extname(path: string): string {
  const base = basename(path);
  const i = base.lastIndexOf(".");
  return i <= 0 ? "" : base.slice(i);
}

/** `to` relative to the directory `from`, always starting with "./" or "../". */
export function relative(from: string, to: string): string {
  const a = normalize(from).split("/").filter(Boolean);
  const b = normalize(to).split("/").filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const up = a.length - i;
  const rest = b.slice(i).join("/");
  if (up === 0) return "./" + rest;
  return "../".repeat(up) + rest;
}
