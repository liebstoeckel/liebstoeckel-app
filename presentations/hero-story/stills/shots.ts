// Pictures of the hall for the landing page: the empty hall for its closing
// section, and props (single objects cut out of the hall) for the sections between.
// Each has its own camera; none carries words of its own. The hall is in the
// slide's end state, life is off and the clock reads 10:10, so a rerun draws the
// same pictures.

export type Vec = [number, number, number];

/** Where a callout's leader line starts: a point in the hall, or a named spot. */
export type Anchor =
  | { phoneNear: Vec } // the phone of the seat closest to this point
  | { screen: [number, number] } // a point on the big screen, 0..1 (u right, v down)
  | { at: Vec };

export type Callout =
  | { kind: "dim"; a: Vec; b: Vec; label: string }
  | { kind: "label"; anchor: Anchor; x: number; y: number; lines: [string, string] };

export type Still = {
  id: string;
  /** the slide whose state the hall is in */
  beat: number;
  /** the picture's size in CSS pixels (rendered at twice that) */
  width: number;
  height: number;
  pos: Vec;
  target: Vec;
  /** vertical field of view, degrees */
  fov: number;
  /** false: the empty hall, before anyone arrives */
  people?: boolean;
  /** the lamps over the stage are on, with light on the stage */
  lights?: boolean;
  /** a prop: only what is inside this box is drawn, on a transparent ground */
  clip?: { min: Vec; max: Vec };
  callouts: Callout[];
};


// Props: single objects from the hall for the landing page's sections, cut out of
// the scene by a box and drawn on a transparent ground (written to assets/props/).
export const PROPS: Still[] = [
  {
    id: "speaker",
    beat: 0,
    width: 420,
    height: 480,
    pos: [7.6, 3.3, -3.3],
    target: [3.45, 1.6, -7.1],
    fov: 25,
    clip: { min: [2.55, 0.55, -8.3], max: [4.5, 3.4, -6.15] },
    callouts: [],
  },
  {
    id: "laptop",
    beat: 0,
    width: 420,
    height: 320,
    pos: [3.0, 2.75, -8.45],
    target: [3.52, 1.72, -6.62],
    fov: 30,
    clip: { min: [2.95, 1.7, -7.0], max: [4.05, 2.25, -6.2] },
    callouts: [],
  },
  {
    id: "poll-screen",
    beat: 1,
    width: 560,
    height: 380,
    pos: [-4.2, 3.9, -0.6],
    target: [0.2, 3.5, -9.6],
    fov: 40,
    clip: { min: [-4.7, 0.55, -10.0], max: [4.7, 6.7, -9.3] },
    callouts: [],
  },
  {
    id: "model",
    beat: 5,
    width: 560,
    height: 460,
    pos: [10.5, 30, 9.0],
    target: [0.4, 0.4, -1.4],
    fov: 40,
    clip: { min: [-9.2, -0.1, -11.4], max: [9.2, 7.6, 9.2] },
    callouts: [],
  },
];

export const STILLS: Still[] = [
  {
    id: "empty-hall",
    beat: 0,
    width: 880,
    height: 440,
    pos: [-3.2, 7.2, 13.6],
    target: [0.8, 2.3, -5.0],
    fov: 36,
    people: false,
    lights: true,
    callouts: [],
  },
];
