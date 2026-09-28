// Unknown-option check for the umbrella CLI. citty accepts any flag without a
// word, so a mistyped or unsupported option (`decks --json` before `decks` had
// one) was silently dropped and could change the output format behind an
// agent's back. This walks the same subcommand route citty takes and reports
// every option the command it lands on does not declare.
import type { ArgsDef, CommandDef } from "citty";

type Resolvable<T> = T | (() => T) | (() => Promise<T>) | Promise<T>;
type AnyCommand = CommandDef<ArgsDef>;

const resolve = async <T>(v: Resolvable<T> | undefined): Promise<T | undefined> =>
  typeof v === "function" ? await (v as () => T | Promise<T>)() : await v;

const camel = (s: string) => s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

interface ArgSpec {
  type?: string;
  alias?: string | string[];
}

/** One level of the resolved route: the command and the argv tokens it parses. */
export interface RouteLevel {
  path: string[];
  cmd: AnyCommand;
  args: Record<string, ArgSpec>;
  tokens: string[];
}

function isValueFlag(token: string, args: Record<string, ArgSpec>): boolean {
  const name = token.replace(/^-{1,2}/, "");
  for (const [key, def] of Object.entries(args)) {
    if (def.type !== "string" && def.type !== "enum") continue;
    if (camel(name) === camel(key)) return true;
    const aliases = Array.isArray(def.alias) ? def.alias : def.alias ? [def.alias] : [];
    if (aliases.includes(name)) return true;
  }
  return false;
}

/** citty's own rule for where the subcommand name sits: the first token that is
 *  not a flag and not the value of a string flag. */
function subCommandIndex(argv: string[], args: Record<string, ArgSpec>): number {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") return -1;
    if (a.startsWith("-")) {
      if (!a.includes("=") && isValueFlag(a, args)) i++;
      continue;
    }
    return i;
  }
  return -1;
}

/** Resolve the route citty will take through `root` for `argv`. Stops at an
 *  unknown subcommand name (citty reports that one itself). */
export async function resolveRoute(root: AnyCommand, argv: string[]): Promise<RouteLevel[]> {
  const levels: RouteLevel[] = [];
  let cmd = root;
  let tokens = argv;
  const path: string[] = [];
  for (;;) {
    const args = ((await resolve(cmd.args as Resolvable<ArgsDef>)) ?? {}) as Record<string, ArgSpec>;
    const subs = (await resolve(cmd.subCommands as Resolvable<Record<string, Resolvable<AnyCommand>>>)) ?? {};
    if (Object.keys(subs).length === 0) {
      levels.push({ path: [...path], cmd, args, tokens });
      return levels;
    }
    const idx = subCommandIndex(tokens, args);
    if (idx >= 0) {
      const name = tokens[idx]!;
      levels.push({ path: [...path], cmd, args, tokens: tokens.slice(0, idx) });
      const next = await resolve(subs[name]);
      if (!next) return levels;
      path.push(name);
      cmd = next;
      tokens = tokens.slice(idx + 1);
      continue;
    }
    const def = await resolve(cmd.default as Resolvable<string> | undefined);
    const next = def ? await resolve(subs[def]) : undefined;
    if (!def || !next) {
      levels.push({ path: [...path], cmd, args, tokens });
      return levels;
    }
    // citty runs the default subcommand with the same argv; the parent (which
    // has no options of its own in this CLI) parses nothing of interest.
    path.push(def);
    cmd = next;
  }
}

/** Every spelling an option list accepts: kebab and camel names, aliases,
 *  `no-<name>` for booleans. */
export function acceptedNames(args: Record<string, ArgSpec>, root: boolean): Set<string> {
  const names = new Set<string>(["help", "h"]);
  if (root) {
    names.add("version");
    names.add("v");
  }
  for (const [key, def] of Object.entries(args)) {
    if (def.type === "positional") continue;
    const forms = [key, camel(key), kebab(key)];
    for (const f of forms) {
      names.add(f);
      if (def.type === "boolean") names.add(`no-${kebab(f)}`);
    }
    const aliases = Array.isArray(def.alias) ? def.alias : def.alias ? [def.alias] : [];
    for (const a of aliases) names.add(a);
  }
  return names;
}

/** The unknown options among one level's tokens (as typed, e.g. `--jsn`). */
export function unknownIn(tokens: string[], args: Record<string, ArgSpec>, root: boolean): string[] {
  const names = acceptedNames(args, root);
  const unknown: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === "--") break;
    if (!t.startsWith("-") || t === "-" || /^-\d/.test(t)) continue;
    const raw = t.startsWith("--") ? t.slice(2) : t.slice(1);
    const name = raw.split("=")[0]!;
    if (t.startsWith("--") || name.length === 1) {
      if (!names.has(name)) unknown.push(`${t.startsWith("--") ? "--" : "-"}${name}`);
      else if (!t.includes("=") && isValueFlag(t, args)) i++;
      continue;
    }
    // A short cluster (`-ab`): every letter must be a known short option.
    for (const ch of name) if (!names.has(ch)) unknown.push(`-${ch}`);
  }
  return unknown;
}

/** Edit distance (optimal string alignment). */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      // A swapped pair of letters (`--josn`) counts as one edit.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

/** The closest declared long option to a typo, or undefined when none is close. */
export function suggestOption(typed: string, args: Record<string, ArgSpec>): string | undefined {
  const want = typed.replace(/^-+/, "").split("=")[0]!;
  const candidates = [...acceptedNames(args, false)].filter((n) => n.length > 1 && n !== "help" && n === kebab(n));
  let best: string | undefined;
  let bestD = Infinity;
  for (const c of candidates) {
    const dd = distance(want, c);
    if (dd < bestD) {
      bestD = dd;
      best = c;
    }
  }
  return best && bestD <= Math.max(1, Math.floor(want.length / 3)) ? `--${best}` : undefined;
}

export interface UnknownOption {
  /** The option as typed. */
  option: string;
  /** `liebstoeckel <path>` it was given to. */
  command: string;
  /** A close declared option, if any. */
  suggestion?: string;
}

/** Route `argv` through `root` and list every option the route does not declare. */
export async function findUnknownOptions(
  root: AnyCommand,
  argv: string[],
  bin = "liebstoeckel",
): Promise<{ unknown: UnknownOption[]; leaf: RouteLevel }> {
  const levels = await resolveRoute(root, argv);
  const unknown: UnknownOption[] = [];
  for (const [i, level] of levels.entries()) {
    const command = [bin, ...level.path].join(" ");
    if ((level.cmd as { acceptsAnyOption?: boolean }).acceptsAnyOption) continue;
    for (const option of unknownIn(level.tokens, level.args, i === 0)) {
      unknown.push({ option, command, suggestion: suggestOption(option, level.args) });
    }
  }
  return { unknown, leaf: levels.at(-1)! };
}
