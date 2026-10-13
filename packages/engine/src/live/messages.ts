import { browserLocale, defineMessages, type Locale } from "@liebstoeckel/plugin-sdk/messages";

// What the engine says to people in a live session, in English and German. The German
// never addresses the reader (no "du", no "Sie"), so it fits a team meeting and a
// conference hall alike.

export const liveMessages = defineMessages({
  en: {
    connecting: "Connecting",
    reconnecting: "Reconnecting",
    sending: "Sending",
    offline: "Offline. What you send goes out once the connection is back.",
    outdated: "Out of date, reload",
    outdatedMessage: "This page is out of date. Reload it to reconnect.",
    endedPill: "Talk ended",
    endedTitle: "The talk has ended",
    endedBody: "Thanks for joining.",
    endedBack: "Back to the slides",
    endedPanel: "The talk has ended",
    fullTitle: "This session is full",
    fullBody: "It has room for no more people right now. Follow along on the main screen, or try again in a moment.",
    tryAgain: "Try again",
    tapToInteract: "tap to interact",
    tapToInteractLabel: (label: string) => `${label}, tap to interact`,
    rotate: "Rotate for a bigger view",
    close: "Close",
  },
  de: {
    connecting: "Verbindung wird hergestellt",
    reconnecting: "Verbindung wird wiederhergestellt",
    sending: "Wird gesendet",
    offline: "Offline. Eingaben werden gesendet, sobald wieder Verbindung besteht.",
    outdated: "Veraltet, neu laden",
    outdatedMessage: "Diese Seite ist veraltet. Zum erneuten Verbinden neu laden.",
    endedPill: "Vortrag beendet",
    endedTitle: "Der Vortrag ist beendet",
    endedBody: "Danke fürs Mitmachen.",
    endedBack: "Zurück zu den Folien",
    endedPanel: "Der Vortrag ist beendet",
    fullTitle: "Diese Sitzung ist voll",
    fullBody: "Gerade ist kein Platz frei. Auf dem Hauptbildschirm mitverfolgen oder gleich erneut versuchen.",
    tryAgain: "Erneut versuchen",
    tapToInteract: "zum Mitmachen tippen",
    tapToInteractLabel: (label: string) => `${label}, zum Mitmachen tippen`,
    rotate: "Für eine größere Ansicht drehen",
    close: "Schließen",
  },
});

export type LiveMessages = ReturnType<typeof liveMessages>;

let cached: Locale | undefined;

/** The language of this page's live chrome: `?lang=en|de`, else the browser's
 *  languages, else English. Read once per page. */
export function pageLocale(): Locale {
  cached ??= browserLocale();
  return cached;
}

/** The live chrome's messages in this page's language. */
export function msgs(): LiveMessages {
  return liveMessages(pageLocale());
}
