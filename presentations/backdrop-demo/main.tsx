import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Present } from "@liebstoeckel/engine";
import "@liebstoeckel/theme/styles.css";

import { Aurora } from "./elements/Aurora";
import * as Title from "./slides/01-title";
import * as How from "./slides/02-how";
import * as Cheap from "./slides/03-cheap";
import * as Code from "./slides/04-code.mdx";
import * as Steer from "./slides/05-steer";
import * as Closing from "./slides/06-closing";

// Hot-module boundary: a slide edit re-runs this entry into the SAME React root,
// so the deck keeps its state (current slide, step) across dev-server hot
// reloads instead of jumping back to slide 1. A built deck has no hot reload:
// the build gives it an inert import.meta.hot, so this runs once, as written.
const root = (import.meta.hot.data.root ??= createRoot(document.getElementById("root")!));
root.render(
  <StrictMode>
    <Present brands={["nocturne"]} slides={[Title, How, Cheap, Code, Steer, Closing]} backdrop={Aurora} />
  </StrictMode>,
);
import.meta.hot.accept();
