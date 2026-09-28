// The CLI's machine-output contract, shared by every command that has a JSON
// mode. In JSON mode stdout carries exactly one JSON document, success or
// failure; prose, progress and warnings go to stderr. A failure is always
//   { "ok": false, "error": "<sentence>", "code": "<stable id>", "hint"?: "<next step>" }
// Exit codes: 0 success, 1 failure, 2 usage error (unknown option, bad argument).

/** JSON when asked (`--json`), or when stdout is not a terminal (an agent or a
 *  pipe), unless `--no-json` asked for prose. */
export const wantsJson = (flag: boolean | undefined): boolean => flag ?? !process.stdout.isTTY;

/** A failure a command reports on purpose: a sentence, a stable code agents
 *  branch on, an optional next step, and the exit code (2 = usage). */
export class CliError extends Error {
  readonly code: string;
  readonly hint?: string;
  readonly exit: 1 | 2;
  constructor(message: string, opts: { code: string; hint?: string; exit?: 1 | 2 }) {
    super(message);
    this.name = "CliError";
    this.code = opts.code;
    this.hint = opts.hint;
    this.exit = opts.exit ?? 1;
  }
}

/** A usage mistake (missing or invalid argument): exit 2, code `usage`. */
export const usageError = (message: string, hint?: string): CliError => new CliError(message, { code: "usage", hint, exit: 2 });

export interface ErrorDoc {
  ok: false;
  error: string;
  code: string;
  hint?: string;
}

export function errorDoc(err: unknown): ErrorDoc {
  if (err instanceof CliError) return { ok: false, error: err.message, code: err.code, ...(err.hint ? { hint: err.hint } : {}) };
  return { ok: false, error: err instanceof Error ? err.message : String(err), code: "failed" };
}

/** Report a failure in the active mode and exit: the error document on stdout
 *  in JSON mode, `✕ message` (+ the hint) on stderr otherwise. */
export function fail(json: boolean, err: unknown): never {
  const doc = errorDoc(err);
  if (json) {
    console.log(JSON.stringify(doc));
  } else {
    console.error(`✕ ${doc.error}`);
    if (doc.hint) console.error(`  ${doc.hint}`);
    if (!(err instanceof CliError) && process.env.LIEBSTOECKEL_DEBUG && err instanceof Error && err.stack) console.error(err.stack);
  }
  process.exit(err instanceof CliError ? err.exit : 1);
}

/** Run a command body; any throw becomes a reported failure in the active mode. */
export async function reporting(json: boolean, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (err) {
    fail(json, err);
  }
}

/** Run `fn` with console.log sent to stderr, for library code that prints
 *  progress while a JSON command must keep stdout for its one document. */
export async function withLogToStderr<T>(json: boolean, fn: () => Promise<T>): Promise<T> {
  if (!json) return fn();
  const realLog = console.log;
  console.log = (...a: unknown[]) => console.error(...a);
  try {
    return await fn();
  } finally {
    console.log = realLog;
  }
}

/** A short, single-line excerpt of a server response body for an error message. */
export async function bodyExcerpt(res: Response, max = 300): Promise<string> {
  const text = (await res.text().catch(() => "")).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
