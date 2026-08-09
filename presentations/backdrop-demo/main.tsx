import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Present } from "@liebstoeckel/engine";
import "@liebstoeckel/theme/styles.css";

import { Aurora } from "./elements/Aurora";
import Title from "./slides/01-title";
import How from "./slides/02-how";
import Cheap from "./slides/03-cheap";
import Code from "./slides/04-code.mdx";
import Closing from "./slides/05-closing";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Present brands={["nocturne"]} slides={[Title, How, Cheap, Code, Closing]} backdrop={Aurora} />
  </StrictMode>,
);
