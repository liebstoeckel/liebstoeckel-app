import type { AnnotationEntry, CommentDraft, DevTransport, StrokeDraft } from "../drawer/bridge";

// Contracts between the sidebar (parent document) and the deck frame. The
// sidebar never touches the deck's DOM: it drives the in-frame bridge through
// `FrameBridge` and learns what happens in the frame through `FrameEvents`.
// Locally and hosted this rides postMessage; in stories it is an in-memory
// fake. Both contracts stay small on purpose: they are the wire the SaaS
// will speak to a sandboxed iframe.

export type OverlayMode = "off" | "draw" | "comment";

export interface SlideInfo {
  index: number;
  sourceFile: string | null;
}

/** Parent -> frame. */
export interface FrameBridge {
  setMode(mode: OverlayMode): void;
  /** Persist the overlay draft through the transport; resolves to the entry id. */
  saveDraft(): Promise<string | null>;
  clearDraft(): void;
  goto(index: number): void;
}

/** Frame -> parent. */
export interface FrameEvents {
  slide: number;
  draft: { strokes: StrokeDraft[]; comments: CommentDraft[] };
  mode: OverlayMode;
}

export interface DevSidebarProps {
  transport: DevTransport;
  bridge: FrameBridge;
  /** Subscribe to frame events; returns an unsubscribe. */
  onFrame: (listener: (event: Partial<FrameEvents>) => void) => () => void;
  slides: SlideInfo[];
  initialSlide?: number;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export type { AnnotationEntry, CommentDraft, DevTransport, StrokeDraft };
