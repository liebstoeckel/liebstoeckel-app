import { createRoot } from "react-dom/client";
import { Present } from "@liebstoeckel/engine";
import "@liebstoeckel/theme/styles.css";

import { HallBackdrop } from "./elements/HallBackdrop";
import * as hall from "./slides/01-hall";
import * as poll from "./slides/02-poll";
import * as ask from "./slides/03-ask";
import * as plugin from "./slides/04-plugin";
import * as together from "./slides/05-together";
import * as file from "./slides/06-file";

// Hot-module boundary: a slide edit re-runs this entry into the same React root,
// so the deck keeps its place across dev-server reloads.
const root = (import.meta.hot.data.root ??= createRoot(document.getElementById("root")!));
root.render(
  <Present
    title="Present with the room"
    brands={["liebstoeckel"]}
    backdrop={HallBackdrop}
    transition="fade"
    slides={[hall, poll, ask, plugin, together, file]}
  />,
);
import.meta.hot.accept();
