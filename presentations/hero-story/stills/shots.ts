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
  /** ink on cream, for the page's light section: dark lines, light faces, darker gold */
  paper?: boolean;
  callouts: Callout[];
};


// Props: single objects from the hall for the landing page, cut out of the scene by a
// box and drawn on a transparent ground (written to assets/props/). The box must hold
// whole objects only: a cut through a merged part leaves half shapes and stray lines.
export const PROPS: Still[] = [
  {
    id: "speaker",
    beat: 0,
    width: 420,
    height: 480,
    pos: [7.6, 3.3, -3.3],
    target: [3.45, 1.6, -7.1],
    fov: 25,
    // from just above the stage: the speaker and the lectern stand on nothing drawn
    clip: { min: [2.55, 0.605, -8.3], max: [4.5, 3.4, -6.15] },
    callouts: [],
  },
  {
    id: "laptop",
    beat: 0,
    width: 420,
    height: 300,
    pos: [2.95, 2.8, -8.5],
    target: [3.5, 1.82, -6.72],
    fov: 19,
    // no people: the speaker's resting arm reaches over the lectern. The box holds the
    // lectern's top plate whole, so the laptop and the glass stand on it.
    people: false,
    clip: { min: [3.0, 1.6, -7.2], max: [4.0, 2.3, -6.3] },
    callouts: [],
  },
  {
    id: "poll-screen",
    beat: 1,
    width: 560,
    height: 400,
    pos: [-4.4, 4.1, 1.2],
    target: [0.15, 3.55, -9.6],
    fov: 38,
    // from the screen's lower edge up: the truss legs would end in mid-air
    clip: { min: [-4.7, 1.3, -10.0], max: [4.7, 6.7, -9.3] },
    callouts: [],
  },
  {
    // the stage as one file: the dimension line under its front edge
    id: "stage",
    beat: 5,
    width: 640,
    height: 400,
    pos: [4.2, 5.6, 5.4],
    target: [0.7, 3.0, -8.2],
    fov: 40,
    paper: true,
    // up to the ceiling: the loudspeakers' cables run out of the top of the picture
    clip: { min: [-6.6, 0.02, -10.2], max: [7.5, 7.6, -6.19] },
    callouts: [{ kind: "dim", a: [-6.5, 0.6, -6.2], b: [6.5, 0.6, -6.2], label: "deck.html" }],
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
