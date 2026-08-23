// The dev-mode drawer entry: injected by the loader tag when a dev server
// answers /__dev/ping. Composes the in-frame bridge (types, slide sync,
// capture, tool registry), the local HTTP/SSE transport, the shadow-root
// shell, and the annotations tool. This file has no exports on purpose: the
// bundle loads as a classic script.

import { watchCurrentSlide } from "./bridge";
import { httpTransport } from "./http-transport";
import { HOST_ID, createShell } from "./shell";
import { registerAnnotationTool } from "./tools/annotations";

function boot(): void {
  const config = window.__LIEBSTOECKEL_DEV__;
  if (!config?.token || document.getElementById(HOST_ID)) return;
  const transport = httpTransport(config.token);
  const currentSlide = watchCurrentSlide(() => shell.onSlideChange());
  const shell = createShell(transport, currentSlide);
  registerAnnotationTool();
  shell.mountTools();
}

boot();
