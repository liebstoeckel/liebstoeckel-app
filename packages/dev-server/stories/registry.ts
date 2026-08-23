import type { ReactNode } from "react";
import type { StoryContext } from "./main";

// Explicit story registry (Bun has no import.meta.glob). Each module is plain
// CSF: a default export with `title` and named exports rendering a story.

export interface StoryModule {
  default: { title: string };
  [name: string]: unknown | ((ctx: StoryContext) => ReactNode);
}

import * as frameHost from "./frame-host.stories";
import * as sidebar from "./sidebar.stories";

export const STORY_MODULES: StoryModule[] = [sidebar, frameHost];
