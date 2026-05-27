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

/** Horizontal result bar with an animatable fill width (0–100). */
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

export function Stack({ children, gap = "0.6rem", style }: { children?: ReactNode; gap?: string; style?: CSSProperties }) {
  return <div style={{ display: "flex", flexDirection: "column", gap, ...style }}>{children}</div>;
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
