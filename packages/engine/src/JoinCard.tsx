import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useLive } from "./live/Plugin";
import type { AudienceCount } from "./live/protocol";
import { useQrDataUrl } from "./qr";
import { useJoinCardPresence } from "./joinPresence";

/** Links up to this long (without the scheme) are shown in large type; longer ones (a
 *  link with a token in it) are shown in full, small, for copying, and the QR does the
 *  work. */
export const SHORT_LINK_MAX = 48;

/** How a join link reads on screen. A short one loses `https://` and is split before
 *  its last path segment, the part that differs per session (`app.example.com/live/` and
 *  `k7m2x9qp4r`), so the code can be set large; a long one is the whole link. */
export function joinLinkText(url: string): { text: string; short: boolean; prefix: string; code: string } {
  const bare = url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (bare.length > SHORT_LINK_MAX) return { text: url, short: false, prefix: "", code: url };
  const cut = bare.lastIndexOf("/") + 1;
  return { text: bare, short: true, prefix: bare.slice(0, cut), code: bare.slice(cut) };
}

/** Where a join card is shown: on the projected deck (the room sees it) or to the
 *  presenter alone (the presenter view), where the cap may be named. */
export type JoinCardAudience = "room" | "presenter";

/** The count line under the QR. The room sees how many are watching; only the presenter
 *  is told the session is full. Null while the count is unknown. */
export function audienceLine(count: AudienceCount | undefined, shownTo: JoinCardAudience): string | null {
  if (!count) return null;
  const { n, cap } = count;
  if (shownTo === "presenter" && cap !== undefined && n >= cap) return `${n} watching. Full: no one else can join (your plan allows ${cap})`;
  if (n === 0) return "Waiting for people to join";
  return `${n} watching`;
}

/** Whether this count means the session takes no one else (presenters only). */
export const audienceFull = (count: AudienceCount | undefined): boolean =>
  !!count && count.cap !== undefined && count.n >= count.cap;

const noSource = () => () => {};
const nothing = () => undefined;

/** Presenters, live: how many are connected, as the server last said; undefined
 *  elsewhere. Re-renders only the component that reads it. */
export function useAudienceCount(): AudienceCount | undefined {
  const source = useLive()?.audience;
  const get = source?.get ?? nothing;
  return useSyncExternalStore(source?.subscribe ?? noSource, get, get);
}

/** The join card as it renders: the QR of the join link, the link, and the count.
 *  Pure apart from drawing the QR, so its states can be rendered on their own. */
export function JoinCardView({
  url,
  count,
  shownTo = "room",
  size = 280,
  label = "Scan to join",
  qr = true,
}: {
  url: string;
  count?: AudienceCount;
  shownTo?: JoinCardAudience;
  /** QR size in px */
  size?: number;
  label?: string;
  /** draw the QR (false: no QR work, for tests and closed overlays) */
  qr?: boolean;
}) {
  const src = useQrDataUrl(url, qr);
  const link = joinLinkText(url);
  const line = audienceLine(count, shownTo);
  const full = shownTo === "presenter" && audienceFull(count);
  return (
    <div data-join-card className="flex flex-col items-center gap-4 text-center">
      {label && <div className="font-mono text-xs uppercase tracking-[0.3em] text-accent">{label}</div>}
      <div className="overflow-hidden rounded-2xl border border-border shadow-2xl" style={{ width: size, height: size, background: "#fff" }}>
        {src && <img src={src} alt={`QR code for ${link.text}`} width={size} height={size} />}
      </div>
      {link.short ? (
        <div className="flex max-w-full flex-col items-center gap-1" aria-label={link.text}>
          {link.prefix && (
            <div className="break-all text-muted" style={{ fontSize: Math.max(13, Math.round(size * 0.055)) }}>
              {link.prefix}
            </div>
          )}
          <div
            className="break-all font-mono font-semibold text-text"
            style={{ fontSize: Math.max(22, Math.round(size * 0.12)), letterSpacing: "0.06em", lineHeight: 1.1 }}
          >
            {link.code}
          </div>
        </div>
      ) : (
        <div className="max-w-[20rem] break-all font-mono text-[11px] text-muted">{link.text}</div>
      )}
      {line && (
        <div role="status" aria-live="polite" className={`flex items-center gap-2 text-sm ${full ? "text-accent" : "text-muted"}`}>
          <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${count && count.n > 0 ? "bg-accent" : "bg-border"}`} />
          {line}
        </div>
      )}
    </div>
  );
}

/** The space a join card keeps on a slide when there is no live session (a built deck
 *  opened on its own, a thumbnail, a print): the same footprint and a quiet note, so
 *  the slide's layout holds. */
function JoinCardPlaceholder({ size }: { size: number }) {
  return (
    <div data-join-card className="flex flex-col items-center gap-4 text-center">
      <div
        className="flex items-center justify-center rounded-2xl border border-dashed border-border p-6 text-sm text-muted"
        style={{ width: size, height: size }}
      >
        The join code appears here when this deck is presented live.
      </div>
    </div>
  );
}

/**
 * A join card for a slide: the QR of the session's join link, the link, and, on the
 * presenter's screen, how many are watching. Place it on a title or "ask your
 * questions" slide: `<JoinCard />`, or `<JoinCard size={220} />`.
 *
 * Without a live session it keeps its space with a short note; pass `fallback` to show
 * something else (`fallback={null}` shows nothing). A slide that has one also keeps
 * the deck from opening the join overlay on its own at the start of the talk.
 */
export function JoinCard({
  size = 280,
  label = "Scan to join",
  fallback,
}: {
  /** QR size in px (on the 1920x1080 stage) */
  size?: number;
  /** the line above the QR; empty for none */
  label?: string;
  /** what to show without a live session; default a placeholder of the same size */
  fallback?: ReactNode;
}) {
  const live = useLive();
  const count = useAudienceCount();
  const presence = useJoinCardPresence();
  useEffect(() => presence?.(), [presence]);
  const url = live?.live ? live.viewerUrl : undefined;
  if (!url) return fallback !== undefined ? <>{fallback}</> : <JoinCardPlaceholder size={size} />;
  return <JoinCardView url={url} count={count} size={size} label={label} shownTo="room" />;
}

/** The presenter's count of who is watching, as a small pill (the presenter view's
 *  header). Nothing while the count is unknown. `onOpen` opens the share screen. */
export function AudienceCountPill({ onOpen, className = "" }: { onOpen?: () => void; className?: string }) {
  const count = useAudienceCount();
  if (!count) return null;
  const full = audienceFull(count);
  const text = full ? `full, ${count.n} watching` : count.n === 0 ? "no one yet" : `${count.n} watching`;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={full ? `Full: no one else can join (your plan allows ${count.cap})` : "People connected to this talk. Show the join code"}
      aria-label={`${audienceLine(count, "presenter")}. Show the join code`}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] transition hover:border-accent hover:text-accent ${full ? "border-accent text-accent" : "border-border text-muted"} ${className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${count.n > 0 ? "bg-accent" : "bg-border"}`} />
      <span className="tabular-nums">{text}</span>
    </button>
  );
}
