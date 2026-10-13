import { createContext, useContext } from "react";

/** Lets a `<JoinCard />` on a slide tell the deck it is on screen: the function marks
 *  one card as mounted and returns the function that unmarks it. The deck then does
 *  not open its own join overlay over a slide that already shows the join card. */
export const JoinCardPresence = createContext<(() => () => void) | null>(null);

export const useJoinCardPresence = () => useContext(JoinCardPresence);
