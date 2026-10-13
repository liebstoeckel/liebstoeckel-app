import { createContext, useContext, useEffect, useState } from "react";
import type { PluginDef } from "@liebstoeckel/plugin-sdk";
import { phoneFirst } from "../mobile";

/** What the deck hands to the `<Plugin>`s of the current slide while the phone-first
 *  view is on: the element below the slide preview to render into, and a way to say
 *  "this slide has an interactive plugin" so the deck switches its layout. Null
 *  everywhere else (desktop, landscape, presenters, thumbnails, the presenter view),
 *  where a plugin renders in the slide as before. */
export interface PhoneView {
  target: HTMLElement | null;
  register: () => () => void;
}

export const PhoneViewContext = createContext<PhoneView | null>(null);
export const usePhoneView = (): PhoneView | null => useContext(PhoneViewContext);

/** Whether this screen gets the phone-first audience view, tracked across rotation
 *  and resizes. False during server rendering and until the first measure. */
export function usePhoneFirst(role: string | undefined): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof matchMedia !== "function") return;
    const coarse = matchMedia("(pointer: coarse)");
    const update = () =>
      setOn(phoneFirst({ role, coarse: coarse.matches, width: window.innerWidth, height: window.innerHeight }));
    update();
    coarse.addEventListener?.("change", update);
    window.addEventListener("resize", update);
    return () => {
      coarse.removeEventListener?.("change", update);
      window.removeEventListener("resize", update);
    };
  }, [role]);
  return on;
}

/** A plugin's name for people: its presenter tab label ("Poll", "Q&A"), else its
 *  global control label ("Reactions"), else its id. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pluginLabel(def: PluginDef<any> | undefined, id: string): string {
  return def?.client.presenter?.label ?? def?.client.global?.label ?? id;
}
