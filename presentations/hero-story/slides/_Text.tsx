import type { ReactNode } from "react";

// The words on each slide. The hall behind them does the showing.
export function Text({
  kicker,
  title,
  children,
  at = "center",
  width = 560,
}: {
  kicker: string;
  title: ReactNode;
  children?: ReactNode;
  at?: "top" | "center" | "bottom";
  width?: number;
}) {
  const place = at === "top" ? "mb-auto" : at === "bottom" ? "mt-auto" : "";
  return (
    <div className={`${place} flex flex-col gap-5`} style={{ maxWidth: width }}>
      <div className="flex items-center gap-3 font-mono text-[13px] uppercase tracking-[0.3em] text-accent">
        <span className="h-px w-7 bg-accent" />
        {kicker}
      </div>
      <h1 className="font-heading text-[64px] font-semibold leading-[0.98] tracking-[-0.03em] text-text" style={{ textWrap: "balance" }}>
        {title}
      </h1>
      {children && <div className="font-body text-[22px] leading-[1.45] text-muted">{children}</div>}
    </div>
  );
}
