import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readTheme } from "./useTheme";
import { Bar, Button, Card, ScrollArea } from "./primitives";

describe("readTheme", () => {
  test("returns brand fallbacks when no document", () => {
    const t = readTheme();
    expect(t.primary).toBe("#caff4d");
    expect(t.viz.length).toBe(6);
  });
});

describe("primitives render", () => {
  test("Bar shows label/value and clamps fill width", () => {
    const html = renderToStaticMarkup(<Bar pct={150} label="Apples" value="3" />);
    expect(html).toContain("Apples");
    expect(html).toContain("width:100%"); // clamped from 150
  });
  test("Button reflects active state", () => {
    const html = renderToStaticMarkup(<Button active>Vote</Button>);
    expect(html).toContain('data-active="true"');
    expect(html).toContain("Vote");
  });
  test("Card renders children", () => {
    expect(renderToStaticMarkup(<Card>hello</Card>)).toContain("hello");
  });
  test("ScrollArea bounds its height and scrolls internally", () => {
    const html = renderToStaticMarkup(<ScrollArea>queue</ScrollArea>);
    expect(html).toContain("queue");
    expect(html).toContain("overflow-y:auto");
    expect(html).toContain("max-height:min(360px, 42vh)"); // default cap
    expect(html).toContain("overscroll-behavior:contain"); // don't chain to the deck
  });
  test("ScrollArea honours a custom maxHeight", () => {
    const html = renderToStaticMarkup(<ScrollArea maxHeight="200px">x</ScrollArea>);
    expect(html).toContain("max-height:200px");
  });
});
