import { describe, expect, test } from "bun:test";
import { validateReply } from "./reply";

const BATCH = ["e1", "e2"];

describe("validateReply", () => {
  test("accepts the canonical done shape", () => {
    const result = validateReply(
      { type: "done", data: { applied: ["e1"], files: ["slides/01-title.mdx"], notes: ["made it bolder"] } },
      BATCH,
    );
    expect(result).toEqual({
      ok: true,
      kind: "done",
      data: { applied: ["e1"], files: ["slides/01-title.mdx"], notes: ["made it bolder"] },
    });
  });

  test("accepts an error reply with a message", () => {
    expect(validateReply({ type: "error", message: "slide not found" }, BATCH)).toEqual({
      ok: true,
      kind: "error",
      message: "slide not found",
    });
  });

  test("rejects error without message", () => {
    const result = validateReply({ type: "error" }, BATCH);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("error_reply_requires_message");
  });

  test("rejects unknown type, missing data, non-array fields", () => {
    expect(validateReply({ type: "complete" }, BATCH).ok).toBe(false);
    expect(validateReply({ type: "done" }, BATCH).ok).toBe(false);
    const bad = validateReply({ type: "done", data: { applied: "e1", files: [], notes: [] } }, BATCH);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe("applied_must_be_string_array");
  });

  test("rejects applied ids outside the dispatched batch", () => {
    const result = validateReply({ type: "done", data: { applied: ["ghost"], files: [], notes: [] } }, BATCH);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("applied_id_not_in_batch");
  });
});
