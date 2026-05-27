import type { ReactNode } from "react";
import { motion } from "motion/react";

/** Magic Move for *stateless* content: a persistent element whose className
 *  changes between slides. `layout` FLIP-animates the box delta (spring). For
 *  *stateful* elements (iframe/video/live app), use the engine's <Slot>/Persistent
 *  layer instead — re-rendering content here would not preserve internal state. */
export function Magic({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <motion.div
      layout
      layoutId={id}
      data-magic={id}
      className={className}
      transition={{ type: "spring", stiffness: 200, damping: 26 }}
    >
      {children}
    </motion.div>
  );
}
