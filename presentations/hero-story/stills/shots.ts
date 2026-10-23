// Still pictures of the hall for places where the deck itself does not run (the
// landing page on phones, tablets and with reduced motion). Each still has its
// own camera: the deck's slide shots are 16:9 with the room pushed aside for the
// words, while these are portrait (or, for the empty hall, wide) and carry no
// words of their own. The hall is in the slide's end state, life is off and the
// clock reads 10:10, so a rerun draws the same pictures.

export type Vec = [number, number, number];

/** Where a callout's leader line starts: a point in the hall, or a named spot. */
export type Anchor =
  | { phoneNear: Vec } // the phone of the seat closest to this point
  | { screen: [number, number] } // a point on the big screen, 0..1 (u right, v down)
  | { at: Vec };

export type Callout =
  | { kind: "box"; body: string; anchor: Anchor; x: number; y: number }
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
  /** what flies through the hall at the moment of the picture */
  flight?: "votes" | "upvotes" | "pulls";
  /** the question card, part way up from its seat */
  card?: boolean;
  /** the lamps over the stage are on, with light on the stage */
  lights?: boolean;
  /** this seat's phone shows the poll on its own screen (seen over a shoulder) */
  pollOn?: Vec;
  callouts: Callout[];
};

const PORTRAIT = { width: 440, height: 550 };

export const STILLS: Still[] = [
  {
    id: "room",
    beat: 0,
    ...PORTRAIT,
    pos: [5.4, 10.8, 13.2],
    target: [0.2, 1.6, -3.9],
    fov: 44,
    callouts: [{ kind: "box", body: "join", anchor: { phoneNear: [2.4, 1.2, 3.4] }, x: 232, y: 330 }],
  },
  {
    id: "poll",
    beat: 1,
    ...PORTRAIT,
    pos: [1.32, 2.0, 2.0],
    target: [-2.63, -1.42, -6.45],
    fov: 74,
    flight: "votes",
    pollOn: [1.14, 1.74, 1.79],
    callouts: [],
  },
  {
    id: "questions",
    beat: 2,
    ...PORTRAIT,
    pos: [0.9, 3.3, 3.0],
    target: [-0.5, 2.6, -6.0],
    fov: 50,
    card: true,
    flight: "upvotes",
    callouts: [],
  },
  {
    id: "plugin",
    beat: 3,
    ...PORTRAIT,
    pos: [0, 8.2, 10.8],
    target: [0, 2.2, -4.6],
    fov: 50,
    flight: "pulls",
    callouts: [{ kind: "box", body: "agent", anchor: { screen: [0.5, 0.6] }, x: 24, y: 24 }],
  },
  {
    id: "together",
    beat: 4,
    ...PORTRAIT,
    pos: [0.2, 3.3, 4.4],
    target: [0.2, 1.0, -9.6],
    fov: 48,
    callouts: [
      { kind: "box", body: "web", anchor: { screen: [0.45, 0.345] }, x: 16, y: 250 },
      { kind: "box", body: "bot", anchor: { screen: [0.94, 0.398] }, x: 256, y: 290 },
      { kind: "box", body: "dev", anchor: { screen: [0.2, 0.835] }, x: 16, y: 412 },
    ],
  },
  {
    id: "file",
    beat: 5,
    ...PORTRAIT,
    pos: [10.5, 30, 9.0],
    target: [0.8, 0.4, -2.8],
    fov: 38,
    callouts: [
      { kind: "dim", a: [-6.5, 0.6, -6.2], b: [6.5, 0.6, -6.2], label: "deck.html" },
      { kind: "label", anchor: { at: [-5.7, 2.2, -6.9] }, x: 24, y: 120, lines: ["Lovage", "German: Liebstöckel"] },
    ],
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
