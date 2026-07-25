import { test, expect, describe } from "bun:test";
import * as Y from "yjs";
import { renderToStaticMarkup } from "react-dom/server";
import { useLiveDeck, type DeckController } from "./deckIndex.ts";
import { STEP_ALL } from "../delivery.ts";

// The live controller keeps its state in the Yjs doc rather than React state, so
// next/prev/setIndex can be driven for real after a single server render. That
// covers the wiring the pure delivery.ts tests cannot: that each slide change
// actually commits the reveal position the policy asks for.
const COUNT = 3;

function drive(doc: Y.Doc): DeckController {
  let ctrl!: DeckController;
  function Probe() {
    ctrl = useLiveDeck(doc, COUNT, true);
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return ctrl;
}

const read = (doc: Y.Doc) => ({
  index: doc.getMap("deck").get("index") ?? 0,
  step: doc.getMap("deck").get("step") ?? 0,
});

describe("useLiveDeck slide-entry policy", () => {
  test("advancing past the last reveal enters the next slide unrevealed", () => {
    const doc = new Y.Doc();
    const ctrl = drive(doc);
    ctrl.setTotal(2, 0);
    ctrl.setStep(2); // all reveals shown on slide 0
    ctrl.next();
    expect(read(doc)).toEqual({ index: 1, step: 0 });
  });

  test("retreating across a slide boundary lands fully revealed (issue #5)", () => {
    const doc = new Y.Doc();
    const ctrl = drive(doc);
    ctrl.setIndex(2);
    ctrl.setTotal(2, 2);
    ctrl.setStep(0); // slide 2, nothing revealed: the next Prev crosses the boundary
    ctrl.prev();
    expect(read(doc)).toEqual({ index: 1, step: STEP_ALL });
  });

  test("a jump lands unrevealed rather than inheriting the origin step (issue #5)", () => {
    const doc = new Y.Doc();
    const ctrl = drive(doc);
    ctrl.setTotal(3, 0);
    ctrl.setStep(3); // deep into slide 0's reveals
    ctrl.setIndex(2); // overview select / numeric jump
    expect(read(doc)).toEqual({ index: 2, step: 0 });
  });

  test("the sentinel is not resolved against the previous slide's total", () => {
    const doc = new Y.Doc();
    const ctrl = drive(doc);
    ctrl.setIndex(2);
    ctrl.setTotal(5, 2);
    ctrl.setStep(0);
    ctrl.prev(); // -> slide 1, STEP_ALL, but total still describes slide 2
    expect(read(doc)).toEqual({ index: 1, step: STEP_ALL });

    // A second Prev before slide 1 reports its own count must not step to 4
    // (5 - 1, from the stale total). It waits instead.
    ctrl.prev();
    expect(read(doc)).toEqual({ index: 1, step: STEP_ALL });

    // Once slide 1 reports its real count, Prev resolves against that.
    ctrl.setTotal(2, 1);
    ctrl.prev();
    expect(read(doc)).toEqual({ index: 1, step: 1 });
  });

  test("viewers never write", () => {
    const doc = new Y.Doc();
    let ctrl!: DeckController;
    function Probe() {
      ctrl = useLiveDeck(doc, COUNT, false);
      return null;
    }
    renderToStaticMarkup(<Probe />);
    ctrl.next();
    ctrl.prev();
    ctrl.setIndex(2);
    expect(doc.getMap("deck").get("index")).toBeUndefined();
  });
});
