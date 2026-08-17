import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Present } from "@liebstoeckel/engine";
import "@liebstoeckel/theme/styles.css";

import { LiveIframe } from "./elements/LiveIframe";
import Title from "./slides/01-title.mdx";
import Agenda from "./slides/02-agenda.mdx";
import CodeSlide from "./slides/04-code";
import StaticCode from "./slides/05-static-code.mdx";
import Closing from "./slides/03-closing";
import Travel from "./slides/06-travel";

// Hot-module boundary: a slide edit re-runs this entry into the SAME React root,
// so the deck keeps its state (current slide, step) across dev-server hot
// reloads instead of jumping back to slide 1. `bun build` compiles the hot.data
// access to a plain createRoot and erases accept() in built decks.
const root = (import.meta.hot.data.root ??= createRoot(document.getElementById("root")!));
root.render(
  <StrictMode>
    <Present
      brands={["acme", "sunset"]}
      slides={[Title, Agenda, CodeSlide, StaticCode, Closing, Travel]}
      persistent={[{ id: "live", render: () => <LiveIframe /> }]}
    />
  </StrictMode>,
);
import.meta.hot.accept();
