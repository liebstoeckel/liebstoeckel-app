/** Legend — scaffolded via `liebstoeckel add legend`. Owned source: edit freely. */
import { LegendOrdinal, LegendItem, LegendLabel } from "@visx/legend";
import { scaleOrdinal } from "@visx/scale";
import { motion } from "motion/react";
import { useBrandColors } from "./useBrandColors";

export interface LegendEntry {
  label: string;
  color: string;
}

/**
 * Legend — an HTML/React (not SVG) row or column of swatch + label items,
 * meant to sit beside a chart in a slide layout. Built on `@visx/legend`'s
 * `LegendOrdinal` driven by a `scaleOrdinal` mapping labels → colors. Each
 * item fades/slides in, staggered by index. Default items pull from the brand
 * viz palette. Owned source: edit the items, layout, swatch shape, or motion
 * freely — nothing imports this from a package.
 */
export function Legend({
  items,
  direction = "row",
}: {
  items?: LegendEntry[];
  direction?: "row" | "column";
}) {
  const c = useBrandColors();

  const colorOf = (i: number) => c.viz[i % c.viz.length] ?? c.primary;
  const resolved: LegendEntry[] =
    items ??
    DEFAULT_LABELS.map((label, i) => ({ label, color: colorOf(i) }));

  const scale = scaleOrdinal({
    domain: resolved.map((d) => d.label),
    range: resolved.map((d) => d.color),
  });

  return (
    <LegendOrdinal scale={scale}>
      {(labels) => (
        <div
          style={{
            display: "flex",
            flexDirection: direction,
            gap: direction === "row" ? 20 : 10,
            alignItems: direction === "row" ? "center" : "flex-start",
            fontFamily: "var(--brand-font-body)",
          }}
        >
          {labels.map((label, i) => (
            <motion.div
              key={`legend-${label.text}`}
              initial={{ opacity: 0, x: direction === "row" ? 8 : 0, y: direction === "column" ? 8 : 0 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ delay: i * 0.08, type: "spring", stiffness: 160, damping: 18 }}
            >
              <LegendItem alignItems="center">
                <span
                  style={{
                    display: "inline-block",
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    background: label.value,
                    boxShadow: `0 2px 8px ${label.value}33`,
                    flex: "0 0 auto",
                  }}
                />
                <LegendLabel
                  align="left"
                  margin="0 0 0 8px"
                  style={{
                    color: c.text,
                    fontSize: 14,
                    fontFamily: "var(--brand-font-body)",
                  }}
                >
                  <span style={{ color: c.text }}>{label.text}</span>
                </LegendLabel>
              </LegendItem>
            </motion.div>
          ))}
        </div>
      )}
    </LegendOrdinal>
  );
}

const DEFAULT_LABELS = ["Direct", "Organic", "Referral", "Social", "Email"];
