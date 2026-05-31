import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Present } from "@liebstoeckel/engine";
import "@liebstoeckel/theme/styles.css";

import * as intro from "./slides/01-intro";
import * as chart from "./slides/02-hello-chart";
import * as gallery from "./slides/03-gallery";
import * as gallery2 from "./slides/04-gallery2";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Present title="Registry Demo" brands={["nocturne"]} slides={[intro, chart, gallery, gallery2]} />
  </StrictMode>,
);
