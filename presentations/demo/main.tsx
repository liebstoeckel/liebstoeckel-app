import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Deck } from "@present-it/engine";
import "@present-it/theme/styles.css";

import { LiveIframe } from "./elements/LiveIframe";
import Title from "./slides/01-title.mdx";
import Agenda from "./slides/02-agenda.mdx";
import Closing from "./slides/03-closing";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Deck
      brands={["acme", "sunset"]}
      slides={[Title, Agenda, Closing]}
      persistent={[{ id: "live", render: () => <LiveIframe /> }]}
    />
  </StrictMode>,
);
