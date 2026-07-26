import { motion } from "motion/react";
import { layoutEase } from "./primitives";

/** Size ramp for the quote body so short punches go big and long quotes stay set. */
function quoteSize(text: string): string {
  const n = text.length;
  if (n <= 60) return "text-[64px]";
  if (n <= 140) return "text-[48px]";
  if (n <= 240) return "text-[38px]";
  return "text-[30px]";
}

/**
 * QuoteSlide: an oversized accent quotation mark, the quote in the display
 * face, and an attribution row. Type scale adapts to the quote length.
 */
export function QuoteSlide({
  quote,
  attribution,
  role,
}: {
  quote: string;
  attribution?: string;
  role?: string;
}) {
  return (
    <div className="flex h-full w-full flex-col justify-center">
      <motion.span
        aria-hidden
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: layoutEase }}
        className="font-heading text-[120px] leading-[0.5] text-accent"
      >
        &ldquo;
      </motion.span>
      <motion.blockquote
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: layoutEase, delay: 0.12 }}
        className={`mt-10 max-w-4xl font-heading ${quoteSize(quote)} break-words font-medium leading-[1.15] tracking-[-0.01em] text-text`}
      >
        {quote}
      </motion.blockquote>
      {(attribution || role) && (
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-10 flex items-center gap-4"
        >
          <span className="h-px w-8 bg-accent" />
          <span className="font-body text-xl text-text">{attribution}</span>
          {role && <span className="font-body text-lg text-muted">{role}</span>}
        </motion.footer>
      )}
    </div>
  );
}
