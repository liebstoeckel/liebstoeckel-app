import type { ReactNode } from "react";

// The words on each slide, placed into the empty part of that slide's shot
// (x, y in stage pixels). The hall behind them does the showing.
export function Text({
  kicker,
  badge,
  title,
  children,
  x = 96,
  y = 72,
  width = 520,
  size = 64,
}: {
  kicker: string;
  /** a short marker beside the kicker, e.g. for something not out yet (its right
   *  padding is a little smaller: the letter spacing trails the last letter) */
  badge?: string;
  title: ReactNode;
  children?: ReactNode;
  x?: number;
  y?: number;
  width?: number;
  size?: number;
}) {
  return (
    <div className="absolute flex flex-col gap-5" style={{ left: x, top: y, width }}>
      <div className="flex items-center gap-3 font-mono text-[13px] uppercase tracking-[0.3em] text-accent">
        <span className="h-px w-7 bg-accent" />
        {kicker}
        {badge && (
          <span className="ml-2 rounded-full border border-accent/50 py-0.5 pl-2.5 pr-2 text-[11px] tracking-[0.18em] text-accent">
            {badge}
          </span>
        )}
      </div>
      <h1
        className="font-heading font-semibold tracking-[-0.03em] text-text"
        style={{ fontSize: size, lineHeight: 0.98, textWrap: "balance" }}
      >
        {title}
      </h1>
      {children && <div className="font-body text-[22px] leading-[1.45] text-muted">{children}</div>}
    </div>
  );
}
