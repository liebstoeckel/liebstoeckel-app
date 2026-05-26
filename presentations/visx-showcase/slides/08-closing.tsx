import { motion } from "motion/react";
import { Kicker } from "../ui";

export const notes = (
  <div>
    <p>Close with the <strong>one-liner</strong>: presentations that are real software.</p>
    <ul>
      <li>Reset the timer before you walk off (button up top).</li>
      <li>Offer the repo / a live link; the deck itself is the artifact.</li>
    </ul>
  </div>
);

const code = [
  [{ t: "import", c: "kw" }, { t: " { Present }", c: "tx" }],
  [{ t: "  from", c: "kw" }, { t: ' "@liebstoeckel/engine"', c: "str" }],
  [],
  [{ t: "<Present", c: "tag" }],
  [{ t: "  brands", c: "attr" }, { t: "={[", c: "tx" }, { t: '"nocturne"', c: "str" }, { t: "]}", c: "tx" }],
  [{ t: "  slides", c: "attr" }, { t: "={[title, stats, area, …]}", c: "tx" }],
  [{ t: "/>", c: "tag" }],
];
const palette: Record<string, string> = {
  kw: "var(--brand-accent2)",
  str: "var(--brand-primary)",
  tag: "var(--brand-accent)",
  attr: "#b692ff",
  tx: "var(--brand-text)",
};

export default function Closing() {
  return (
    <div className="flex h-full w-full items-center gap-16">
      <div className="flex-1">
        <Kicker>Fin</Kicker>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="font-heading text-[88px] font-semibold leading-[0.95] tracking-[-0.03em] text-text"
          style={{ fontVariationSettings: '"opsz" 144' }}
        >
          Make your
          <br />
          data <span className="italic text-primary">move</span>.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="mt-7 max-w-md font-body text-xl text-muted"
        >
          Presentations that are real software — versioned, interactive, and shipped as a single file.
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="w-[480px] shrink-0 overflow-hidden rounded-2xl border border-border bg-[#0c0e14] shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <span className="h-3 w-3 rounded-full bg-accent2/70" />
          <span className="h-3 w-3 rounded-full bg-primary/60" />
          <span className="h-3 w-3 rounded-full bg-accent/60" />
          <span className="ml-3 font-mono text-xs text-muted">main.tsx</span>
        </div>
        <pre className="overflow-x-auto p-6 font-mono text-[13px] leading-7">
          {code.map((line, i) => (
            <div key={i}>
              <span className="mr-4 select-none text-muted/40">{String(i + 1).padStart(2, " ")}</span>
              {line.map((tok, j) => (
                <span key={j} style={{ color: palette[tok.c] }}>
                  {tok.t}
                </span>
              ))}
              {line.length === 0 ? " " : null}
            </div>
          ))}
        </pre>
      </motion.div>
    </div>
  );
}
