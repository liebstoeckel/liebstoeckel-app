import { afterEach, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Backdrop, BackdropProvider, type BackdropComponent } from "./backdrop";
import { CAPTURE_FLAG, PRINT_FLAG } from "./build/capture-protocol";
import { Present } from "./Present";
import { Deck } from "./Deck";
import { DeckThumb } from "./Thumb";
import { normalizeSlides } from "./slides";

// A backdrop that only reports what it was given.
function Probe({ still, slide, tone }: { still?: boolean; slide?: number; tone?: string }) {
  return <i data-still={String(still)} data-slide={String(slide)} data-tone={String(tone)} />;
}

const Plain = () => null;
const slides = [Plain, { default: Plain, backdropProps: { tone: "warm" } }, { default: Plain, notes: "no props" }];

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

  test("a slide's backdropProps reach the backdrop drawn behind that slide only", () => {
    const behind = (slide: number) =>
      renderToStaticMarkup(
        <BackdropProvider backdrop={Probe} slides={slides}>
          <Backdrop slide={slide} />
        </BackdropProvider>,
      );
    expect(behind(1)).toContain('data-tone="warm"');
    expect(behind(0)).toContain('data-tone="undefined"');
    expect(behind(2)).toContain('data-tone="undefined"');
  });

  test("the engine's own props win over a slide's", () => {
    const html = renderToStaticMarkup(
      <BackdropProvider backdrop={Probe} slides={[{ default: Plain, backdropProps: { still: true, slide: 9 } }]}>
        <Backdrop slide={0} />
      </BackdropProvider>,
    );
    expect(html).toContain('data-still="false"');
    expect(html).toContain('data-slide="0"');
  });

  test("a thumbnail gets its own slide's backdropProps", () => {
    const html = renderToStaticMarkup(
      <BackdropProvider backdrop={Probe} slides={slides}>
        <DeckThumb index={1} Component={Plain} />
      </BackdropProvider>,
    );
    expect(html).toContain('data-tone="warm"');
    expect(html).toContain('data-still="true"');
  });

  test("an inner provider without slides keeps the outer one's", () => {
    const html = renderToStaticMarkup(
      <BackdropProvider backdrop={Probe} slides={slides}>
        <BackdropProvider backdrop={Probe}>
          <Backdrop slide={1} />
        </BackdropProvider>
      </BackdropProvider>,
    );
    expect(html).toContain('data-tone="warm"');
  });
});

describe("a deck hands its slides' backdropProps to its backdrop", () => {
  test("the first slide's props are behind the first slide", () => {
    const html = renderToStaticMarkup(<Deck slides={[{ default: Plain, backdropProps: { tone: "warm" } }, Plain]} backdrop={Probe} />);
    expect(html).toContain('data-tone="warm"');
    expect(html).toContain('data-slide="0"');
  });
});

// Present picks its view from these: the build's capture and print flags, and the
// presenter window's #presenter hash.
const g = globalThis as Record<string, unknown>;
afterEach(() => {
  delete g[CAPTURE_FLAG];
  delete g[PRINT_FLAG];
  delete g.location;
});
const tones = (html: string) => [...html.matchAll(/<i data-still="(\w+)" data-slide="(\w+)" data-tone="(\w+)"/g)].map((m) => `${m[2]}:${m[3]}`);
const toned = [Plain, { default: Plain, backdropProps: { tone: "warm" } }, { default: Plain, backdropProps: { tone: "cold" } }];

describe("Present hands its slides' backdropProps to every view", () => {
  test("the build's capture of one slide", () => {
    g[CAPTURE_FLAG] = { index: 1 };
    expect(tones(renderToStaticMarkup(<Present slides={toned} backdrop={Probe} />))).toEqual(["1:warm"]);
  });

  test("print, in the order the pages are printed", () => {
    g[PRINT_FLAG] = { indices: [2, 1, 0] };
    expect(tones(renderToStaticMarkup(<Present slides={toned} backdrop={Probe} />))).toEqual(["2:cold", "1:warm", "0:undefined"]);
  });

  test("the presenter window: the current slide and the next one", () => {
    g.location = { hash: "#presenter", search: "", pathname: "/", href: "http://localhost/#presenter" };
    const seen = tones(renderToStaticMarkup(<Present slides={toned} backdrop={Probe} />));
    expect(seen).toContain("0:undefined");
    expect(seen).toContain("1:warm");
  });
});

describe("backdrop types", () => {
  test("a backdrop written for 0.4.0 still fits, a required own prop does not", () => {
    const Old = ({ still }: { still?: boolean }) => <i data-still={String(still)} />;
    const fits: BackdropComponent = Old;
    const Strict: BackdropComponent<{ tone: string }> = ({ tone }) => <i data-tone={tone} />;
    // @ts-expect-error a slide without backdropProps would pass no `tone`
    const rejected: BackdropComponent = Strict;
    expect([fits, rejected]).toHaveLength(2);
  });
});

describe("normalizeSlides", () => {
  test("keeps a slide's backdropProps", () => {
    const [bare, withProps] = normalizeSlides([Plain, { default: Plain, backdropProps: { tone: "warm" } }]);
    expect(bare!.backdropProps).toBeUndefined();
    expect(withProps!.backdropProps).toEqual({ tone: "warm" });
  });
});
