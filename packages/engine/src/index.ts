export { Present } from "./Present";
export { Deck, type DeckProps } from "./Deck";
export { PresenterView } from "./PresenterView";
export { ScaledStage, SlideFrame, STAGE_W, STAGE_H } from "./Stage";
export { HelpOverlay } from "./HelpOverlay";
export { useDeckSync } from "./useDeckSync";
export { useDeckNav } from "./nav";
export { normalizeSlides, type SlideInput } from "./slides";
export { CaptureView } from "./CaptureView";
export { readThumbnails, type ThumbnailSet } from "./thumbnails";
export { Step, StepsProvider } from "./steps";
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
export { Magic, Atmosphere } from "@present-it/components";
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
