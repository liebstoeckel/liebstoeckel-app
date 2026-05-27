import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StepsProvider, Step } from "./steps";

describe("Step visibility by step index", () => {
  const deck = (step: number) =>
    renderToStaticMarkup(
      <StepsProvider step={step} slideIndex={0}>
        <Step>one</Step>
        <Step>two</Step>
      </StepsProvider>,
    );

  // On the server, effects don't run so registration hasn't happened; the markup
  // still renders the children (hidden via opacity/aria), which is enough to assert
  // the component tree is valid and content is present.
  test("renders step content", () => {
    const html = deck(0);
    expect(html).toContain("one");
    expect(html).toContain("two");
  });

  test("aria-hidden reflects unshown steps at step 0 (pre-registration safe)", () => {
    // before registration order is 0 → not shown; aria-hidden true present
    expect(deck(0)).toContain('aria-hidden="true"');
  });

  test("Step outside a provider is always shown", () => {
    const html = renderToStaticMarkup(<Step>solo</Step>);
    expect(html).toContain("solo");
    expect(html).toContain('aria-hidden="false"');
  });
});
