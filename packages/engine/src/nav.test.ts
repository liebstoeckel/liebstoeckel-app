import { test, expect, describe } from "bun:test";
import { isActivatableTarget, isEditableTarget } from "./nav";

describe("isEditableTarget", () => {
  test("text-editable elements swallow global shortcuts", () => {
    expect(isEditableTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "SELECT" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
  });

  test("non-editable targets still let shortcuts through", () => {
    expect(isEditableTarget({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget({ tagName: "DIV" } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("isActivatableTarget", () => {
  const el = (tagName: string, attrs: Record<string, string> = {}) =>
    ({ tagName, getAttribute: (n: string) => attrs[n] ?? null }) as unknown as EventTarget;

  test("buttons, links and button-like roles handle Enter themselves", () => {
    expect(isActivatableTarget(el("BUTTON"))).toBe(true);
    expect(isActivatableTarget(el("SUMMARY"))).toBe(true);
    expect(isActivatableTarget(el("A", { href: "#x" }))).toBe(true);
    expect(isActivatableTarget(el("DIV", { role: "button" }))).toBe(true);
    expect(isActivatableTarget(el("DIV", { role: "option" }))).toBe(true);
    expect(isActivatableTarget(el("DIV", { role: "tab" }))).toBe(true);
  });

  test("the deck root, plain elements and anchors without href leave Enter to the deck", () => {
    expect(isActivatableTarget(el("MAIN"))).toBe(false);
    expect(isActivatableTarget(el("DIV"))).toBe(false);
    expect(isActivatableTarget(el("A"))).toBe(false);
    expect(isActivatableTarget(el("BODY"))).toBe(false);
    expect(isActivatableTarget(null)).toBe(false);
  });
});
