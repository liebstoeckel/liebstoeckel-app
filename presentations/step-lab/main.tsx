import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Present } from "@liebstoeckel/engine";
import "@liebstoeckel/theme/styles.css";

import { StateProbe } from "./elements/StateProbe";
import Start from "./slides/01-start";
import Five from "./slides/02-five";
import Bare from "./slides/03-bare";
import Weighted from "./slides/04-weighted";
import Single from "./slides/05-single";
import Finale from "./slides/06-finale";

// Reveal counts per slide: 0, 5, 2, 4, 1, 3. Deliberately uneven, and slide 3 has
// no <Slot>, so every boundary changes both the reveal count and whether the
// persistent element has somewhere to live.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Present
      slides={[Start, Five, Bare, Weighted, Single, Finale]}
      persistent={[{ id: "probe", render: () => <StateProbe /> }]}
    />
  </StrictMode>,
);
