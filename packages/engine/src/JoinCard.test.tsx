import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import * as Y from "yjs";
import { JoinCard, JoinCardView, audienceLine, joinLinkText, SHORT_LINK_MAX } from "./JoinCard";
import { QrOverlay, PresenterShare } from "./QrOverlay";
import { LiveProvider, type LiveContextValue } from "./live/Plugin";
import { shouldOpenJoinAtStart } from "./joinStart";
import { parseNotice } from "./live/protocol";

const JOIN = "https://app.example.com/live/k7m2x9qp4r";

describe("the join card's states", () => {
  const view = (count?: { n: number; cap?: number }, shownTo: "room" | "presenter" = "room") =>
    renderToStaticMarkup(<JoinCardView url={JOIN} count={count} shownTo={shownTo} qr={false} />);

  test("0 joined: waiting, the link split into host and code", () => {
    const html = view({ n: 0, cap: 30 });
    expect(html).toContain("Waiting for people to join");
    expect(html).toContain("app.example.com/live/");
    expect(html).toContain(">k7m2x9qp4r<");
    expect(html).not.toContain("https://");
  });

  test("many: how many are watching", () => {
    expect(view({ n: 1 })).toContain("1 watching");
    expect(view({ n: 142, cap: 500 })).toContain("142 watching");
  });

  test("at the cap: the presenter is told it is full, the room is not", () => {
    expect(view({ n: 30, cap: 30 }, "presenter")).toContain("Full: no one else can join (your plan allows 30)");
    const room = view({ n: 30, cap: 30 }, "room");
    expect(room).toContain("30 watching");
    expect(room).not.toContain("Full");
    expect(room).not.toContain("plan");
  });

  test("an unknown count shows no count line", () => {
    expect(view(undefined)).not.toContain("watching");
    expect(view(undefined)).not.toContain("Waiting");
  });

  test("audienceLine", () => {
    expect(audienceLine(undefined, "presenter")).toBeNull();
    expect(audienceLine({ n: 0 }, "presenter")).toBe("Waiting for people to join");
    expect(audienceLine({ n: 31, cap: 30 }, "presenter")).toContain("Full");
    expect(audienceLine({ n: 29, cap: 30 }, "presenter")).toBe("29 watching");
  });
});

describe("joinLinkText", () => {
  test("a short link loses its scheme and is split before the code", () => {
    expect(joinLinkText(JOIN)).toEqual({ text: "app.example.com/live/k7m2x9qp4r", short: true, prefix: "app.example.com/live/", code: "k7m2x9qp4r" });
  });

  test("a long link (a token in it) is shown whole", () => {
    const long = `http://192.168.1.20:4321/?t=${"a".repeat(32)}`;
    expect(long.length).toBeGreaterThan(SHORT_LINK_MAX);
    expect(joinLinkText(long)).toMatchObject({ text: long, short: false });
  });
});

describe("<JoinCard /> on a slide", () => {
  const ctx = (over: Partial<LiveContextValue>): LiveContextValue => ({
    live: true,
    role: "presenter",
    participant: "p",
    doc: new Y.Doc(),
    theme: {} as LiveContextValue["theme"],
    plugins: {},
    ...over,
  });

  test("live: the join link, and the count the presenter hears", () => {
    const audience = { get: () => ({ n: 12, cap: 30 }), subscribe: () => () => {} };
    const html = renderToStaticMarkup(
      <LiveProvider value={ctx({ viewerUrl: JOIN, audience })}>
        <JoinCard />
      </LiveProvider>,
    );
    expect(html).toContain("k7m2x9qp4r");
    expect(html).toContain("12 watching");
  });

  test("a viewer sees the link without a count", () => {
    const html = renderToStaticMarkup(
      <LiveProvider value={ctx({ role: "viewer", viewerUrl: JOIN })}>
        <JoinCard />
      </LiveProvider>,
    );
    expect(html).toContain("k7m2x9qp4r");
    expect(html).not.toContain("watching");
  });

  test("no live session: a placeholder of the same size, or the fallback", () => {
    const standalone = renderToStaticMarkup(<JoinCard size={200} />);
    expect(standalone).toContain("appears here when this deck is presented live");
    expect(standalone).toContain("width:200px");
    expect(renderToStaticMarkup(<JoinCard fallback={<p>offline</p>} />)).toBe("<p>offline</p>");
    expect(renderToStaticMarkup(<JoinCard fallback={null} />)).toBe("");
  });
});

describe("the overlays use the join card", () => {
  test("the deck's overlay: the join card, the count without the cap, a start hint when it opened by itself", () => {
    const html = renderToStaticMarkup(
      <QrOverlay open url={JOIN} count={{ n: 30, cap: 30 }} hint="press → or tap anywhere to start" onClose={() => {}} />,
    );
    expect(html).toContain("k7m2x9qp4r");
    expect(html).toContain("30 watching");
    expect(html).not.toContain("Full");
    expect(html).toContain("press → or tap anywhere to start");
  });

  test("the presenter's share screen names the cap", () => {
    const html = renderToStaticMarkup(<PresenterShare open viewerUrl={JOIN} count={{ n: 30, cap: 30 }} onClose={() => {}} />);
    expect(html).toContain("Full: no one else can join");
  });
});

describe("when the deck opens the join overlay by itself", () => {
  const at = { role: "presenter", joinUrl: JOIN, index: 0, joinCardsOnScreen: 0, coarsePointer: false };
  test("the presenter's deck on the first slide", () => {
    expect(shouldOpenJoinAtStart(at)).toBe(true);
  });
  test("not for a viewer, mid-talk, with a card on the slide, on a phone, or without a link", () => {
    expect(shouldOpenJoinAtStart({ ...at, role: "viewer" })).toBe(false);
    expect(shouldOpenJoinAtStart({ ...at, index: 3 })).toBe(false);
    expect(shouldOpenJoinAtStart({ ...at, joinCardsOnScreen: 1 })).toBe(false);
    expect(shouldOpenJoinAtStart({ ...at, coarsePointer: true })).toBe(false);
    expect(shouldOpenJoinAtStart({ ...at, joinUrl: undefined })).toBe(false);
  });
});

describe("the audience notice", () => {
  test("is read with and without a cap; anything malformed is ignored", () => {
    expect(parseNotice(JSON.stringify({ t: "audience", n: 3, cap: 30 }))).toEqual({ t: "audience", n: 3, cap: 30 });
    expect(parseNotice(JSON.stringify({ t: "audience", n: 0 }))).toEqual({ t: "audience", n: 0 });
    expect(parseNotice(JSON.stringify({ t: "audience", n: -1 }))).toBeNull();
    expect(parseNotice(JSON.stringify({ t: "audience", n: "3" }))).toBeNull();
    expect(parseNotice(JSON.stringify({ t: "audience", n: 3, cap: 0 }))).toEqual({ t: "audience", n: 3 });
  });
});
