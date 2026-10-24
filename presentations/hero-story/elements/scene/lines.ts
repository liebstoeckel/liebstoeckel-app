// Thin, even lines on low-poly shapes. WebGL draws plain lines one pixel wide
// whatever you ask for, so edges go through three's "fat line" segments, which
// keep a set width in CSS pixels at any resolution. Each shape contributes its
// hard edges (EdgesGeometry drops the edges between coplanar faces), and many
// shapes share one draw call.

import { BackSide, BufferGeometry, Color, EdgesGeometry, Matrix4, ShaderMaterial, UniformsLib, UniformsUtils, Vector2 } from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

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

// Round shapes (the people) have no hard edges to draw, so they get an outline
// instead: their back faces, drawn behind the shape on a copy inflated along its
// smooth normals by as much as a set width in CSS pixels covers at its distance.
// A rim shows around the figure and wherever one part crosses another, like a pen
// line. Inflating in 3D (not pushing each point sideways on screen) keeps the copy
// one closed shell, so no triangle near the rim flips over and drops out. Sized
// like the lines (set `uniforms.resolution` to the shown size) and fading into
// the fog with them.
export function outlineMaterial(color: Color, width: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { color: { value: color }, width: { value: width }, resolution: { value: new Vector2(1280, 720) } }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      #include <clipping_planes_pars_vertex>
      uniform float width;
      uniform vec2 resolution;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        // the size of one CSS pixel at this depth, in view space
        float pixel = 2.0 * -mvPosition.z / (projectionMatrix[1][1] * resolution.y);
        mvPosition.xyz += normalize(normalMatrix * normal) * width * pixel;
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      #include <clipping_planes_pars_fragment>
      uniform vec3 color;
      void main() {
        #include <clipping_planes_fragment>
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    side: BackSide,
    fog: true,
    clipping: true,
  });
}

/** The geometry an outline needs: corners shared, normals averaged across them. */
export function hullOf(geometry: BufferGeometry): BufferGeometry {
  const g = geometry.clone();
  g.deleteAttribute("normal");
  if (g.hasAttribute("uv")) g.deleteAttribute("uv");
  const merged = mergeVertices(g, 1e-4);
  merged.computeVertexNormals();
  return merged;
}
