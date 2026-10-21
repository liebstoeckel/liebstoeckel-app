import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Present } from "@liebstoeckel/engine";
import poll from "@liebstoeckel/plugin-poll";
import qa from "@liebstoeckel/plugin-qa";
import reactions from "@liebstoeckel/plugin-reactions";
import "@liebstoeckel/theme/styles.css";
import "./brands/fixture.css";

import { fixture } from "./brands/fixture";
import applause from "./plugins/applause";
import * as intro from "./slides/01-intro";
import * as mdx from "./slides/02-mdx.mdx";
import * as codeFile from "./slides/03-code-file";
import * as codeStoryMacro from "./slides/04-code-story";
import * as charts from "./slides/05-charts";
import * as images from "./slides/06-images";
import * as persistent from "./slides/07-persistent";
import * as live from "./slides/08-live";
import * as cjs from "./slides/09-cjs";
import * as join from "./slides/10-join";

// Hot-module boundary: a slide edit re-runs this entry into the SAME React root,
// so the deck keeps its state (current slide, step) across dev-server hot
// reloads instead of jumping back to slide 1. A built deck has no hot reload:
// the build gives it an inert import.meta.hot, so this runs once, as written.
const root = (import.meta.hot.data.root ??= createRoot(document.getElementById("root")!));
root.render(
  <StrictMode>
    <Present
      title="Release fixture"
      brands={["fixture"]}
      brandThemes={[fixture]}
      plugins={[poll, qa, reactions, applause]}
      slides={[intro, mdx, codeFile, codeStoryMacro, charts, images, persistent, live, cjs, join]}
      persistent={[{ id: "badge", render: () => <div data-testid="persistent-badge" className="h-full w-full rounded-xl bg-primary" /> }]}
    />
  </StrictMode>,
);
import.meta.hot.accept();
