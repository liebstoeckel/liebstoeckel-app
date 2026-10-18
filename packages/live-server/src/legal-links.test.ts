import { describe, expect, test } from "bun:test";
import { LEGAL_MENU_ATTR, LEGAL_MENU_WAIT_MS, injectLegalLinks, legalForPage, legalLinksFrom, readsLegalMenu, reportHref } from "./inject";

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

  test("the marker an engine with the legal menu carries, the same text the engine sets", () => {
    // The engine sets this attribute; a test there pins the same text.
    expect(LEGAL_MENU_ATTR).toBe("data-liebstoeckel-legal-menu-v1");
    expect(readsLegalMenu(`<script>document.documentElement.setAttribute("${LEGAL_MENU_ATTR}","")</script>`)).toBe(true);
    expect(readsLegalMenu(DECK)).toBe(false);
  });

  test("the bootstrap's links: the report link names the page", () => {
    expect(legalForPage(LINKS, "https://app.example/live/k7m2")).toEqual({
      imprint: LINKS.imprint,
      privacy: LINKS.privacy,
      report: "https://app.example/forms/abuse?url=https%3A%2F%2Fapp.example%2Flive%2Fk7m2",
    });
  });

  test("an engine with the menu: the row holds the badge and keeps the links back, showing them only if the engine never marks the page", () => {
    const free = injectLegalLinks(DECK, { links: LINKS, page: "p", role: "viewer", watermark: true, menu: true });
    expect(free).toContain('<nav id="lst-legal" lang="en" aria-label="Legal" class="lst-menu lst-wait">');
    expect(free).toContain(">Published with liebstoeckel</a>");
    // The links are still in the row, hidden while waiting and for good once marked.
    expect(free).toContain(">Imprint</a>");
    expect(free).toContain(`#lst-legal.lst-wait .lst-legal,html[${LEGAL_MENU_ATTR}] #lst-legal .lst-legal{display:none!important}`);
    expect(free).toContain(`setTimeout(function(){r.classList.remove("lst-wait")},${LEGAL_MENU_WAIT_MS})`);
    // White-label: nothing to show at all while the engine has the links.
    const paid = injectLegalLinks(DECK, { links: LINKS, page: "p", role: "viewer", watermark: false, menu: true });
    expect(paid).toContain('class="lst-menu lst-wait lst-nobadge"');
    expect(paid).toContain(`#lst-legal.lst-wait.lst-nobadge,html[${LEGAL_MENU_ATTR}] #lst-legal.lst-nobadge{display:none}`);
    expect(paid).not.toContain("Published with liebstoeckel");
    // An older engine: the row as before, no waiting.
    const old = injectLegalLinks(DECK, { links: LINKS, page: "p", role: "viewer", watermark: false });
    expect(old).toContain('<nav id="lst-legal" lang="en" aria-label="Legal">');
    expect(old).not.toContain("lst-wait");
    expect(old).not.toContain("setTimeout");
  });
});
