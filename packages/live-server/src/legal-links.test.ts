import { describe, expect, test } from "bun:test";
import { injectLegalLinks, legalLinksFrom, reportHref } from "./inject";

const LINKS = { imprint: "https://site.example/impressum", privacy: "https://site.example/datenschutz", report: "https://app.example/forms/abuse" };
const DECK = "<!doctype html><html><head></head><body><main>deck</main></body></html>";

describe("legal links on live pages", () => {
  test("all three http(s) links, or none", () => {
    expect(legalLinksFrom(LINKS)).toEqual({ ...LINKS });
    expect(legalLinksFrom({ ...LINKS, report: undefined })).toBeNull();
    expect(legalLinksFrom({ ...LINKS, imprint: "javascript:alert(1)" })).toBeNull();
    expect(legalLinksFrom({ ...LINKS, privacy: "https://user:pw@site.example/" })).toBeNull();
  });

  test("the report link carries the reported page", () => {
    expect(reportHref(LINKS.report, "https://app.example/live/k7m2")).toBe("https://app.example/forms/abuse?url=https%3A%2F%2Fapp.example%2Flive%2Fk7m2");
    expect(reportHref("https://app.example/forms/abuse?lang=de", "x")).toBe("https://app.example/forms/abuse?lang=de&url=x");
    expect(reportHref(LINKS.report, undefined)).toBe(LINKS.report);
  });

  test("the row goes before the end of the body, in English with German for the browser to pick", () => {
    const html = injectLegalLinks(DECK, { links: LINKS, page: "https://app.example/live/k7m2", role: "viewer", watermark: false });
    expect(html.indexOf('<nav id="lst-legal"')).toBeGreaterThan(html.indexOf("<main>"));
    expect(html.endsWith("</body></html>")).toBe(true);
    expect(html).toContain(">Imprint</a>");
    expect(html).toContain('"de":{"legal":"Rechtliches","imprint":"Impressum","privacy":"Datenschutz","report":"Inhalt melden"');
    expect(html).not.toContain("Published with liebstoeckel");
    expect(html).not.toContain(" hidden>");
  });

  test("free sessions keep the badge in the same pill; the presenter's row waits for the presenter view", () => {
    expect(injectLegalLinks(DECK, { links: LINKS, role: "viewer", watermark: true })).toContain(">Published with liebstoeckel</a>");
    const pres = injectLegalLinks(DECK, { links: LINKS, role: "presenter", watermark: false });
    expect(pres).toContain('aria-label="Legal" hidden>');
    expect(pres).toContain('location.hash!=="#presenter"');
  });
});
