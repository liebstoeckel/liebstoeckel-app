import type { ReactNode } from "react";

// Maps MDX/Markdown elements → themed components. Authors write plain Markdown;
// the look comes from these classes resolved against the active brand tokens.
export const mdxComponents = {
  h1: (p: { children?: ReactNode }) => (
    <h1 className="font-heading text-7xl font-bold tracking-tight text-text" {...p} />
  ),
  h2: (p: { children?: ReactNode }) => (
    <h2 className="font-heading text-4xl font-semibold text-primary" {...p} />
  ),
  p: (p: { children?: ReactNode }) => (
    <p className="font-body text-2xl leading-relaxed text-muted" {...p} />
  ),
  ul: (p: { children?: ReactNode }) => (
    <ul className="mt-4 space-y-3 font-body text-2xl text-text" {...p} />
  ),
  li: (p: { children?: ReactNode }) => (
    <li className="flex gap-3">
      <span className="text-accent">▹</span>
      <span>{p.children}</span>
    </li>
  ),
  strong: (p: { children?: ReactNode }) => <strong className="font-semibold text-accent" {...p} />,
  code: (p: { children?: ReactNode }) => (
    <code className="rounded bg-surface px-2 py-0.5 font-mono text-accent" {...p} />
  ),
};
