import { useEffect, useMemo, type CSSProperties } from "react";
import { detectLive, type LiveInfo } from "./detect";
import { msgs } from "./messages";

// The operator's legal links on a hosted live page: the Impressum, the privacy notice and
// the form to report the deck. The relay hands them over in the live bootstrap; the deck
// shows them in its own menu (the touch menu, the help overlay on desktop, the presenter's
// share screen), within two clicks of every live page, and draws nothing over the slide.
// A relay that sees this engine in a deck holds back its own row of links, and shows it
// after all if the page never gets the attribute below, so a page that fails to start
// still links them.

/** Set on the root element once the deck shows the legal links itself. The relay looks
 *  for this text in a deck to know its engine does that; the suffix changes with the
 *  shape of the bootstrap's `legal` field. */
export const LEGAL_MENU_ATTR = "data-liebstoeckel-legal-menu-v1";

export interface LegalLinks {
  imprint: string;
  privacy: string;
  /** the report form, with the session's audience link already filled in */
  report: string;
}

const httpLink = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
};

/** The legal links the live bootstrap carries, or null when there are none (standalone,
 *  a relay without them) or one is not an http(s) link. */
export function readLegalLinks(live: Pick<LiveInfo, "legal"> | null = detectLive()): LegalLinks | null {
  const l = live?.legal;
  if (!l || typeof l !== "object") return null;
  const imprint = httpLink(l.imprint);
  const privacy = httpLink(l.privacy);
  const report = httpLink(l.report);
  return imprint && privacy && report ? { imprint, privacy, report } : null;
}

/** Tell the relay's row that this page shows the links itself. */
export function markLegalMenu(root: Element | null = typeof document === "undefined" ? null : document.documentElement): void {
  root?.setAttribute(LEGAL_MENU_ATTR, "");
}

/** The page's legal links, marking the page once a surface that offers them is up
 *  (`offered`: e.g. the presenter view only once its share screen can open). */
export function useLegalLinks(offered = true): LegalLinks | null {
  const links = useMemo(() => readLegalLinks(), []);
  useEffect(() => {
    if (links && offered) markLegalMenu();
  }, [links, offered]);
  return links;
}

export interface LegalItem {
  key: "imprint" | "privacy" | "report";
  label: string;
  href: string;
}

/** The three entries in their order, labelled in the page's language. */
export function legalItems(links: LegalLinks, m = msgs()): LegalItem[] {
  return [
    { key: "imprint", label: m.imprint, href: links.imprint },
    { key: "privacy", label: m.privacy, href: links.privacy },
    { key: "report", label: m.report, href: links.report },
  ];
}

/** A small line of the three links (help overlay, presenter share screen). Each opens a
 *  new tab, so the talk stays where it is. */
export function LegalLinksRow({ links, className, style }: { links: LegalLinks; className?: string; style?: CSSProperties }) {
  const m = msgs();
  return (
    <nav aria-label={m.legal} data-pi-legal className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-1 ${className ?? ""}`} style={style}>
      {legalItems(links, m).map((it) => (
        <a
          key={it.key}
          href={it.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted underline decoration-muted/40 underline-offset-2 transition hover:text-text hover:decoration-text"
        >
          {it.label}
          <span className="sr-only"> ({m.opensInNewTab})</span>
        </a>
      ))}
    </nav>
  );
}
