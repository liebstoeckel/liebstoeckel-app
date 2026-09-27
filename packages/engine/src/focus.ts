import { useEffect, type RefObject } from "react";

/** Selector for elements a keyboard user can Tab to inside a dialog. */
const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Where focus returns when a deck dialog closes: the view's own root (the deck's
 *  `<main>`, or the presenter's), marked `data-pi-focus-home`. Returning there rather
 *  than to the button that opened the dialog keeps the next Enter or Space on the
 *  deck: a presenter who opened help with the mouse and closes it with Esc does not
 *  leave a focused button behind that Enter would click again mid-talk. */
function focusHome(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.querySelector<HTMLElement>("[data-pi-focus-home]");
}

/** Index of the element Tab (or Shift+Tab) should move to inside a focus trap of
 *  `count` elements, given the index of the currently focused one (-1 when focus is
 *  on the dialog itself or outside it). Wraps at both ends. */
export function trapTarget(current: number, count: number, backward: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return backward ? count - 1 : 0;
  if (backward) return current === 0 ? count - 1 : current - 1;
  return current === count - 1 ? 0 : current + 1;
}

/** Modal dialog focus handling for the deck's overlays (help, overview, end card, QR
 *  share): while `open`, focus moves into the dialog and Tab cycles inside it; when
 *  it closes, focus goes back to the view root (see `focusHome`) if it was still in
 *  the dialog or had fallen to `<body>`. `initial` picks the element to focus on
 *  open; by default the dialog container itself (give it `tabIndex={-1}`). */
export function useDialogFocus(open: boolean, ref: RefObject<HTMLElement | null>, initial?: () => HTMLElement | null | undefined) {
  useEffect(() => {
    if (!open) return;
    const box = ref.current;
    if (!box) return;
    (initial?.() ?? box).focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = items[trapTarget(at, items.length, e.shiftKey)];
      e.preventDefault();
      next?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const active = document.activeElement;
      if (!active || active === document.body || box.contains(active)) focusHome()?.focus({ preventScroll: true });
    };
    // `initial` is read once per opening; a changing callback identity must not refocus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ref]);
}
