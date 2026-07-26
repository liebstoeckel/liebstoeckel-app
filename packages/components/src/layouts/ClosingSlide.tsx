import { motion } from "motion/react";
import { SlideHeading, headingSize, layoutEase } from "./primitives";

/**
 * ClosingSlide: the sign-off. A large thanks or call to action with optional
 * contact and link lines on an accent rule.
 */
export function ClosingSlide({
  title,
  subtitle,
  contact,
  url,
}: {
  title: string;
  subtitle?: string;
  contact?: string;
  url?: string;
}) {
  return (
    <div className="flex h-full w-full flex-col justify-center">
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.7, ease: layoutEase }}
        className="mb-8 h-px w-24 origin-left bg-accent"
      />
      <SlideHeading sizeClass={headingSize(title, "hero")}>{title}</SlideHeading>
      {subtitle && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-8 max-w-2xl break-words font-body text-2xl leading-relaxed text-muted"
        >
          {subtitle}
        </motion.p>
      )}
      {(contact || url) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: layoutEase, delay: 0.5 }}
          className="mt-14 flex items-center gap-4 font-mono text-sm uppercase tracking-[0.2em] text-accent"
        >
          {contact && <span>{contact}</span>}
          {contact && url && <span className="h-1 w-1 rounded-full bg-accent" />}
          {url && <span>{url}</span>}
        </motion.div>
      )}
    </div>
  );
}
