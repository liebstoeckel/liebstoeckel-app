import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LiveStatusBadge, ViewerStateCard, liveStatusLabel, refusingText } from "./status";
import { liveMessages } from "./messages";

describe("liveStatusLabel", () => {
  test("presenters see every state but connected", () => {
    for (const status of ["connecting", "reconnecting", "ended", "outdated"] as const) {
      expect(liveStatusLabel({ status }, "presenter")).toBe(status);
    }
    expect(liveStatusLabel({ status: "connected" }, "presenter")).toBeNull();
    expect(liveStatusLabel(undefined, "presenter")).toBeNull();
  });

  test("the audience sees what does not fix itself at once", () => {
    expect(liveStatusLabel({ status: "ended" }, "viewer")).toBe("ended");
    expect(liveStatusLabel({ status: "full" }, "viewer")).toBe("full");
    expect(liveStatusLabel({ status: "outdated" }, "viewer")).toBe("outdated");
  });

  test("a viewer's reconnect shows only once it has lasted a while", () => {
    expect(liveStatusLabel({ status: "reconnecting" }, "viewer")).toBeNull();
    expect(liveStatusLabel({ status: "connecting" }, "viewer")).toBeNull();
    expect(liveStatusLabel({ status: "reconnecting" }, "viewer", { longDown: true })).toBe("reconnecting");
    expect(liveStatusLabel({ status: "connecting" }, "viewer", { longDown: true })).toBe("connecting");
  });

  test("offline shows at once, for everyone, until the talk ends", () => {
    for (const role of ["viewer", "presenter"]) {
      expect(liveStatusLabel({ status: "connected" }, role, { online: false })).toBe("offline");
      expect(liveStatusLabel({ status: "reconnecting" }, role, { online: false })).toBe("offline");
    }
    expect(liveStatusLabel({ status: "ended" }, "viewer", { online: false })).toBe("ended");
    expect(liveStatusLabel({ status: "connected" }, "viewer", { online: true })).toBeNull();
  });

  test("everyone sees the sending hint, until the talk ends", () => {
    for (const role of ["viewer", "presenter"]) {
      expect(liveStatusLabel({ status: "reconnecting", sending: true }, role)).toBe("sending");
      expect(liveStatusLabel({ status: "connected", sending: true }, role)).toBe("sending");
    }
    expect(liveStatusLabel({ status: "ended", sending: true }, "viewer")).toBe("ended");
    expect(liveStatusLabel({ status: "connected", sending: undefined }, "viewer")).toBeNull();
  });
});

describe("live messages", () => {
  test("English and German carry the same keys", () => {
    expect(Object.keys(liveMessages("de")).sort()).toEqual(Object.keys(liveMessages("en")).sort());
    expect(liveMessages("de").fullTitle).toBe("Diese Sitzung ist voll");
    expect(liveMessages("en").endedTitle).toBe("The talk has ended");
  });

  test("the German never addresses the reader", () => {
    const de = liveMessages("de");
    for (const v of Object.values(de)) {
      const text = typeof v === "function" ? v("X") : v;
      expect(text).not.toMatch(/\b(du|dich|dein|deine|Sie|Ihr|Ihre|Ihnen)\b/);
    }
  });
});

describe("refusingText (presenter banner)", () => {
  test("plain words per reason, only while connected", () => {
    expect(refusingText({ status: "connected", refusing: "full" })).toContain("this session is full");
    expect(refusingText({ status: "connected", refusing: "busy" })).toContain("the live server is busy");
    expect(refusingText({ status: "connected" })).toBeNull();
    expect(refusingText({ status: "reconnecting", refusing: "full" })).toBeNull();
    expect(refusingText(undefined)).toBeNull();
  });
});

describe("ViewerStateCard", () => {
  test("full: says so and offers to try again; ended: thanks and back to the slides", () => {
    const full = renderToStaticMarkup(<ViewerStateCard state="full" />);
    expect(full).toContain("This session is full");
    expect(full).toContain("Try again");
    expect(full).toContain('data-live-card="full"');
    const ended = renderToStaticMarkup(<ViewerStateCard state="ended" />);
    expect(ended).toContain("The talk has ended");
    expect(ended).toContain("Thanks for joining.");
    expect(ended).toContain("Back to the slides");
  });

  test("the status pill words for offline", () => {
    const html = renderToStaticMarkup(<LiveStatusBadge state={{ status: "connected" }} role="viewer" online={false} />);
    expect(html).toContain("Offline. What you send goes out once the connection is back.");
    expect(renderToStaticMarkup(<LiveStatusBadge state={{ status: "reconnecting" }} role="viewer" />)).toBe("");
  });
});
