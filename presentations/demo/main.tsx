import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Present } from "@present-it/engine";
import "@present-it/theme/styles.css";

import { LiveIframe } from "./elements/LiveIframe";
import Title from "./slides/01-title.mdx";
import Agenda from "./slides/02-agenda.mdx";
import CodeSlide from "./slides/04-code";
import StaticCode from "./slides/05-static-code.mdx";
import Closing from "./slides/03-closing";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Present
      brands={["acme", "sunset"]}
      slides={[Title, Agenda, CodeSlide, StaticCode, Closing]}
      persistent={[{ id: "live", render: () => <LiveIframe /> }]}
    />
  </StrictMode>,
);
