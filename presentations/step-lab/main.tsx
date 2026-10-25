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
// Hot-module boundary: a slide edit re-runs this entry into the SAME React root,
// so the deck keeps its state (current slide, step) across dev-server hot
// reloads instead of jumping back to slide 1. A built deck has no hot reload:
// the build gives it an inert import.meta.hot, so this runs once, as written.
const root = (import.meta.hot.data.root ??= createRoot(document.getElementById("root")!));
root.render(
  <StrictMode>
    <Present
      brands={["acme", "sunset"]}
      slides={[Start, Five, Bare, Weighted, Single, Finale]}
      persistent={[{ id: "probe", render: () => <StateProbe /> }]}
    />
  </StrictMode>,
);
import.meta.hot.accept();
