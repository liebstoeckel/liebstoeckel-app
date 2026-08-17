import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Present } from "@liebstoeckel/engine";
import poll from "@liebstoeckel/plugin-poll";
import qa from "@liebstoeckel/plugin-qa";
import reactions from "@liebstoeckel/plugin-reactions";
import "@liebstoeckel/theme/styles.css";

import * as title from "./slides/01-title";
import * as pollSlide from "./slides/02-poll";
import * as pollPaceSlide from "./slides/06-poll-pace";
import * as qaSlide from "./slides/04-qa";
import * as reactionsSlide from "./slides/05-reactions";
import * as outro from "./slides/03-outro";

// Hot-module boundary: a slide edit re-runs this entry into the SAME React root,
// so the deck keeps its state (current slide, step) across dev-server hot
// reloads instead of jumping back to slide 1. `bun build` compiles the hot.data
// access to a plain createRoot and erases accept() in built decks.
const root = (import.meta.hot.data.root ??= createRoot(document.getElementById("root")!));
root.render(
  <StrictMode>
    <Present
      title="Live Poll Demo"
      brands={["nocturne"]}
      plugins={[poll, qa, reactions]}
      slides={[title, pollSlide, pollPaceSlide, qaSlide, reactionsSlide, outro]}
    />
  </StrictMode>,
);
import.meta.hot.accept();
