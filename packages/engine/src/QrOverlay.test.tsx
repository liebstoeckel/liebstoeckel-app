import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PresenterShare, QrOverlay, presenterShareItems } from "./QrOverlay";

// What a projected or screen-shared window may show: the audience link, never the
// presenter grant (anyone who reads it can take over the talk).
const VIEWER = "https://live.example/s/abc?t=VIEWERGRANT";
const PRESENTER = "https://live.example/s/abc?t=PRESENTERGRANT.sig";

describe("share screens hold no presenter grant", () => {
  test("the deck's Q overlay shows only the audience link", () => {
    const html = renderToStaticMarkup(<QrOverlay open url={VIEWER} onClose={() => {}} />);
    expect(html).toContain("Scan to join");
    expect(html).toContain("VIEWERGRANT");
    expect(html).not.toContain("PRESENTERGRANT");
  });

  test("the presenter view's share screen shows the audience link and only a button for the presenter one", () => {
    const html = renderToStaticMarkup(<PresenterShare open viewerUrl={VIEWER} presenterUrl={PRESENTER} onClose={() => {}} />);
    expect(html).toContain("Scan to join");
    expect(html).toContain("VIEWERGRANT");
    expect(html).toContain("Drive from your phone");
    expect(html).toContain("not projected or shared");
    expect(html).not.toContain("PRESENTERGRANT");
  });

  test("the presenter link is there only once revealed, as a QR without its text", () => {
    expect(presenterShareItems(PRESENTER, false)).toEqual([]);
    const shown = presenterShareItems(PRESENTER, true);
    expect(shown.map((i) => i.url)).toEqual([PRESENTER]);
    expect(shown[0]!.sub).toBeUndefined();
    expect(shown[0]!.note).toContain("control the talk");
  });

  test("without a presenter link (a viewer, a standalone deck) there is no reveal at all", () => {
    const html = renderToStaticMarkup(<PresenterShare open viewerUrl={VIEWER} onClose={() => {}} />);
    expect(html).not.toContain("Drive from your phone");
    expect(presenterShareItems(undefined, true)).toHaveLength(0);
  });
});
