import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Present } from "@liebstoeckel/engine";
import poll from "@liebstoeckel/plugin-poll";
import qa from "@liebstoeckel/plugin-qa";
import reactions from "@liebstoeckel/plugin-reactions";
// the tug of war lives in this deck. It is also listed in package.json, so the
// build reads its manifest: which state fields the audience may write.
import tug from "./plugins/tug/src/client";
import "@liebstoeckel/theme/styles.css";

import * as title from "./slides/01-title";
import * as pollSlide from "./slides/02-poll";
import * as tugSlide from "./slides/03-tug";
import * as ask from "./slides/04-ask";
import * as eject from "./slides/05-eject";

// Hot-module boundary: a slide edit re-runs this entry into the SAME React root,
// so the deck keeps its state (current slide, step) across dev-server hot
// reloads instead of jumping back to slide 1. `bun build` compiles the
// hot.data access to a plain createRoot and erases accept() in built decks.
const root = (import.meta.hot.data.root ??= createRoot(document.getElementById("root")!));
root.render(
  <StrictMode>
    <Present
      title="The room"
      brands={["liebstoeckel"]}
      plugins={[poll, qa, reactions, tug]}
      slides={[title, pollSlide, tugSlide, ask, eject]}
    />
  </StrictMode>,
);
import.meta.hot.accept();
