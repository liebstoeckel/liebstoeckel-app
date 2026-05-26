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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Present
      title="Data, in motion"
      brands={["nocturne"]}
      slides={[title, stats, area, bars, donut, scatter, dx, closing]}
    />
  </StrictMode>,
);
