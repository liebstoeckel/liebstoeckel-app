import type { ComponentType } from "react";
import { MDXProvider } from "@mdx-js/react";
import { mdxComponents } from "@present-it/components";
import { ScaledStage, SlideFrame } from "./Stage";
import { PersistentProvider } from "./PersistentLayer";

/** A scaled, non-interactive thumbnail of a slide (used by overview + presenter).
 *  Renders without the persistent layer; Slots register harmlessly. */
export function DeckThumb({ Component }: { Component?: ComponentType }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-bg">
      <MDXProvider components={mdxComponents}>
        <PersistentProvider>
          <ScaledStage className="absolute inset-0">
            <SlideFrame>{Component ? <Component /> : null}</SlideFrame>
          </ScaledStage>
        </PersistentProvider>
      </MDXProvider>
    </div>
  );
}
