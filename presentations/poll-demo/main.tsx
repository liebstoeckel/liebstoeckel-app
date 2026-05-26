import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Present } from "@liebstoeckel/engine";
import poll from "@liebstoeckel/plugin-poll";
import qa from "@liebstoeckel/plugin-qa";
import reactions from "@liebstoeckel/plugin-reactions";
import "@liebstoeckel/theme/styles.css";

import * as title from "./slides/01-title";
import * as pollSlide from "./slides/02-poll";
import * as qaSlide from "./slides/04-qa";
import * as reactionsSlide from "./slides/05-reactions";
import * as outro from "./slides/03-outro";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Present
      title="Live Poll Demo"
      brands={["nocturne"]}
      plugins={[poll, qa, reactions]}
      slides={[title, pollSlide, qaSlide, reactionsSlide, outro]}
    />
  </StrictMode>,
);
