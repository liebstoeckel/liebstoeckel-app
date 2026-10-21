/** A component several slides share: editing it hot-reloads every slide that uses it. */
export function Kicker({ children }: { children: string }) {
  return (
    <div data-testid="kicker" className="mb-5 flex items-center gap-3 font-mono text-sm uppercase tracking-[0.35em] text-accent">
      <span className="h-px w-8 bg-accent" />
      {children}
    </div>
  );
}
