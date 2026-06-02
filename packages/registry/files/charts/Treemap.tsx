/** Treemap — scaffolded via `liebstoeckel add treemap`. Owned source: edit data, palette, motion freely. */
import { useMemo } from "react";
import { motion } from "motion/react";
import { Treemap, hierarchy, treemapSquarify } from "@visx/hierarchy";
import { Group } from "@visx/group";
import { useBrandColors } from "./useBrandColors";

export interface TreemapNode {
  /** Category / node name. */
  name: string;
  /** Leaf value; omit on internal nodes (derived from children). */
  value?: number;
  /** Optional nested children. */
  children?: TreemapNode[];
}

const DEFAULT_DATA: TreemapNode = {
  name: "Spend",
  children: [
    {
      name: "Compute",
      children: [
        { name: "GPU", value: 320 },
        { name: "CPU", value: 180 },
      ],
    },
    { name: "Storage", value: 210 },
    { name: "Network", value: 140 },
    { name: "Observability", value: 96 },
    { name: "Other", value: 58 },
  ],
};

/**
 * TreemapChart — a squarified treemap of a small hierarchy.
 *
 * Leaf rectangles are sized by value and colored from the brand viz palette by
 * index; each scales/fades in on a stagger. Labels are placed inside rects and
 * skipped on tiny tiles. Owned source: edit the data, palette, or motion freely.
 */
export function TreemapChart({
  data = DEFAULT_DATA,
  width = 560,
  height = 360,
}: {
  data?: TreemapNode;
  width?: number;
  height?: number;
}) {
  const c = useBrandColors();
  const m = { top: 8, right: 8, bottom: 8, left: 8 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;

  const root = useMemo(
    () =>
      hierarchy<TreemapNode>(data)
        .sum((d) => d.value ?? 0)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0)),
    [data],
  );

  const colorOf = (i: number) => c.viz[i % c.viz.length] ?? c.primary;

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`Treemap of ${root.leaves().length} categories sized by value`}
    >
      <Treemap<TreemapNode>
        root={root}
        size={[iw, ih]}
        tile={treemapSquarify}
        round
        paddingInner={3}
      >
        {(tree) => (
          <Group left={m.left} top={m.top}>
            {tree.leaves().map((node, i) => {
              const w = Math.max(0, node.x1 - node.x0);
              const h = Math.max(0, node.y1 - node.y0);
              const fill = colorOf(i);
              const showLabel = w > 54 && h > 30;
              const label = node.data.name;
              const value = node.value ?? 0;
              return (
                <g key={`leaf-${label}-${i}`} transform={`translate(${node.x0}, ${node.y0})`}>
                <motion.g
                  style={{ transformOrigin: `${w / 2}px ${h / 2}px` }}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.08, type: "spring", stiffness: 150, damping: 18 }}
                >
                  <rect
                    width={w}
                    height={h}
                    rx={6}
                    fill={fill}
                    style={{ filter: `drop-shadow(0 4px 16px ${fill}33)` }}
                  />
                  {showLabel && (
                    <>
                      <text
                        x={10}
                        y={22}
                        fill={c.surface}
                        fontFamily="var(--brand-font-body)"
                        fontSize={13}
                        fontWeight={600}
                      >
                        {label}
                      </text>
                      <text
                        x={10}
                        y={40}
                        fill={c.surface}
                        fontFamily="var(--brand-font-mono)"
                        fontSize={12}
                        opacity={0.85}
                      >
                        {value}
                      </text>
                    </>
                  )}
                </motion.g>
                </g>
              );
            })}
          </Group>
        )}
      </Treemap>
    </svg>
  );
}
