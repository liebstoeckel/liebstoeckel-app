// A live session through a relay, the way the room meets it: a presenter on a
// laptop and phones joining, for the release QA (README "Release fixture"):
//
//   bun packages/release-tests/scripts/release-live.ts <relay-url> <account-token> <deck.html> --live-slide <n> [--join-slide <n>] [--legal] [--applause]
//
// Creates a session with an audience cap of 2 and write enforcement on, then checks:
// phones join and the count shows, a vote, a question and a reaction reach the
// presenter, a vote sent offline goes out once back online, a third and a fourth
// phone get the "full" card (English and German), the legal links in the phone menu
// (present with --legal, absent without), the deck's own applause plugin (--applause),
// and the "ended" card on every phone (English and German) after the talk ends.
// With --old (a deck built before 0.4) the states that deck does not have (offline,
// full and ended cards, German) are only screenshotted, not checked.
// One browser, several contexts. Prints a JSON report; exit 1 on a failure.
import { readFileSync } from "node:fs";
import { chromium, devices, type BrowserContext, type Page } from "playwright-core";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const opt = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const [relay, token, html] = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--live-slide", "--join-slide"].includes(argv[i - 1]!)));
const liveSlide = Number(opt("--live-slide") ?? 0);
const joinSlide = Number(opt("--join-slide") ?? 0);
if (!relay || !token || !html || !liveSlide) {
  console.error("usage: release-live.ts <relay-url> <account-token> <deck.html> --live-slide <n> [--join-slide <n>] [--legal] [--applause]");
  process.exit(2);
}

const results: Array<{ check: string; ok: boolean; note?: string }> = [];
const check = async (name: string, fn: () => Promise<string | null | void>) => {
  try {
    const problem = await fn();
    results.push({ check: name, ok: !problem, ...(problem ? { note: problem } : {}) });
  } catch (err) {
    results.push({ check: name, ok: false, note: (err as Error).message.split("\n")[0] });
  }
};
const text = (p: Page) => p.evaluate(() => document.body.innerText);
// innerText carries CSS text-transform ("1 VOTE"), so every match ignores case.
const waitText = async (p: Page, s: string | RegExp, ms = 15_000) => {
  const src = typeof s === "string" ? s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : s.source;
  try {
    await p.waitForFunction((re) => new RegExp(re, "i").test(document.body.innerText), src, { timeout: ms, polling: 100 });
  } catch {
    const seen = (await text(p).catch(() => "")).replace(/\s+/g, " ").slice(0, 400);
    throw new Error(`no ${JSON.stringify(src)} within ${ms} ms; the page shows: ${seen}`);
  }
};

const res = await fetch(`${relay.replace(/\/$/, "")}/api/sessions`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "text/html", "x-live-enforce": "1", "x-audience-cap": "2" },
  body: readFileSync(html, "utf8"),
});
if (!res.ok) {
  console.error(`session: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const s = (await res.json()) as { id: string; urls: { presenter: string; viewer: string } };

// LIEBSTOECKEL_CHROMIUM: a Chrome or Chromium binary (e.g. a CI runner's); else Playwright's own.
const browser = await chromium.launch({ executablePath: process.env.LIEBSTOECKEL_CHROMIUM || undefined, args: ["--no-sandbox", "--disable-gpu"] });
const errors: string[] = [];
const contexts: BrowserContext[] = [];
async function open(url: string, kind: "laptop" | "phone", locale = "en-US"): Promise<Page> {
  const ctx = await browser.newContext(kind === "phone" ? { ...devices["iPhone 13"], locale } : { viewport: { width: 1280, height: 800 }, locale });
  contexts.push(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${kind} ${locale}: ${e.message}`));
  await page.goto(url);
  return page;
}
const go = async (p: Page, n: number) => {
  for (const d of String(n)) await p.keyboard.press(d);
  await p.keyboard.press("Enter");
  await p.waitForTimeout(800);
  // Engines before 0.4 have no number jump: --live-slide last takes End instead.
  if (flag("--old")) {
    await p.keyboard.press("End");
    await p.waitForTimeout(800);
  }
};

const presenter = await open(s.urls.presenter, "laptop");
await presenter.waitForSelector("[data-deck-root]", { timeout: 60_000 });
await go(presenter, liveSlide);
const en = await open(s.urls.viewer, "phone", "en-US");
const de = await open(s.urls.viewer, "phone", "de-DE");

await check("phones see the live slide", async () => {
  await waitText(en, "Ship 0.4?", 20_000);
  await waitText(de, "Ship 0.4?", 20_000);
});
if (joinSlide) {
  await check("the presenter sees the count", async () => {
    await go(presenter, joinSlide);
    await waitText(presenter, /2 watching/, 15_000);
    await go(presenter, liveSlide);
  });
} else results.push({ check: "the presenter sees the count", ok: true, note: "not checked: the deck has no join slide" });
// A 0.3 phone shows the plugins behind a glow: a tap opens one in a sheet.
const closeSheet = async (p: Page) => {
  const close = p.getByRole("button", { name: /^Close$/ });
  if (await close.count()) await close.last().click().catch(() => {});
  await p.waitForTimeout(500);
};
const openSheet = async (p: Page, label: RegExp) => {
  if (!flag("--old")) return;
  await closeSheet(p);
  await p.getByRole("button", { name: label }).first().dispatchEvent("click");
  await p.waitForTimeout(800);
};
await check("a vote reaches the presenter", async () => {
  await openSheet(en, /poll.*tap to interact/i);
  await en.getByRole("button", { name: /^Yes/ }).last().click();
  if (!flag("--old")) await waitText(en, "Vote received: Yes");
  // 0.3 said "1 votes"
  await waitText(presenter, flag("--old") ? /1 votes?\b/ : /1 vote\b/);
});
await check("a question reaches the presenter", async () => {
  const box = de.locator("textarea, input[type=text], input:not([type])").first();
  await box.fill("Kommt 0.4 heute?");
  await box.press("Enter");
  await waitText(presenter, "Kommt 0.4 heute?");
});
await check("a reaction reaches the presenter", async () => {
  const claps = () => presenter.evaluate(() => (document.body.innerHTML.match(/👏/g) ?? []).length);
  const before = await claps();
  await openSheet(en, /react.*tap to interact/i);
  if (flag("--old")) await en.getByRole("button", { name: "👏" }).first().dispatchEvent("click");
  else await en.getByRole("button", { name: "React: Applause" }).last().click();
  await presenter.waitForFunction((n) => (document.body.innerHTML.match(/👏/g) ?? []).length > n, before, { timeout: 15_000 });
});
const old = flag("--old");
if (!old) await check("a vote sent offline goes out once back online (German)", async () => {
  // A phone that loses its network: the browser says so ("offline"), the page holds the vote.
  await de.context().setOffline(true);
  await de.evaluate(() => window.dispatchEvent(new Event("offline")));
  await de.getByRole("button", { name: /^Not yet/ }).first().click();
  await waitText(de, "Stimme wird gesendet: Not yet");
  await waitText(de, "Offline. Eingaben werden gesendet");
  await de.screenshot({ path: `${html}.offline-de.png` });
  await de.context().setOffline(false);
  await de.evaluate(() => window.dispatchEvent(new Event("online")));
  await waitText(de, "Stimme angekommen: Not yet", 30_000);
  await waitText(presenter, /2 votes/, 20_000);
});
if (!old) await check("a vote into a silently dead connection still arrives (English)", async () => {
  // No offline event: the socket just stops carrying anything, as in a lift. The
  // client notices the silence, reconnects and sends what the presenter lacks.
  await en.context().setOffline(true);
  await en.getByRole("button", { name: /^Not yet/ }).first().click();
  await en.waitForTimeout(3000);
  await en.context().setOffline(false);
  await waitText(presenter, /Not yet\s*2\s*·\s*100%/, 90_000);
  await waitText(en, "Vote received: Not yet", 30_000);
});
if (flag("--applause")) {
  await check("the deck's own plugin takes audience input through the relay", async () => {
    await en.getByRole("button", { name: "Clap" }).first().click();
    await waitText(presenter, /1 claps/);
  });
}
if (flag("--old")) {
  await closeSheet(en);
  // A 0.3 deck has no menu entry: the relay adds its own legal row to the page.
  await check(flag("--legal") ? "the relay's legal row is on the page" : "no legal row on the page", async () => {
    const has = await en.evaluate(() => !!document.querySelector("#lst-legal:not([hidden])"));
    return has === flag("--legal") ? null : `legal row ${has ? "present" : "absent"}`;
  });
} else await check(flag("--legal") ? "the phone menu has the legal links" : "the phone menu has no legal links", async () => {
  await en.getByRole("button", { name: "Menu" }).first().click();
  await en.waitForTimeout(800);
  const t = await text(en);
  const has = /Imprint/.test(t) && /Privacy/.test(t) && /Report content/.test(t);
  await en.keyboard.press("Escape");
  const close = en.getByRole("button", { name: "Close" }).first();
  if (await close.count()) await close.click().catch(() => {});
  return has === flag("--legal") ? null : `legal links ${has ? "present" : "absent"}`;
});
await check(old ? "a third phone (screenshot only: a 0.3 deck has no full card)" : "a third and fourth phone see the full card (English, German)", async () => {
  const full3 = await open(s.urls.viewer, "phone", "en-US");
  const full4 = await open(s.urls.viewer, "phone", "de-DE");
  if (old) {
    await full3.waitForTimeout(8000);
    const t = await text(full3);
    await full3.screenshot({ path: `${html}.full-en.png` });
    return /Vote received|Ship 0\.4\?[\s\S]*Yes/.test(t) && !/full/i.test(t) ? null : null;
  }
  await waitText(full3, "This session is full", 20_000);
  await waitText(full4, "Diese Sitzung ist voll", 20_000);
  await full3.screenshot({ path: `${html}.full-en.png` });
  await full4.screenshot({ path: `${html}.full-de.png` });
});
await en.screenshot({ path: `${html}.phone-en.png` });
await de.screenshot({ path: `${html}.phone-de.png` });
await presenter.screenshot({ path: `${html}.presenter.png` });
await check("the end of the talk shows the ended card (English, German)", async () => {
  const del = await fetch(`${relay.replace(/\/$/, "")}/api/sessions/${s.id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
  if (!del.ok) return `end: ${del.status}`;
  if (old) {
    await en.waitForTimeout(8000);
    await en.screenshot({ path: `${html}.ended-en.png` });
    return null;
  }
  await waitText(en, "The talk has ended", 30_000);
  await waitText(de, "Der Vortrag ist beendet", 30_000);
  await en.screenshot({ path: `${html}.ended-en.png` });
  await de.screenshot({ path: `${html}.ended-de.png` });
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ ok: failed.length === 0, session: s.id, results, pageErrors: errors }, null, 2));
process.exit(failed.length ? 1 : 0);
