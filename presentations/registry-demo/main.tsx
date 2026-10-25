import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Present } from "@liebstoeckel/engine";
import "@liebstoeckel/theme/styles.css";

import * as intro from "./slides/01-intro";
import * as chart from "./slides/02-hello-chart";
import * as gallery from "./slides/03-gallery";
import * as gallery2 from "./slides/04-gallery2";

// Hot-module boundary: a slide edit re-runs this entry into the SAME React root,
// so the deck keeps its state (current slide, step) across dev-server hot
// reloads instead of jumping back to slide 1. A built deck has no hot reload:
// the build gives it an inert import.meta.hot, so this runs once, as written.
const root = (import.meta.hot.data.root ??= createRoot(document.getElementById("root")!));
root.render(
  <StrictMode>
    <Present title="Registry Demo" brands={["nocturne"]} slides={[intro, chart, gallery, gallery2]} />
  </StrictMode>,
);
import.meta.hot.accept();
