import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LEGAL_MENU_ATTR, LegalLinksRow, legalItems, markLegalMenu, readLegalLinks } from "./legal";
import { liveMessages } from "./messages";
import { MenuLinks, legalMenuLinks } from "../DeckChrome";
import { HelpOverlay } from "../HelpOverlay";
import { PresenterShare } from "../QrOverlay";

// What the relay hands a live page: the host's Impressum, privacy notice and report form,
// the report link already naming the session by its audience link.
const LEGAL = {
  imprint: "https://site.example/impressum",
  privacy: "https://site.example/datenschutz",
  report: "https://app.example/forms/abuse?url=https%3A%2F%2Fapp.example%2Flive%2Fk7m2",
};

describe("legal links from the live bootstrap", () => {
  test("the marker the relay looks for in a deck is the attribute the engine sets", () => {
    // The relay names the same text; a test there pins it too.
    expect(LEGAL_MENU_ATTR).toBe("data-liebstoeckel-legal-menu-v1");
    const set: string[] = [];
    markLegalMenu({ setAttribute: (name: string) => set.push(name) } as unknown as Element);
    expect(set).toEqual([LEGAL_MENU_ATTR]);
  });

  test("all three http(s) links, or none", () => {
    expect(readLegalLinks({ legal: LEGAL })).toEqual(LEGAL);
    expect(readLegalLinks(null)).toBeNull();
    expect(readLegalLinks({})).toBeNull();
    expect(readLegalLinks({ legal: { ...LEGAL, report: undefined } })).toBeNull();
    expect(readLegalLinks({ legal: { ...LEGAL, imprint: "javascript:alert(1)" } })).toBeNull();
    expect(readLegalLinks({ legal: { ...LEGAL, privacy: 7 } })).toBeNull();
  });

  test("the menu's entries: three for the audience, in order, the report link naming the session", () => {
    const links = legalMenuLinks(LEGAL, "viewer", liveMessages("en"));
    expect(links.map((l) => l.label)).toEqual(["Imprint", "Privacy", "Report content"]);
    expect(links[2]!.href).toBe(LEGAL.report);
    expect(legalItems(LEGAL, liveMessages("de")).map((l) => l.label)).toEqual(["Impressum", "Datenschutz", "Inhalt melden"]);
  });

  test("none without data, and none in the presenter's deck window (the room sees it)", () => {
    expect(legalMenuLinks(null, "viewer")).toEqual([]);
    expect(legalMenuLinks(LEGAL, "presenter")).toEqual([]);
  });

  test("the menu rows open a new tab, under their own heading", () => {
    const m = liveMessages("de");
    const html = renderToStaticMarkup(<MenuLinks heading={m.legal} links={legalItems(LEGAL, m)} newTab={m.opensInNewTab} />);
    expect(html).toContain(">Rechtliches<");
    expect(html.match(/target="_blank" rel="noopener noreferrer"/g)).toHaveLength(3);
    expect(html).toContain(`href="${LEGAL.report.replace(/&/g, "&amp;")}"`);
    expect(html).toContain("öffnet in neuem Tab");
    expect(renderToStaticMarkup(<MenuLinks heading="Legal" links={[]} newTab="" />)).toBe("");
  });

  test("the help overlay carries the links at its foot when the page has them", () => {
    const html = renderToStaticMarkup(<HelpOverlay open onClose={() => {}} role="viewer" legal={LEGAL} />);
    expect(html).toContain('href="https://site.example/impressum"');
    expect(html).toContain("data-pi-legal");
    expect(renderToStaticMarkup(<HelpOverlay open onClose={() => {}} role="viewer" />)).not.toContain("data-pi-legal");
  });

  test("the presenter view's share screen carries them too", () => {
    const html = renderToStaticMarkup(
      <PresenterShare open viewerUrl="https://live.example/s/abc?t=V" presenterUrl="https://live.example/s/abc?t=P.sig" legal={LEGAL} onClose={() => {}} />,
    );
    expect(html).toContain('href="https://site.example/datenschutz"');
    expect(html).not.toContain("t=P.sig");
    expect(renderToStaticMarkup(<LegalLinksRow links={LEGAL} />).match(/<a /g)).toHaveLength(3);
  });
});
