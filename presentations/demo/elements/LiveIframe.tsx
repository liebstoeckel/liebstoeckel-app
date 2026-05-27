// A stateful element for the persistent layer: an iframe with an internal clock.
// The engine renders it once and moves it between <Slot>s, so the clock keeps
// running across slides (a reload would reset it to 0).
const SRC = `<!doctype html><html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#10b981,#0ea5e9);color:#fff;font-family:ui-monospace,monospace">
<div style="text-align:center">
  <div id="c" style="font-size:clamp(28px,6vw,56px);font-weight:700">0.0s</div>
  <div style="opacity:.85;font-size:13px;margin-top:6px">live iframe · state persists</div>
</div>
<script>let t=0;setInterval(function(){t+=0.1;document.getElementById('c').textContent=t.toFixed(1)+'s'},100)</script>
</body></html>`;

export function LiveIframe() {
  return (
    <iframe
      title="live"
      srcDoc={SRC}
      className="h-full w-full rounded-2xl border-0 shadow-2xl"
    />
  );
}
