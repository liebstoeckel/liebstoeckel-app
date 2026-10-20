// The code step: `import { codeStory } from "@liebstoeckel/engine/code" with {
// type: "macro" }`. Bun evaluated macros at bundle time; esbuild has none, so this
// load step stands in for exactly these two exports (`codeStory` and `code`) and
// only with literal arguments, which it parses and never evaluates as code. Any
// other macro import is an error in every profile.
import { code, codeStory } from "@liebstoeckel/engine/code";

export const MACRO_MODULE = "@liebstoeckel/engine/code";

type MacroFn = (...args: never[]) => Promise<unknown>;
const ALLOWED: Record<string, MacroFn> = { codeStory: codeStory as MacroFn, code: code as MacroFn };

const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*(["'])([^"']+)\2\s*with\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*)?type\s*:\s*(["'])macro\4\s*\}\s*;?/g;
const ANY_MACRO = /with\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*)?type\s*:\s*["']macro["']\s*\}/;
const PREFIX_MACRO = /\bfrom\s*["']macro:|\bimport\s*\(\s*["']macro:|\bimport\s*["']macro:/;

/** Tokenized results by call; a pure function of the literal arguments. Bounded,
 *  because one process can serve several decks for a long time. */
const results = new Map<string, Promise<unknown>>();
const MAX_RESULTS = 500;

export function hasMacroImport(source: string): boolean {
  return ANY_MACRO.test(source) || PREFIX_MACRO.test(source);
}

/** A macro import the code step cannot stand in for, as a sentence about the file;
 *  `line` (1-based) and `column` (0-based) point at the argument it could not read. */
export class MacroError extends Error {
  constructor(
    message: string,
    readonly line?: number,
    readonly column?: number,
  ) {
    super(message);
  }
}

/** Whether the name found at `at` is prose rather than a call: inside a comment,
 *  or (in a JSX file) in the text between tags, where a slide may well mention
 *  `codeStory (...)` by name. A call follows an operator, a bracket or a keyword;
 *  text follows another word or a tag's closing `>`. */
function notACall(src: string, at: number, jsx: boolean): boolean {
  const lineStart = src.lastIndexOf("\n", at - 1) + 1;
  const before = src.slice(lineStart, at);
  if (/^\s*(?:\/\/|\*|\/\*)/.test(before) || /(?:^|[\s;{}(),])\/\/[^"'`]*$/.test(before)) return true;
  const open = src.lastIndexOf("/*", at);
  if (open !== -1 && src.indexOf("*/", open) > at) return true;
  if (!jsx) return false;
  const m = /(\S+)\s*$/.exec(src.slice(Math.max(0, at - 200), at));
  if (!m) return false;
  const prev = m[1]!;
  if (/[A-Za-z0-9_$]$/.test(prev)) return !/(?:^|[^\w$])(?:return|await|yield|typeof|void|case|in|of|new|default|throw|delete)$/.test(prev);
  return prev.endsWith(">") && !prev.endsWith("=>");
}

/** What is wrong with a file's macro imports, statically, without running anything:
 *  an empty list when every macro import is the code step's. The hosted gateway
 *  runs this on every snapshot, the build on every file it loads. */
export function macroProblems(source: string): string[] {
  const problems: string[] = [];
  if (PREFIX_MACRO.test(source)) problems.push(`imports through the "macro:" prefix; macros do not run here, only codeStory and code from ${MACRO_MODULE}`);
  const rest = source.replace(IMPORT_RE, (_m, names: string, _q, from: string) => {
    if (from !== MACRO_MODULE) {
      problems.push(`imports ${from} as a macro; macros do not run here, only codeStory and code from ${MACRO_MODULE}`);
      return "";
    }
    for (const raw of names.split(",")) {
      const part = raw.trim();
      if (!part || part.startsWith("type ")) continue;
      const imported = part.split(/\s+as\s+/)[0]!.trim();
      if (!ALLOWED[imported]) problems.push(`imports ${imported} from ${MACRO_MODULE} as a macro; only codeStory and code are supported`);
    }
    return "";
  });
  if (ANY_MACRO.test(rest)) problems.push("has a macro import the build cannot read (write it as import { codeStory } from \"@liebstoeckel/engine/code\" with { type: \"macro\" })");
  return problems;
}

/** The source without its code-step imports (`codeStory`/`code` from the engine
 *  with the macro attribute), for a static reader that refuses every macro. */
export function withoutCodeStep(source: string): string {
  return source.replace(IMPORT_RE, (m, _names: string, _q, from: string) => (from === MACRO_MODULE ? "" : m));
}

/** Replace every code-step call with its JSON result and drop the import. */
export async function expandMacros(source: string, file: string): Promise<string> {
  const problems = macroProblems(source);
  if (problems.length) throw new MacroError(`${file} ${problems[0]}`);
  const local = new Map<string, [string, MacroFn]>();
  const jsx = /\.(?:tsx|jsx|mdx)$/.test(file);
  // The import goes, its line breaks stay, so a line number in an error still
  // points at the line in the file.
  let out = source.replace(IMPORT_RE, (m, names: string) => {
    for (const raw of names.split(",")) {
      const part = raw.trim();
      if (!part || part.startsWith("type ")) continue;
      const [imported, alias] = part.split(/\s+as\s+/).map((s) => s.trim());
      local.set(alias ?? imported!, [imported!, ALLOWED[imported!]!]);
    }
    return m.replace(/[^\n]/g, "");
  });
  for (const [name, [imported, fn]] of local) {
    const callRe = new RegExp(`(?<![\\w$.])${name}\\s*\\(`, "g");
    let m: RegExpExecArray | null;
    let result = "";
    let last = 0;
    while ((m = callRe.exec(out))) {
      if (notACall(out, m.index, jsx)) continue;
      const argsStart = m.index + m[0].length;
      const { values, end } = parseArgs(out, argsStart, file);
      // The result is a pure function of the literal arguments: cache it, so an
      // edit elsewhere in the file does not tokenize every code state again.
      const key = `${imported}:${JSON.stringify(values)}`;
      let value = results.get(key);
      if (!value) {
        value = fn(...(values as never[]));
        if (results.size >= MAX_RESULTS) results.delete(results.keys().next().value!);
        results.set(key, value);
        value.catch(() => results.delete(key));
      }
      result += out.slice(last, m.index) + JSON.stringify(await value);
      last = end;
      callRe.lastIndex = end;
    }
    out = result + out.slice(last);
  }
  return out;
}

/** Parse a comma-separated list of literal arguments up to the closing ")". */
function parseArgs(src: string, start: number, file: string): { values: unknown[]; end: number } {
  const p = new LiteralParser(src, start, file);
  const values: unknown[] = [];
  p.ws();
  if (p.peek() === ")") return { values, end: p.pos + 1 };
  for (;;) {
    values.push(p.value());
    p.ws();
    const c = p.next();
    if (c === ")") return { values, end: p.pos };
    if (c !== ",") p.fail(`expected "," or ")"`);
    p.ws();
    if (p.peek() === ")") return { values, end: p.pos + 1 };
  }
}

class LiteralParser {
  constructor(
    private src: string,
    public pos: number,
    private file: string,
  ) {}

  fail(msg: string): never {
    const before = this.src.slice(0, this.pos);
    const line = before.split("\n").length;
    const column = this.pos - (before.lastIndexOf("\n") + 1);
    throw new MacroError(
      `${this.file}: codeStory and code take literal arguments only, strings, arrays and objects written out in place, no variables or ${"${}"} substitutions (${msg})`,
      line,
      column,
    );
  }
  peek(): string {
    return this.src[this.pos] ?? "";
  }
  next(): string {
    return this.src[this.pos++] ?? "";
  }
  ws(): void {
    for (;;) {
      const c = this.peek();
      if (c === " " || c === "\n" || c === "\t" || c === "\r") this.pos++;
      else if (this.src.startsWith("//", this.pos)) this.pos = this.src.indexOf("\n", this.pos) + 1 || this.src.length;
      else if (this.src.startsWith("/*", this.pos)) this.pos = this.src.indexOf("*/", this.pos) + 2;
      else return;
    }
  }
  value(): unknown {
    this.ws();
    const c = this.peek();
    if (c === "[") return this.array();
    if (c === "{") return this.object();
    if (c === '"' || c === "'") return this.string(c);
    if (c === "`") return this.template();
    if (/[-0-9.]/.test(c)) return this.number();
    for (const [word, v] of [["true", true], ["false", false], ["null", null], ["undefined", undefined]] as const) {
      if (this.src.startsWith(word, this.pos)) {
        this.pos += word.length;
        return v;
      }
    }
    return this.fail("unexpected token");
  }
  array(): unknown[] {
    this.next();
    const out: unknown[] = [];
    for (;;) {
      this.ws();
      if (this.peek() === "]") {
        this.next();
        return out;
      }
      out.push(this.value());
      this.ws();
      const c = this.next();
      if (c === "]") return out;
      if (c !== ",") this.fail(`expected "," or "]"`);
    }
  }
  object(): Record<string, unknown> {
    this.next();
    const out: Record<string, unknown> = {};
    for (;;) {
      this.ws();
      if (this.peek() === "}") {
        this.next();
        return out;
      }
      const c = this.peek();
      let key: string;
      if (c === '"' || c === "'") key = this.string(c);
      else {
        const m = /^[A-Za-z_$][\w$]*/.exec(this.src.slice(this.pos));
        if (!m) this.fail("expected a key");
        key = m[0];
        this.pos += key.length;
      }
      this.ws();
      if (this.next() !== ":") this.fail(`expected ":"`);
      out[key] = this.value();
      this.ws();
      const n = this.next();
      if (n === "}") return out;
      if (n !== ",") this.fail(`expected "," or "}"`);
    }
  }
  string(q: string): string {
    this.next();
    let out = "";
    for (;;) {
      const c = this.next();
      if (c === "") this.fail("unterminated string");
      if (c === q) return out;
      if (c === "\\") out += this.escape();
      else out += c;
    }
  }
  template(): string {
    this.next();
    let out = "";
    for (;;) {
      const c = this.next();
      if (c === "") this.fail("unterminated template");
      if (c === "`") return out;
      if (c === "$" && this.peek() === "{") this.fail("template substitutions are not literals");
      if (c === "\\") out += this.escape();
      else if (c === "\r") continue;
      else out += c;
    }
  }
  escape(): string {
    const c = this.next();
    const simple: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", "0": "\0" };
    if (c in simple) return simple[c]!;
    if (c === "u") {
      if (this.peek() === "{") {
        const end = this.src.indexOf("}", this.pos);
        const cp = parseInt(this.src.slice(this.pos + 1, end), 16);
        this.pos = end + 1;
        return String.fromCodePoint(cp);
      }
      const hex = this.src.slice(this.pos, this.pos + 4);
      this.pos += 4;
      return String.fromCharCode(parseInt(hex, 16));
    }
    if (c === "x") {
      const hex = this.src.slice(this.pos, this.pos + 2);
      this.pos += 2;
      return String.fromCharCode(parseInt(hex, 16));
    }
    if (c === "\n") return "";
    return c;
  }
  number(): number {
    const m = /^-?(?:0x[0-9a-f]+|\d*\.?\d+(?:e[-+]?\d+)?)/i.exec(this.src.slice(this.pos));
    if (!m) this.fail("bad number");
    this.pos += m[0].length;
    return Number(m[0]);
  }
}
