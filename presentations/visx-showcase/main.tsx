import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Present } from "@liebstoeckel/engine";
import "@liebstoeckel/theme/styles.css";

// `import * as` so each slide module carries its default component + `notes` export.
import * as title from "./slides/01-title";
import * as stats from "./slides/02-stats";
import * as area from "./slides/03-area";
import * as bars from "./slides/04-bars";
import * as donut from "./slides/05-donut";
import * as scatter from "./slides/06-scatter";
import * as dx from "./slides/07-dx.mdx";
import * as closing from "./slides/08-closing";

// Hot-module boundary: a slide edit re-runs this entry into the SAME React root,
// so the deck keeps its state (current slide, step) across dev-server hot
// reloads instead of jumping back to slide 1. `bun build` compiles the hot.data
// access to a plain createRoot and erases accept() in built decks.
const root = (import.meta.hot.data.root ??= createRoot(document.getElementById("root")!));
root.render(
  <StrictMode>
    <Present
      title="Data, in motion"
      brands={["nocturne"]}
      slides={[title, stats, area, bars, donut, scatter, dx, closing]}
    />
  </StrictMode>,
);
import.meta.hot.accept();
