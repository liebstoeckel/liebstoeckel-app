// Subpath entry for the React sidebar (`@liebstoeckel/dev-server/ui`): the
// parent-document half of dev mode, shared by the CLI's local shell page and
// a hosted dashboard. Import-leaf like `/bridge` and `/protocol`.
export { DevShell, DevSidebar, type DevShellProps } from "../ui/sidebar";
export type { DevSidebarProps, FrameBridge, FrameEvents, OverlayMode, SlideInfo } from "../ui/types";
export { createFrameHost, type FrameHost, type FrameHostOptions } from "../ui/frame-host";
