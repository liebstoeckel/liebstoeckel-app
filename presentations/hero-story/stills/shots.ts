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
  /** false: no glass of water on the lectern */
  glass?: boolean;
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
    // the phone hero: slide 1's hall, from slide 1's camera, without its words
    id: "hall",
    beat: 0,
    width: 440,
    height: 480,
    pos: [12.8, 8.8, 13.8],
    target: [0.4, 1.9, -3.4],
    fov: 36,
    callouts: [],
  },
  {
    // opens the install section: over the speaker's shoulder, the laptop and the room
    id: "band-install",
    beat: 0,
    width: 1200,
    height: 360,
    pos: [2.1, 3.0, -9.45],
    target: [3.9, 1.8, -5.6],
    fov: 20,
    glass: false,
    callouts: [],
  },
  {
    // opens "Polls are the floor": from the rows, the poll on the big screen
    id: "band-polls",
    beat: 1,
    width: 1200,
    height: 360,
    pos: [0.7, 3.0, 5.2],
    target: [0.1, 3.25, -9.6],
    fov: 24,
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
