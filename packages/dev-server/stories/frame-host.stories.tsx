import { useEffect, useRef, useState } from "react";
import { DevShell, DevSidebar, createFrameHost } from "../src/ui";
import { FIXTURE_SLIDES, memoryTransport } from "../ui/fixtures";
import type { FrameBridge, FrameEvents } from "../ui/types";
import type { StoryContext } from "./main";

export default { title: "FrameHost" };

// A stand-in deck that speaks the frame protocol from inside a real iframe:
// it greets, accepts init, echoes mode/draft/slide, and answers capture with a
// scripted draft. Exercises the postMessage layer without a deck or a server.
const ECHO_FRAME = `<!doctype html><html><body style="margin:0;background:#000;color:#e9e6d7;font:14px system-ui;display:grid;place-items:center;height:100vh">
<div id="s">slide 1</div>
<script>
  var slide = 0, mode = "off", draft = { strokes: [], comments: [], space: "stage" }, origin = null;
  function post(m) { parent.postMessage(m, origin || "*"); }
  addEventListener("message", function (e) {
    if (e.source !== parent) return;
    var m = e.data || {};
    if (!origin) { if (m.type === "lst:init") { origin = e.origin; post({ type: "lst:slide", index: slide }); post({ type: "lst:mode", mode: mode }); post({ type: "lst:draft", draft: draft }); } return; }
    if (e.origin !== origin) return;
    if (m.type === "lst:setMode") { mode = m.mode; post({ type: "lst:mode", mode: mode }); if (mode !== "off") { draft.strokes.push({ points: [[0.1, 0.1], [0.4, 0.4]] }); post({ type: "lst:draft", draft: draft }); } }
    if (m.type === "lst:clearDraft") { draft = { strokes: [], comments: [], space: "stage" }; post({ type: "lst:draft", draft: draft }); }
    if (m.type === "lst:goto") { slide = m.index; document.getElementById("s").textContent = "slide " + (slide + 1); post({ type: "lst:slide", index: slide }); }
    if (m.type === "lst:capture") { post({ type: "lst:captured", id: m.id, draft: draft, screenshot: null }); draft = { strokes: [], comments: [], space: "stage" }; post({ type: "lst:draft", draft: draft }); }
  });
  post({ type: "lst:hello" });
</script></body></html>`;

function Scenario(_ctx: StoryContext) {
  const transport = useRef(memoryTransport([], { agentPolling: true })).current;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const slideRef = useRef(0);
  const [host, setHost] = useState<{ bridge: FrameBridge; onFrame: (l: (e: Partial<FrameEvents>) => void) => () => void } | null>(null);
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    // srcdoc frames inherit the parent's origin.
    const h = createFrameHost(iframe, { transport, frameOrigin: location.origin, currentSlide: () => slideRef.current });
    const off = h.onFrame((e) => {
      if (typeof e.slide === "number") slideRef.current = e.slide;
    });
    setHost(h);
    return () => {
      off();
      h.destroy();
    };
  }, [transport]);
  return (
    <DevShell sidebar={host ? <DevSidebar transport={transport} bridge={host.bridge} onFrame={host.onFrame} slides={FIXTURE_SLIDES} /> : <aside className="lst-sidebar" />}>
      <iframe ref={iframeRef} srcDoc={ECHO_FRAME} title="echo deck" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} />
    </DevShell>
  );
}

export const EchoFrame = (ctx: StoryContext) => <Scenario {...ctx} />;
EchoFrame.note = "The real createFrameHost against an iframe that speaks the protocol: Draw adds a stroke from the frame, Save captures it through the host into the in-memory transport, clicking a slide navigates the frame.";
