// Build-time tokenized code, shaped to be macro-serializable (plain JSON).
// `fontStyle` is Shiki's FontStyle bitfield: 1=italic, 2=bold, 4=underline.

export interface CodeToken {
  content: string;
  color?: string;
  fontStyle?: number;
}

/** One code state: lines of colored tokens, produced by Shiki at build time. */
export interface TokenizedStep {
  lang: string;
  lines: CodeToken[][];
}

export interface KeyedLine {
  /** stable across steps for the "same" line, so it FLIP-animates between states */
  key: string;
  tokens: CodeToken[];
}

export interface KeyedStep {
  lines: KeyedLine[];
}
