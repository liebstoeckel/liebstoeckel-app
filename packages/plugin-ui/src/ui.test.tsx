import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readTheme } from "./useTheme";
import { Bar, Button, Card } from "./primitives";

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
});
