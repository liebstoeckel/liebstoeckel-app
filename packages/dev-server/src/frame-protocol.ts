// The wire between the dev-mode shell (parent document) and the deck frame,
// carried over window.postMessage. Pure: encoders, a validating decoder, and
// the handshake state machine, shared by ui/frame-host.ts (parent) and
// drawer/drawer.ts (frame). Locally the two are same-origin, so the frame
// greets its own origin and only lets that origin initialise it; a hosted
// variant (sandboxed frame with an opaque origin, addressed by window from the
// parent) passes its own allowlist of parent origins instead. Keep free of
// bun / node / CLI imports: this runs in browsers.

import type { CommentDraft, StrokeDraft } from "../drawer/bridge";

export type OverlayMode = "off" | "draw" | "comment";

export interface DraftPayload {
  strokes: StrokeDraft[];
  comments: CommentDraft[];
  /** Fractions of the fitted stage rect, never of the window. */
  space: "stage";
  /** Slide the first mark was made on; null (or absent, for older frames)
   *  while unknown. The deck can still be navigated while annotating, so
   *  save-time slide state in the parent is not what the marks refer to. */
  slideIndex?: number | null;
}

/** Frame -> parent. */
export type FrameMessage =
  | { type: "lst:hello" }
  | { type: "lst:slide"; index: number }
  | { type: "lst:draft"; draft: DraftPayload }
  | { type: "lst:mode"; mode: OverlayMode }
  | { type: "lst:captured"; id: string; draft: DraftPayload; screenshot: Blob | null };

/** Parent -> frame. */
export type HostMessage =
  | { type: "lst:init" }
  | { type: "lst:setMode"; mode: OverlayMode }
  | { type: "lst:clearDraft" }
  | { type: "lst:goto"; index: number }
  | { type: "lst:capture"; id: string }
  /** The captured draft was persisted; only now does the frame discard it, so
   *  a failed save (network, 409, capture timeout) keeps the user's marks. */
  | { type: "lst:draftSaved"; id: string };

const MODES = new Set<OverlayMode>(["off", "draw", "comment"]);

function isPoint(p: unknown): p is [number, number] {
  return Array.isArray(p) && p.length === 2 && typeof p[0] === "number" && typeof p[1] === "number";
}

const HINT_MAX = 512;

/** The optional element hint under a comment: a small, bounded shape. Anything
 *  bigger or differently shaped is refused so junk from a (hosted, opaque)
 *  frame cannot flow through to the server and the agent. */
function isTargetHint(t: unknown): boolean {
  if (t === undefined) return true;
  if (!t || typeof t !== "object" || Array.isArray(t)) return false;
  const { tag, classes, text, ...rest } = t as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return false;
  if (tag !== undefined && (typeof tag !== "string" || tag.length > HINT_MAX)) return false;
  if (text !== undefined && (typeof text !== "string" || text.length > HINT_MAX)) return false;
  if (classes !== undefined && (!Array.isArray(classes) || classes.length > 32 || !classes.every((c) => typeof c === "string" && c.length <= HINT_MAX))) return false;
  return true;
}

export function isDraftPayload(d: unknown): d is DraftPayload {
  if (!d || typeof d !== "object") return false;
  const { strokes, comments, space, slideIndex } = d as Partial<DraftPayload>;
  return (
    space === "stage" &&
    (slideIndex === undefined || slideIndex === null || (typeof slideIndex === "number" && Number.isInteger(slideIndex) && slideIndex >= 0)) &&
    Array.isArray(strokes) &&
    strokes.every((s) => s && Array.isArray((s as StrokeDraft).points) && (s as StrokeDraft).points.every(isPoint)) &&
    Array.isArray(comments) &&
    comments.every(
      (c) =>
        c &&
        typeof (c as CommentDraft).x === "number" &&
        typeof (c as CommentDraft).y === "number" &&
        typeof (c as CommentDraft).text === "string" &&
        isTargetHint((c as CommentDraft).target),
    )
  );
}

/** Validate something that arrived from the frame; null for anything else. */
export function decodeFrameMessage(data: unknown): FrameMessage | null {
  if (!data || typeof data !== "object") return null;
  const m = data as Record<string, unknown>;
  switch (m.type) {
    case "lst:hello":
      return { type: "lst:hello" };
    case "lst:slide":
      return typeof m.index === "number" ? { type: "lst:slide", index: m.index } : null;
    case "lst:draft":
      return isDraftPayload(m.draft) ? { type: "lst:draft", draft: m.draft } : null;
    case "lst:mode":
      return MODES.has(m.mode as OverlayMode) ? { type: "lst:mode", mode: m.mode as OverlayMode } : null;
    case "lst:captured":
      return typeof m.id === "string" && isDraftPayload(m.draft) && (m.screenshot === null || m.screenshot instanceof Blob)
        ? { type: "lst:captured", id: m.id, draft: m.draft, screenshot: m.screenshot }
        : null;
    default:
      return null;
  }
}

/** Validate something that arrived from the parent; null for anything else. */
export function decodeHostMessage(data: unknown): HostMessage | null {
  if (!data || typeof data !== "object") return null;
  const m = data as Record<string, unknown>;
  switch (m.type) {
    case "lst:init":
      return { type: "lst:init" };
    case "lst:setMode":
      return MODES.has(m.mode as OverlayMode) ? { type: "lst:setMode", mode: m.mode as OverlayMode } : null;
    case "lst:clearDraft":
      return { type: "lst:clearDraft" };
    case "lst:goto":
      return typeof m.index === "number" && Number.isInteger(m.index) && m.index >= 0 ? { type: "lst:goto", index: m.index } : null;
    case "lst:capture":
      return typeof m.id === "string" ? { type: "lst:capture", id: m.id } : null;
    case "lst:draftSaved":
      return typeof m.id === "string" ? { type: "lst:draftSaved", id: m.id } : null;
    default:
      return null;
  }
}

/** The handshake, from the frame's point of view: it greets on load, the parent
 *  answers with init, only then does the frame act on anything. Init is taken
 *  only from an allowed origin; after that, messages from any origin other than
 *  the one that sent init are dropped. */
export interface Handshake {
  state: "waiting" | "ready";
  origin: string | null;
}

export function initialHandshake(): Handshake {
  return { state: "waiting", origin: null };
}

export function acceptInit(h: Handshake, origin: string, data: unknown, allowedOrigins: readonly string[]): Handshake {
  if (h.state === "ready") return h;
  if (!allowedOrigins.includes(origin)) return h;
  const m = decodeHostMessage(data);
  return m?.type === "lst:init" ? { state: "ready", origin } : h;
}

export function trusts(h: Handshake, origin: string): boolean {
  return h.state === "ready" && h.origin === origin;
}
