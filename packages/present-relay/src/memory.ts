import { readFileSync } from "node:fs";

/** Share of the container's memory limit at which the relay stops taking audience writes. */
export const MEMORY_CEILING_SHARE = 0.85;

/** The container's memory limit (cgroup v2 `memory.max`, then v1), or undefined when the
 *  process has none or runs outside a container. */
export function containerMemoryLimit(read: (path: string) => string = (p) => readFileSync(p, "utf8")): number | undefined {
  for (const path of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    try {
      const n = Number(read(path).trim());
      // v1 reports "no limit" as a huge number near 2^63
      if (Number.isFinite(n) && n > 0 && n < 2 ** 60) return n;
    } catch {
      /* not there, try the next */
    }
  }
  return undefined;
}

/**
 * A check that says whether the process has room for more audience writes: false while
 * its resident memory is at or above `ceiling` bytes. Reading the memory figure costs a
 * syscall, so it is read at most once per `everyMs`. With no ceiling it always says yes.
 */
export function memoryRoom(
  ceiling: number | undefined,
  opts: { rss?: () => number; now?: () => number; everyMs?: number } = {},
): () => boolean {
  if (!ceiling || ceiling <= 0) return () => true;
  const rss = opts.rss ?? (() => process.memoryUsage.rss());
  const now = opts.now ?? Date.now;
  const everyMs = opts.everyMs ?? 1000;
  let checkedAt = -Infinity;
  let room = true;
  return () => {
    const t = now();
    if (t - checkedAt >= everyMs) {
      checkedAt = t;
      room = rss() < ceiling;
    }
    return room;
  };
}
