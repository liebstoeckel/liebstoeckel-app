import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Backdrop, BackdropProvider } from "./backdrop";
import { DeckThumb } from "./Thumb";

// A backdrop that only reports what it was given.
function Probe({ still, slide }: { still?: boolean; slide?: number }) {
  return <i data-still={String(still)} data-slide={String(slide)} />;
}

describe("a backdrop knows which slide it is drawn behind", () => {
  test("the slide index reaches a custom backdrop", () => {
    const html = renderToStaticMarkup(
      <BackdropProvider backdrop={Probe}>
        <Backdrop slide={3} />
      </BackdropProvider>,
    );
    expect(html).toContain('data-slide="3"');
    expect(html).toContain('data-still="false"');
  });

  test("a thumbnail's backdrop gets that thumbnail's slide, and is still", () => {
    const html = renderToStaticMarkup(
      <BackdropProvider backdrop={Probe}>
        <DeckThumb index={4} Component={() => null} />
      </BackdropProvider>,
    );
    expect(html).toContain('data-slide="4"');
    expect(html).toContain('data-still="true"');
  });

  test("where no slide is known, the index is left out", () => {
    const html = renderToStaticMarkup(
      <BackdropProvider backdrop={Probe}>
        <Backdrop still />
      </BackdropProvider>,
    );
    expect(html).toContain('data-slide="undefined"');
  });
});
