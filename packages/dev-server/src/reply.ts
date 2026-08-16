// Validation for the agent's POST /__dev/poll reply. The reply is the agent's
// claim about what it changed; the server flips annotation statuses from it, so
// the shape is checked strictly and rejected loudly (the agent retries with a
// corrected reply; a silently-accepted junk reply would desync the drawer).

export interface ApplyReplyData {
  /** Annotation entry ids the agent fully applied. */
  applied: string[];
  /** Deck-relative source files the agent edited. */
  files: string[];
  /** Short human-readable notes surfaced in the drawer. */
  notes: string[];
}

export type ReplyValidation =
  | { ok: true; kind: "done"; data: ApplyReplyData }
  | { ok: true; kind: "error"; message: string }
  | { ok: false; error: string; hint: string };

const HINT =
  'reply with --reply <batchId> done --data \'{"applied":["<entryId>"],"files":["slides/01-title.mdx"],"notes":[]}\' or --reply <batchId> error "reason"';

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function validateReply(
  msg: { type?: unknown; data?: unknown; message?: unknown },
  batchEntryIds: string[],
): ReplyValidation {
  if (msg.type === "error") {
    if (typeof msg.message !== "string" || !msg.message.trim()) {
      return { ok: false, error: "error_reply_requires_message", hint: HINT };
    }
    return { ok: true, kind: "error", message: msg.message.trim() };
  }
  if (msg.type !== "done") {
    return { ok: false, error: "invalid_reply_type", hint: HINT };
  }
  const data = msg.data as Partial<ApplyReplyData> | undefined;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "missing_result_data", hint: HINT };
  }
  for (const key of ["applied", "files", "notes"] as const) {
    if (!stringArray(data[key])) {
      return { ok: false, error: `${key}_must_be_string_array`, hint: HINT };
    }
  }
  const known = new Set(batchEntryIds);
  for (const id of data.applied as string[]) {
    if (!known.has(id)) {
      return { ok: false, error: "applied_id_not_in_batch", hint: `unknown entry id ${JSON.stringify(id)}; ${HINT}` };
    }
  }
  return {
    ok: true,
    kind: "done",
    data: { applied: data.applied as string[], files: data.files as string[], notes: data.notes as string[] },
  };
}
