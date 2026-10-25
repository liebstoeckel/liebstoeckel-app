import { createRoot } from "react-dom/client";
import { Present } from "@liebstoeckel/engine";
import "@liebstoeckel/theme/styles.css";

import { HallBackdrop } from "./elements/HallBackdrop";
import { startBridge } from "./elements/bridge";
import * as hall from "./slides/01-hall";
import * as plugin from "./slides/02-plugin";
import * as poll from "./slides/03-poll";
import * as ask from "./slides/04-ask";
import * as together from "./slides/05-together";
import * as file from "./slides/06-file";

// the hall's beats keep the story's own order; each slide names its beat (`backdropProps`)
const slides = [hall, plugin, poll, ask, together, file];
// Framed on its own site, the page around the deck may drive it (see the bridge).
startBridge(slides.length);

// Hot-module boundary: a slide edit re-runs this entry into the same React root,
// so the deck keeps its place across dev-server reloads.
const root = (import.meta.hot.data.root ??= createRoot(document.getElementById("root")!));
root.render(
  <Present
    title="Your deck is a program. Run it with the room."
    brands={["liebstoeckel"]}
    backdrop={HallBackdrop}
    transition="fade"
    slides={slides}
  />,
);
import.meta.hot.accept();
