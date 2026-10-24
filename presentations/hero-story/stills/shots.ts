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
  /** the big screen shows the landing page's own slide instead of the deck's */
  screen?: "landing";
  callouts: Callout[];
};


// Props: single objects from the hall for the landing page, cut out of the scene by a
// box and drawn on a transparent ground (written to assets/props/). The box must hold
// whole objects only: a cut through a merged part leaves half shapes and stray lines.
export const PROPS: Still[] = [
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
    // the hero without the deck: the stage, the big screen carrying the page's heading
    id: "hero-stage",
    beat: 0,
    width: 880,
    height: 500,
    pos: [0.9, 2.7, 1.2],
    target: [0.9, 2.9, -9.6],
    fov: 30,
    screen: "landing",
    callouts: [],
  },
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

/** A clip of the hall at work: a slide's scene alive, the camera held still, recorded
 *  frame by frame on a fixed clock (from `from` seconds into the slide, for `seconds`). */
export type Clip = { id: string; beat: number; width: number; height: number; pos: Vec; target: Vec; fov: number; from: number; seconds: number; fps: number };

export const CLIPS: Clip[] = [
  {
    // the room plays tug of war: phones pull in gold and sage, the rope swings on the screen
    id: "tug",
    beat: 3,
    width: 1280,
    height: 720,
    pos: [1.2, 6.2, 8.2],
    target: [0.2, 2.6, -7.6],
    fov: 33,
    from: 4.5,
    seconds: 8,
    fps: 30,
  },
];
