import type { CodeToken, KeyedStep, TokenizedStep } from "./types";

const lineText = (tokens: CodeToken[]): string => tokens.map((t) => t.content).join("");

/** For each line in `cur`, the index of the line it matches in `prev` (or null).
 *  Standard LCS over line text, biased to keep the longest common run aligned so
 *  unchanged lines around an edit keep their identity. */
export function matchLines(prev: string[], cur: string[]): (number | null)[] {
  const m = prev.length;
  const n = cur.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] = prev[i] === cur[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const match = new Array<number | null>(n).fill(null);
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (prev[i] === cur[j]) {
      match[j] = i;
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return match;
}

/** Assign every line in every step a key that is stable for the "same" line across
 *  consecutive steps (matched by LCS, chained). Lines that persist keep their key
 *  → Motion morphs their position; new keys enter, dropped keys exit. */
export function keySteps(steps: TokenizedStep[]): KeyedStep[] {
  const out: KeyedStep[] = [];
  let counter = 0;
  let prevKeys: string[] = [];
  let prevText: string[] = [];

  for (let s = 0; s < steps.length; s++) {
    const lines = steps[s]!.lines;
    const texts = lines.map(lineText);
    let keys: string[];
    if (s === 0) {
      keys = texts.map(() => `l${counter++}`);
    } else {
      const match = matchLines(prevText, texts);
      keys = texts.map((_, idx) => {
        const p = match[idx];
        return p != null ? prevKeys[p]! : `l${counter++}`;
      });
    }
    out.push({ lines: lines.map((tokens, idx) => ({ key: keys[idx]!, tokens })) });
    prevKeys = keys;
    prevText = texts;
  }
  return out;
}
