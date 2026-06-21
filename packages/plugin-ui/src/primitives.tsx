import type { CSSProperties, ReactNode } from "react";

// Primitives style against brand CSS variables directly (var(--brand-*)), so they
// inherit the active brand under [data-brand] without depending on Tailwind class
// generation for node_modules. Authors can still override via className/style.

const v = (name: string, fallback: string) => `var(--brand-${name}, ${fallback})`;

export function Card({ children, style, className }: { children?: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div
      className={className}
      style={{
        background: `color-mix(in srgb, ${v("surface", "#11141b")} 60%, transparent)`,
        border: `1px solid ${v("border", "#222734")}`,
        borderRadius: "1rem",
        padding: "1.5rem",
        color: v("text", "#f3f1ea"),
        fontFamily: v("font-body", "sans-serif"),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  active = false,
  disabled = false,
  style,
}: {
  children?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-active={active}
      style={{
        appearance: "none",
        cursor: disabled ? "default" : "pointer",
        width: "100%",
        textAlign: "left",
        padding: "0.85rem 1.1rem",
        borderRadius: "0.7rem",
        border: `1px solid ${active ? v("primary", "#caff4d") : v("border", "#222734")}`,
        background: active ? v("primary", "#caff4d") : "transparent",
        color: active ? v("on-primary", "#08090c") : v("text", "#f3f1ea"),
        fontFamily: v("font-body", "sans-serif"),
        fontSize: "1.1rem",
        fontWeight: active ? 600 : 400,
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.15s ease",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Horizontal result bar with an animatable fill width (0-100). */
export function Bar({
  pct,
  color,
  label,
  value,
  highlight = false,
}: {
  pct: number;
  color?: string;
  label: ReactNode;
  value?: ReactNode;
  highlight?: boolean;
}) {
  const fill = color ?? v("accent", "#62e8ff");
  return (
    <div style={{ marginBottom: "0.8rem", fontFamily: v("font-body", "sans-serif") }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem", color: v("text", "#f3f1ea") }}>
        <span style={{ fontWeight: highlight ? 700 : 400 }}>{label}</span>
        <span style={{ fontFamily: v("font-mono", "monospace"), color: v("muted", "#8b93a7") }}>{value}</span>
      </div>
      <div style={{ height: "0.7rem", borderRadius: "999px", background: `color-mix(in srgb, ${v("border", "#222734")} 60%, transparent)`, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${Math.max(0, Math.min(100, pct))}%`,
            background: fill,
            borderRadius: "999px",
            transition: "width 0.5s cubic-bezier(0.22,1,0.36,1)",
            boxShadow: highlight ? `0 0 12px ${fill}` : undefined,
          }}
        />
      </div>
    </div>
  );
}

/** A round chrome-rail button matching the deck's help affordance (1.75rem, brand
 *  border, muted→accent, fades in on hover). The default look for a plugin's global
 *  `Control`, but it imposes nothing: pass any `children` / `style` to restyle. */
export function ChromeButton({
  children,
  onClick,
  active = false,
  title,
  ariaLabel,
  style,
}: {
  children?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  title?: string;
  ariaLabel?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      data-active={active}
      style={{
        appearance: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "1.75rem",
        width: "1.75rem",
        borderRadius: "999px",
        border: `1px solid ${active ? v("accent", "#62e8ff") : v("border", "#222734")}`,
        background: "transparent",
        color: active ? v("accent", "#62e8ff") : v("muted", "#8b93a7"),
        fontFamily: v("font-mono", "monospace"),
        fontSize: "0.85rem",
        lineHeight: 1,
        opacity: active ? 1 : 0.7,
        transition: "all 0.15s ease",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Stack({ children, gap = "0.6rem", style }: { children?: ReactNode; gap?: string; style?: CSSProperties }) {
  return <div style={{ display: "flex", flexDirection: "column", gap, ...style }}>{children}</div>;
}

/** A bounded, internally-scrolling region. The inline slide canvas is a fixed
 *  1280×720 surface with `overflow:hidden` ((internal ADR)) and never scrolls, so a
 *  plugin whose content grows without bound (a Q&A queue, a chat, any feed) must
 *  cap its own height and scroll inside it, pin the header/input, wrap the growing
 *  list in a ScrollArea. On mobile the breakout sheet already scrolls; this gives
 *  the inline/desktop path the same boundary. `maxHeight` accepts any CSS length
 *  (default a stage-relative cap that leaves room for surrounding chrome). */
export function ScrollArea({
  children,
  maxHeight = "min(360px, 42vh)",
  style,
  className,
}: {
  children?: ReactNode;
  maxHeight?: string;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        maxHeight,
        overflowY: "auto",
        // a hair of inline padding so a scrollbar doesn't crowd content
        paddingRight: "0.15rem",
        // momentum scroll on touch + don't chain the scroll to the deck/page
        overscrollBehavior: "contain",
        WebkitOverflowScrolling: "touch",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children?: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: v("font-mono", "monospace"),
        fontSize: "0.7rem",
        letterSpacing: "0.25em",
        textTransform: "uppercase",
        color: v("accent", "#62e8ff"),
        marginBottom: "0.75rem",
      }}
    >
      {children}
    </div>
  );
}
