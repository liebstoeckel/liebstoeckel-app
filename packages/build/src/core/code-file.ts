// Code files: a Markdown file whose name ends in `.code.md`, imported by a slide,
// holds the states of an animated code block, one fenced block per state:
//
//   ```ts
//   function greet(name) {}
//   ```
//
//   ```ts
//   function greet(name: string) {}
//   ```
//
// `import greet from "./greet.code.md"` gives the tokenized states
// (`TokenizedStep[]`, what `<CodeMagic steps>` takes). They are highlighted here at
// build time, like fenced code in MDX, so no highlighter reaches the browser and
// no macro is needed. Text outside the fences is ignored, so the file can explain
// itself.
import { code } from "@liebstoeckel/engine/code";

export const CODE_FILE = /\.code\.md$/;

export interface CodeBlock {
  code: string;
  lang: string;
  /** 1-based line of the opening fence, for error messages */
  line: number;
}

/** The fenced blocks of a code file, in order. A fence is three or more backticks
 *  or tildes; the info string's first word is the language (none: plain text). */
export function codeBlocks(source: string): CodeBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: CodeBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^( {0,3})(`{3,}|~{3,})\s*([^`\s]*)?.*$/.exec(lines[i]!);
    if (!open) continue;
    const [, indent, fence, info] = open;
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const close = new RegExp(`^ {0,3}${fence![0] === "`" ? "`" : "~"}{${fence!.length},}\\s*$`);
      if (close.test(lines[j]!)) break;
      // Remove the opening fence's indentation from the content, as CommonMark does.
      body.push(indent && lines[j]!.startsWith(indent) ? lines[j]!.slice(indent.length) : lines[j]!);
    }
    blocks.push({ code: body.join("\n"), lang: info || "text", line: i + 1 });
    i = j;
  }
  return blocks;
}

/** The module a code file compiles to: its tokenized states as the default export. */
export async function compileCodeFile(source: string, file: string): Promise<string> {
  const blocks = codeBlocks(source);
  if (blocks.length === 0) throw new Error(`${file} has no fenced code blocks; write each code state as one, e.g. \`\`\`ts ... \`\`\``);
  const steps = await Promise.all(blocks.map((b) => code(b.code, b.lang)));
  return `export default ${JSON.stringify(steps)};\n`;
}
