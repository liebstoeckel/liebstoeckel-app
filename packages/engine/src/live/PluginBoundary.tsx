import { Component, type ErrorInfo, type ReactNode } from "react";

// Contain a single plugin surface's render failure. A live deck shares its state with
// an untrusted audience, so a malformed remote value could otherwise throw during render
// (e.g. React refusing a non-string child) and unmount the *whole* deck — a deck-wide
// overlay that throws white-screens the presentation for everyone. State is sanitized
// upstream so this should never fire, but it's the last line of defense: a failing plugin
// degrades to its fallback (nothing by default) and the rest of the deck keeps rendering.
// It auto-recovers when `resetKey` changes (e.g. the offending state entry is replaced).
export class PluginBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; resetKey?: unknown },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidUpdate(prev: Readonly<{ resetKey?: unknown }>) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[liebstoeckel] plugin render error (contained):", err, info.componentStack);
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
