import { describe, expect, test } from "bun:test";
import { defineMessages, isLocale, pickLocale } from "./messages";

describe("pickLocale", () => {
  test("a browser's language list, first supported wins", () => {
    expect(pickLocale(["de-DE", "en-US"])).toBe("de");
    expect(pickLocale(["fr-FR", "de-AT", "en"])).toBe("de");
    expect(pickLocale(["en-GB", "de"])).toBe("en");
  });

  test("nothing supported, nothing given: English", () => {
    expect(pickLocale(["fr", "it"])).toBe("en");
    expect(pickLocale([])).toBe("en");
    expect(pickLocale(undefined)).toBe("en");
    expect(pickLocale("")).toBe("en");
  });

  test("an Accept-Language header honours q-values and drops q=0", () => {
    expect(pickLocale("de-DE,de;q=0.9,en;q=0.8")).toBe("de");
    expect(pickLocale("en;q=0.4, de;q=0.7")).toBe("de");
    expect(pickLocale("de;q=0, en")).toBe("en");
    expect(pickLocale("fr-CH, fr;q=0.9, *;q=0.5")).toBe("en");
  });

  test("an override wins when it names a supported language", () => {
    expect(pickLocale(["en"], "de")).toBe("de");
    expect(pickLocale("de", "EN")).toBe("en");
    expect(pickLocale(["de"], "fr")).toBe("de");
    expect(pickLocale(["de"], "")).toBe("de");
  });

  test("isLocale is exact", () => {
    expect(isLocale("de")).toBe(true);
    expect(isLocale("DE")).toBe(false);
    expect(isLocale("de-AT")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("defineMessages", () => {
  const msg = defineMessages({
    en: { hello: "Hello", vote: (x: string) => `Vote: ${x}` },
    de: { hello: "Hallo", vote: (x: string) => `Stimme: ${x}` },
  });

  test("looks up by language, English as the fallback", () => {
    expect(msg("de").hello).toBe("Hallo");
    expect(msg("de").vote("Blau")).toBe("Stimme: Blau");
    expect(msg("en").vote("Blue")).toBe("Vote: Blue");
    expect(msg(undefined).hello).toBe("Hello");
    expect(msg("xx" as never).hello).toBe("Hello");
  });

  test("every language must carry every key (a type error otherwise)", () => {
    // @ts-expect-error: `de` is missing `vote`
    defineMessages({ en: { hello: "Hello", vote: "Vote" }, de: { hello: "Hallo" } });
  });
});
