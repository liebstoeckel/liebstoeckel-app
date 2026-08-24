import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { httpTransport } from "../drawer/http-transport";
import { createFrameHost } from "./frame-host";
import { DevShell, DevSidebar } from "./sidebar";
import type { FrameEvents, SlideInfo } from "./types";

// The dev shell document served at /: the sidebar on the left, the deck
// (reached via /deck) in an iframe on the right, the two joined by the frame host.
// The token arrives in a prelude exactly as it did for the v1 drawer.

declare global {
  interface Window {
    __LIEBSTOECKEL_DEV__?: { token: string; deckRoute?: string };
  }
}

function Shell({ token }: { token: string }) {
  const transport = useMemo(() => httpTransport(token), [token]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const slideRef = useRef(0);
  const [slides, setSlides] = useState<SlideInfo[]>([]);
  const [host, setHost] = useState<ReturnType<typeof createFrameHost> | null>(null);

  const loadSlides = useCallback(async () => {
    try {
      const s = await transport.getState();
      setSlides((s.slides ?? []).map((sourceFile, index) => ({ index, sourceFile })));
    } catch {
      // the next event retries
    }
  }, [transport]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const h = createFrameHost(iframe, { transport, frameOrigin: location.origin, currentSlide: () => slideRef.current });
    const off = h.onFrame((e) => {
      if (typeof e.slide === "number") slideRef.current = e.slide;
    });
    setHost(h);
    // A click on a sidebar button moves focus into the shell document, and the
    // deck's keyboard navigation (arrows, space) listens on the frame's own
    // window. Hand focus back to the frame after clicks that did not land on a
    // text field, so the keys keep working without a click on the deck first.
    const refocusFrame = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".lst-sidebar")) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || (active instanceof HTMLElement && active.isContentEditable)) return;
      iframe.contentWindow?.focus();
    };
    document.addEventListener("click", refocusFrame);
    void loadSlides();
    // Slide files come and go under hot reload; re-read the list on every change pushed by the server.
    const unsubscribe = transport.subscribe((msg) => {
      if (msg.type === "annotation_updated" || msg.type === "connected" || msg.type === "batch_resolved" || msg.type === "batch_reverted") void loadSlides();
    });
    const poll = setInterval(() => void loadSlides(), 5000);
    return () => {
      document.removeEventListener("click", refocusFrame);
      off();
      unsubscribe();
      clearInterval(poll);
      h.destroy();
    };
  }, [transport, loadSlides]);

  const onFrame = useCallback(
    (listener: (event: Partial<FrameEvents>) => void) => (host ? host.onFrame(listener) : () => {}),
    [host],
  );

  // The deck keeps its own URL hash (e.g. #presenter) through the shell. The
  // bundle is mounted under a token path (/deck only redirects there).
  const src = `${window.__LIEBSTOECKEL_DEV__?.deckRoute ?? "/deck"}${location.hash}`;

  return (
    <DevShell
      sidebar={
        host ? (
          <DevSidebar transport={transport} bridge={host.bridge} onFrame={onFrame} slides={slides} />
        ) : (
          <aside className="lst-sidebar" aria-label="liebstoeckel dev" />
        )
      }
    >
      <iframe ref={iframeRef} src={src} title="deck" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, background: "#000" }} />
    </DevShell>
  );
}

const token = window.__LIEBSTOECKEL_DEV__?.token;
const root = document.getElementById("root")!;
if (!token) {
  root.textContent = "No dev session token: open this page through a running `liebstoeckel dev`.";
} else {
  createRoot(root).render(
    <StrictMode>
      <Shell token={token} />
    </StrictMode>,
  );
}
