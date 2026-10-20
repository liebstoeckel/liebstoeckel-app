// The dev server's React Fast Refresh pass, on esbuild's output for one module.
// Babel's react-refresh plugin does this on the AST; esbuild has no AST hook, but
// its output for a single module is regular enough to read: top-level function
// declarations and `const X = ...` bindings at the start of a line, and one
// `export { ... }` clause at the end. Every top-level binding whose name starts
// with a capital letter and that is a function (or a call such as memo(...)) is
// registered with react-refresh's runtime under "<module> <name>", together with a
// signature: the hooks its body calls, in order. When a module runs again after an
// edit, its components join their old families, React swaps the implementation in
// place and keeps their state, unless the signature changed (a hook added, removed
// or reordered), in which case that component remounts.

export interface Registration {
  name: string;
  /** the ordered hook calls in the component's body, e.g. "useState,useEffect" */
  signature: string;
}

const DECL_FN = /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Z][\w$]*)\s*\(/gm;
const DECL_VAR = /^(?:export\s+)?(?:var|let|const)\s+([A-Z][\w$]*)\s*=\s*/gm;
const HOOK = /(?<![\w$])(use[A-Z][\w$]*)\s*\(/g;

/** Skip a string, template, comment or regex literal starting at `i`; the index
 *  after it, or -1 when `i` starts none of them. */
function skipLiteral(src: string, i: number, prev: string): number {
  const c = src[i];
  if (c === '"' || c === "'") {
    for (let j = i + 1; j < src.length; j++) {
      if (src[j] === "\\") j++;
      else if (src[j] === c) return j + 1;
      else if (src[j] === "\n") return j;
    }
    return src.length;
  }
  if (c === "`") {
    let depth = 0;
    for (let j = i + 1; j < src.length; j++) {
      const d = src[j];
      if (d === "\\") j++;
      else if (depth === 0 && d === "`") return j + 1;
      else if (d === "$" && src[j + 1] === "{") {
        // A substitution: skip balanced braces (they may hold literals of their own).
        const end = matchBrace(src, j + 1);
        if (end < 0) return src.length;
        j = end;
      }
    }
    return src.length;
  }
  if (c === "/" && src[i + 1] === "/") {
    const nl = src.indexOf("\n", i);
    return nl < 0 ? src.length : nl;
  }
  if (c === "/" && src[i + 1] === "*") {
    const end = src.indexOf("*/", i + 2);
    return end < 0 ? src.length : end + 2;
  }
  if (c === "/" && (prev === "" || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || /\b(return|typeof|case|in|of|new|delete|void|throw)$/.test(src.slice(Math.max(0, i - 8), i).trimEnd()))) {
    let inClass = false;
    for (let j = i + 1; j < src.length; j++) {
      const d = src[j];
      if (d === "\\") j++;
      else if (d === "[") inClass = true;
      else if (d === "]") inClass = false;
      else if (d === "/" && !inClass) {
        let k = j + 1;
        while (/[a-z]/i.test(src[k] ?? "")) k++;
        return k;
      } else if (d === "\n") return j;
    }
    return src.length;
  }
  return -1;
}

/** The index of the `}` that closes the `{` at `open`, or -1. */
export function matchBrace(src: string, open: number): number {
  let depth = 0;
  let prev = "";
  for (let i = open; i < src.length; ) {
    const skipped = skipLiteral(src, i, prev);
    if (skipped >= 0) {
      i = skipped;
      prev = "a";
      continue;
    }
    const c = src[i]!;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return -1;
}

/** The body of the function whose header starts at `from`: the text between its
 *  first `{` (after the parameter list) and the matching `}`; for an arrow with an
 *  expression body, the expression up to the end of the statement. */
function bodyAfter(src: string, from: number): string {
  // Skip the parameter list (balanced parentheses, literals aware).
  let i = src.indexOf("(", from);
  if (i < 0) return "";
  let depth = 0;
  let prev = "";
  for (; i < src.length; ) {
    const skipped = skipLiteral(src, i, prev);
    if (skipped >= 0) {
      i = skipped;
      prev = "a";
      continue;
    }
    const c = src[i]!;
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  const rest = src.slice(i);
  const brace = /^\s*(?::[^={]*)?(=>)?\s*\{/.exec(rest);
  if (brace) {
    const open = i + brace[0].length - 1;
    const close = matchBrace(src, open);
    return close < 0 ? src.slice(open) : src.slice(open, close + 1);
  }
  return statementFrom(src, i);
}

/** The text from `i` to the end of its statement: the first `;` or line break
 *  outside any brackets (literals aware). */
function statementFrom(src: string, i: number): string {
  let depth = 0;
  let prev = "";
  for (let j = i; j < src.length; ) {
    const skipped = skipLiteral(src, j, prev);
    if (skipped >= 0) {
      j = skipped;
      prev = "a";
      continue;
    }
    const c = src[j]!;
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (depth <= 0 && (c === ";" || c === "\n")) return src.slice(i, j);
    if (!/\s/.test(c)) prev = c;
    j++;
  }
  return src.slice(i);
}

/** The components a module defines at its top level, with their hook signatures. */
export function findComponents(code: string): Registration[] {
  const out = new Map<string, Registration>();
  for (const m of code.matchAll(DECL_FN)) {
    const body = bodyAfter(code, m.index! + m[0].length - 1);
    out.set(m[1]!, { name: m[1]!, signature: hooksOf(body) });
  }
  for (const m of code.matchAll(DECL_VAR)) {
    const name = m[1]!;
    if (out.has(name)) continue;
    const rest = code.slice(m.index! + m[0].length);
    // A function value: an arrow, a function expression, or a call wrapping one
    // (memo, forwardRef, ...). Anything else (an object, a string) is not a component.
    const arrow = /^(?:async\s+)?(?:\([^)]*\)|[\w$]+)\s*=>/.test(rest) || /^(?:async\s+)?\(/.test(rest);
    const fnExpr = /^(?:async\s+)?function\b/.test(rest);
    const wrapped = /^(?:[\w$]+\.)?(?:memo|forwardRef|lazy)\s*\(/.test(rest);
    if (!arrow && !fnExpr && !wrapped) continue;
    // A wrapped component's hooks are in the call's arguments; an arrow's or a
    // function expression's in its body.
    const at = m.index! + m[0].length;
    const body = wrapped ? statementFrom(code, at) : bodyAfter(code, at);
    out.set(name, { name, signature: hooksOf(body) });
  }
  return [...out.values()];
}

function hooksOf(body: string): string {
  return [...body.matchAll(HOOK)].map((h) => h[1]!).join(",");
}

/** The registration code to append to a module (empty when it defines no component). */
export function refreshFooter(code: string, id: string, runtimeName: string): string {
  const components = findComponents(code);
  if (components.length === 0) return "";
  const lines = components.map(
    (c) => `${runtimeName}.register(${c.name}, ${JSON.stringify(`${id} ${c.name}`)}, ${JSON.stringify(c.signature)});`,
  );
  return `\n${lines.join("\n")}\n`;
}
