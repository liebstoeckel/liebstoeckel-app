export { Present } from "./Present";
export { Deck, type DeckProps } from "./Deck";
export { PresenterView } from "./PresenterView";
export { ScaledStage, SlideFrame, STAGE_W, STAGE_H } from "./Stage";
export { HelpOverlay } from "./HelpOverlay";
export { useDeckSync } from "./useDeckSync";
export { useDeckNav } from "./nav";
export { normalizeSlides, type SlideInput } from "./slides";
export {
  resolveTransition,
  TRANSITIONS,
  DEFAULT_TRANSITION,
  type SlideTransition,
  type SlideTransitionName,
  type SlideTransitionSpec,
  type SlideDirection,
} from "./transitions";
export { CaptureView } from "./CaptureView";
export { PrintView } from "./PrintView";
export { readThumbnails, type ThumbnailSet } from "./thumbnails";
export { Step, StepsProvider, useRevealState } from "./steps";
export { CodeMagic } from "./CodeMagic";
export type { TokenizedStep, CodeToken } from "./code/types";
export {
  fullscreenAction,
  toggleFullscreen,
  accumulateDigits,
  stepForward,
  stepBack,
  clampIndex,
} from "./delivery";
export {
  PersistentProvider,
  PersistentLayer,
  Slot,
  type PersistentItem,
} from "./PersistentLayer";
export { Magic, Atmosphere } from "@liebstoeckel/components";
export {
  Plugin,
  LiveProvider,
  useLive,
  detectLive,
  getParticipantId,
  connectLive,
  getDeckIndex,
  setDeckIndex,
  useLiveDeck,
  mergeUi,
  type LiveInfo,
  type LiveConnection,
  type LiveContextValue,
  type DeckController,
} from "./live";
