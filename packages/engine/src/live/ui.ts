import type { ComponentType } from "react";

type CMap = Record<string, ComponentType<Record<string, unknown>>>;

/** Merge author surface overrides over plugin defaults (overrides win). */
export function mergeUi(base: CMap, over?: CMap): CMap {
  return { ...base, ...(over ?? {}) };
}
