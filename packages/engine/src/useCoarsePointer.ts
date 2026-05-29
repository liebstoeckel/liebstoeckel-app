import { useEffect, useState } from "react";

/** True on a coarse (touch) pointer. Used to upsize tap targets, swap the
 *  keyboard help for the ⋮ menu, and (by default) drop slide transitions on
 *  mobile. SSR / no-`matchMedia` safe (returns false). */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return coarse;
}
