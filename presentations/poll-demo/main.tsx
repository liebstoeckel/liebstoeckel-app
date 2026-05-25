import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Present } from "@present-it/engine";
import poll from "@present-it/plugin-poll";
import "@present-it/theme/styles.css";

import * as title from "./slides/01-title";
import * as pollSlide from "./slides/02-poll";
import * as outro from "./slides/03-outro";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Present
      title="Live Poll Demo"
      brands={["nocturne"]}
      plugins={[poll]}
      slides={[title, pollSlide, outro]}
    />
  </StrictMode>,
);
