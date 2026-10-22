// Thin, even lines on low-poly shapes. WebGL draws plain lines one pixel wide
// whatever you ask for, so edges go through three's "fat line" segments, which
// keep a set width in CSS pixels at any resolution. Each shape contributes its
// hard edges (EdgesGeometry drops the edges between coplanar faces), and many
// shapes share one draw call.

import { BufferGeometry, Color, EdgesGeometry, Matrix4 } from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";

export class EdgeBatch {
  readonly positions: number[] = [];
  readonly colors: number[] = [];

  /** Adds a shape's hard edges; returns the range of segments it took. */
  addEdges(geometry: BufferGeometry, matrix: Matrix4, color: Color, thresholdDeg = 24): [number, number] {
    const edges = new EdgesGeometry(geometry, thresholdDeg);
    edges.applyMatrix4(matrix);
    const p = edges.getAttribute("position");
    const start = this.positions.length / 6;
    for (let i = 0; i < p.count; i++) {
      this.positions.push(p.getX(i), p.getY(i), p.getZ(i));
      this.colors.push(color.r, color.g, color.b);
    }
    edges.dispose();
    return [start, this.positions.length / 6];
  }

  /** Adds raw segments: a flat list of x, y, z pairs. */
  addSegments(points: number[], color: Color): [number, number] {
    const start = this.positions.length / 6;
    for (let i = 0; i < points.length; i += 3) {
      this.positions.push(points[i]!, points[i + 1]!, points[i + 2]!);
      this.colors.push(color.r, color.g, color.b);
    }
    return [start, this.positions.length / 6];
  }

  build(material: LineMaterial): LineSegments2 {
    const g = new LineSegmentsGeometry();
    g.setPositions(this.positions);
    g.setColors(this.colors);
    const lines = new LineSegments2(g, material);
    lines.computeLineDistances();
    return lines;
  }
}

export function lineMaterial(width: number, opts: { dashed?: boolean; dashSize?: number; gapSize?: number } = {}): LineMaterial {
  const m = new LineMaterial({
    linewidth: width,
    vertexColors: true,
    dashed: opts.dashed ?? false,
    dashSize: opts.dashSize ?? 0.2,
    gapSize: opts.gapSize ?? 0.14,
    worldUnits: false,
  });
  m.fog = true;
  return m;
}

/** Recolors segments [start, end) of a batch-built line object in place. */
export function recolor(lines: LineSegments2, range: [number, number], color: Color): void {
  const attr = lines.geometry.getAttribute("instanceColorStart") as unknown as { data: { array: Float32Array; needsUpdate: boolean } };
  const arr = attr.data.array;
  for (let s = range[0]; s < range[1]; s++) {
    const o = s * 6;
    arr[o] = color.r; arr[o + 1] = color.g; arr[o + 2] = color.b;
    arr[o + 3] = color.r; arr[o + 4] = color.g; arr[o + 5] = color.b;
  }
  attr.data.needsUpdate = true;
}
