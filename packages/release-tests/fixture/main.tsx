import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Present } from "@liebstoeckel/engine";
import poll from "@liebstoeckel/plugin-poll";
import qa from "@liebstoeckel/plugin-qa";
import reactions from "@liebstoeckel/plugin-reactions";
import "@liebstoeckel/theme/styles.css";

import * as title from "./slides/01-title";
import * as code from "./slides/02-code";
import * as pollSlide from "./slides/03-poll";
import * as persistent from "./slides/04-persistent";

// Hot-module boundary: a slide edit re-runs this entry into the SAME React root,
// so the deck keeps its state (current slide, step) across dev-server hot
// reloads instead of jumping back to slide 1. `bun build` compiles the
// hot.data access to a plain createRoot and erases accept() in built decks.
const root = (import.meta.hot.data.root ??= createRoot(document.getElementById("root")!));
root.render(
  <StrictMode>
    <Present
      title="E2E Fixture"
      brands={["nocturne"]}
      plugins={[poll, qa, reactions]}
      slides={[title, code, pollSlide, persistent]}
      persistent={[{ id: "live", render: () => <div data-testid="live-box" style={{ width: "100%", height: "100%", background: "var(--brand-primary)" }} /> }]}
    />
  </StrictMode>,
);
import.meta.hot.accept();
