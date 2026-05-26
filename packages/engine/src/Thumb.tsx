import type { ComponentType } from "react";
import { MDXProvider } from "@mdx-js/react";
import { mdxComponents } from "@present-it/components";
import { ScaledStage, SlideFrame } from "./Stage";
import { PersistentProvider } from "./PersistentLayer";

/** A scaled, non-interactive thumbnail of a slide (overview + presenter).
 *
 *  Prefers a pre-rendered image (`src`, from the build-time thumbnails manifest) —
 *  a cheap `<img>` instead of a live React subtree. With no `src` it falls back to
 *  rendering the slide **statically** (atmosphere frozen, no persistent layer);
 *  Slots register harmlessly. */
export function DeckThumb({ Component, src, alt }: { Component?: ComponentType; src?: string; alt?: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt ?? ""}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <div className="relative h-full w-full overflow-hidden bg-bg">
      <MDXProvider components={mdxComponents}>
        <PersistentProvider>
          <ScaledStage className="absolute inset-0">
            <SlideFrame still>{Component ? <Component /> : null}</SlideFrame>
          </ScaledStage>
        </PersistentProvider>
      </MDXProvider>
    </div>
  );
}
