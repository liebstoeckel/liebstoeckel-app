// Secrets in deck sources: which files never sync (a path denylist) and which
// file contents look like credentials (a small rule set in the spirit of
// gitleaks). Pure and browser-safe, so the sync service, the CLI, the live
// mirror and the dashboard all apply one rule.
//
// Two strengths: `block` for credentials with an unmistakable shape (a private
// key block, a provider token with its fixed prefix), which are refused; `warn`
// for weaker signs (a long literal assigned to something called password or
// token), which are reported but synced. A finding names the file, the line and
// the kind, never the secret itself.

export type SecretStrength = "block" | "warn";

export interface SecretFinding {
  path: string;
  /** 1-based line of the match. */
  line: number;
  /** What it looks like, for people: "a GitHub token". */
  kind: string;
  strength: SecretStrength;
  /** Where the match is in the text (UTF-16 offsets), for removing it. */
  index: number;
  length: number;
}

interface Rule {
  kind: string;
  strength: SecretStrength;
  pattern: RegExp;
}

// Every pattern is global (for matchAll) and bounded, so a large file costs one
// linear pass per rule.
const RULES: Rule[] = [
  { kind: "a private key", strength: "block", pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g },
  { kind: "an AWS access key", strength: "block", pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g },
  { kind: "a GitHub token", strength: "block", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g },
  { kind: "a GitLab token", strength: "block", pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { kind: "a Slack token", strength: "block", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: "a Stripe secret key", strength: "block", pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g },
  { kind: "a Paddle API key", strength: "block", pattern: /\bpdl_(?:live|sdbx)_apikey_[A-Za-z0-9_]{20,}\b/g },
  { kind: "a Google API key", strength: "block", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: "an Anthropic API key", strength: "block", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { kind: "an OpenAI API key", strength: "block", pattern: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}\b|\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}\b/g },
  { kind: "an OpenRouter API key", strength: "block", pattern: /\bsk-or-v1-[a-f0-9]{64}\b/g },
  { kind: "an npm token", strength: "block", pattern: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { kind: "a SendGrid API key", strength: "block", pattern: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g },
  { kind: "a Doppler token", strength: "block", pattern: /\bdp\.(?:st|ct|sa|scim|audit)\.[A-Za-z0-9._-]{40,}\b/g },
  {
    kind: "a password or token assigned in code",
    strength: "warn",
    pattern:
      /\b(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|client[_-]?secret|auth[_-]?token)["']?\s*[:=]\s*["'`]([A-Za-z0-9+/_\-.=!@#$%^&*]{16,200})["'`]/gi,
  },
  { kind: "a JSON Web Token", strength: "warn", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { kind: "a URL with a password", strength: "warn", pattern: /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s/:@"'`]{1,64}:[^\s/@"'`]{3,128}@[^\s"'`]{3,}/gi },
];

/** Example values from providers' own documentation: never a real credential,
 *  and common in slides about the very services they belong to. */
const EXAMPLES = [
  "AKIAIOSFODNN7EXAMPLE",
  // Assembled, so secret scanners reading this file do not report the examples.
  ["wJalrXUtnFEMI", "K7MDENG", "bPxRfiCYEXAMPLEKEY"].join("/"),
  ["sk", "live", "4eC39HqLyjWDarjtT1zdp7dc"].join("_"),
];

function isExample(match: string): boolean {
  if (EXAMPLES.some((e) => match.includes(e))) return true;
  // Placeholders people write in docs: xxxx, 0000, <your-key>, ${VAR}.
  const tail = match.replace(/^[a-z_-]*[_-]/i, "");
  return /^(?:x+|X+|0+|\*+)$/.test(tail) || /\$\{|<[^>]*>|your[_-]?(?:api[_-]?)?key|example|placeholder|changeme|dummy/i.test(match);
}

/** A warn-level literal that is plainly not random (a word, a sentence). */
function lowEntropy(value: string): boolean {
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) {
    const p = n / value.length;
    bits -= p * Math.log2(p);
  }
  return bits < 3.2;
}

function lineAt(text: string, index: number, lineStarts: number[]): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid]! <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** Findings in one file's text, in order of appearance. */
export function scanText(path: string, text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  let lineStarts: number[] | null = null;
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (const m of text.matchAll(rule.pattern)) {
      const match = m[0];
      if (isExample(match)) continue;
      if (rule.strength === "warn" && m[1] !== undefined && lowEntropy(m[1])) continue;
      lineStarts ??= starts(text);
      findings.push({
        path,
        line: lineAt(text, m.index!, lineStarts),
        kind: rule.kind,
        strength: rule.strength,
        index: m.index!,
        length: match.length,
      });
    }
  }
  // One finding per place: a match of a block rule wins over a warn at the same spot.
  findings.sort((a, b) => a.index - b.index || (a.strength === "block" ? -1 : 1));
  const out: SecretFinding[] = [];
  for (const f of findings) {
    const last = out.at(-1);
    if (last && f.index < last.index + last.length) continue;
    out.push(f);
  }
  return out;
}

function starts(text: string): number[] {
  const out = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) out.push(i + 1);
  return out;
}

/** Findings across a whole source tree, sorted by path and line. */
export function scanTree(tree: Record<string, string>): SecretFinding[] {
  const out: SecretFinding[] = [];
  for (const path of Object.keys(tree).sort()) out.push(...scanText(path, tree[path]!));
  return out;
}

/** "slides/02.mdx:12 looks like a GitHub token" */
export function describeFinding(f: Pick<SecretFinding, "path" | "line" | "kind">): string {
  return `${f.path}:${f.line} looks like ${f.kind}`;
}

/** What a client may show or send about findings: no offsets into the text. */
export function publicFindings(findings: SecretFinding[]): Array<Pick<SecretFinding, "path" | "line" | "kind" | "strength">> {
  return findings.map(({ path, line, kind, strength }) => ({ path, line, kind, strength }));
}

// ---- paths that never sync ---------------------------------------------------------

/** File names that hold credentials by convention. Matched against the base
 *  name, case-insensitively. Most have no source extension and would not sync
 *  anyway; the list says so explicitly and covers the ones that do (a
 *  `secrets.json`, a `credentials.ts`, an `.env.local.json`). */
const DENIED: RegExp[] = [
  /^\.env(\..*)?$/,
  /^\.env[._-]/,
  /\.(pem|key|p12|pfx|jks|keystore|ppk|asc|gpg)$/,
  /secret/,
  /credential/,
  /^id_(rsa|dsa|ecdsa|ed25519)(\..*)?$/,
  /^\.(npmrc|netrc|pgpass|htpasswd)$/,
  /^service[-_]?account.*\.json$/,
];

/** Whether a deck-relative path is on the denylist of credential files. */
export function isDeniedPath(rel: string): boolean {
  const base = rel.slice(rel.lastIndexOf("/") + 1).toLowerCase();
  return DENIED.some((re) => re.test(base));
}
