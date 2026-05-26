import { useMemo, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { keySteps } from "./code/diff";
import type { TokenizedStep } from "./code/types";
import { useRevealState } from "./steps";

// Shiki FontStyle bitfield → CSS.
function styleOf(color?: string, fontStyle?: number): CSSProperties {
  return {
    color,
    fontStyle: fontStyle && fontStyle & 1 ? "italic" : undefined,
    fontWeight: fontStyle && fontStyle & 2 ? 700 : undefined,
    textDecoration: fontStyle && fontStyle & 4 ? "underline" : undefined,
  };
}

/** Animated code that morphs between states. Each state is pre-tokenized at build
 *  time (see the `code` macro). Consecutive states are line-diffed so unchanged
 *  lines keep identity and FLIP to their new position while edits fade in/out. The
 *  deck's reveal steps drive which state shows (via `useRevealState`); in a static
 *  render (thumbnail/standalone) it shows the final state. */
export function CodeMagic({
  steps,
  title,
  lang,
}: {
  steps: TokenizedStep[];
  title?: string;
  lang?: string;
}) {
  const keyed = useMemo(() => keySteps(steps), [steps]);
  const state = useRevealState(steps.length);
  const active = keyed[Math.max(0, Math.min(keyed.length - 1, state))] ?? { lines: [] };
  const language = lang ?? steps[0]?.lang;

  return (
    <div className="pi-code" data-code>
      <div className="pi-code-bar">
        <span className="pi-code-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        {title && <span className="pi-code-title">{title}</span>}
        {language && <span className="pi-code-lang">{language}</span>}
      </div>
      <pre className="pi-codemagic">
        <code>
          <AnimatePresence mode="popLayout" initial={false}>
            {active.lines.map((line) => (
              <motion.div
                key={line.key}
                layout
                className="pi-code-line"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ type: "spring", stiffness: 320, damping: 34 }}
              >
                {line.tokens.length === 0 ? (
                  <span>{" "}</span>
                ) : (
                  line.tokens.map((tok, i) => (
                    <span key={i} style={styleOf(tok.color, tok.fontStyle)}>
                      {tok.content}
                    </span>
                  ))
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </code>
      </pre>
    </div>
  );
}
