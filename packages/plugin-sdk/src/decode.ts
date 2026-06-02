import * as Y from "yjs";
import { instanceStateKey, readPluginInstances, type PluginInstanceEntry } from "./instances";

// Deck-free, browser-free decode of a persisted live session (ADR 0061). The relay
// snapshots the Yjs doc as opaque update bytes; the dashboard reads results back by
// decoding plugin state from those bytes server-side — no deck code runs, just the
// same schema→Y.Map mapping as state.ts, in reverse. The pure plugin derivations
// (tally / rankedQuestions / …) then consume the decoded plain-JS state.

/** Y → plain JS (mirrors state.ts's private `toJS`; nested maps/arrays recurse). */
function toJS(v: unknown): unknown {
  if (v instanceof Y.Array) return v.toArray().map(toJS);
  if (v instanceof Y.Map) {
    const o: Record<string, unknown> = {};
    v.forEach((val, k) => (o[k] = toJS(val)));
    return o;
  }
  return v;
}

/**
 * Decode one plugin instance's state from a Yjs snapshot to plain JS, or null if the
 * slice is empty/absent. Fields not present fall to the plugin's own defaults when the
 * caller validates against its schema — this returns exactly what was in the doc.
 */
export function decodePluginState(
  snapshot: Uint8Array,
  id: string,
  instance = "",
): Record<string, unknown> | null {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, snapshot);
    const root = doc.getMap<unknown>(instanceStateKey(id, instance));
    if (root.size === 0) return null;
    const out: Record<string, unknown> = {};
    root.forEach((val, key) => (out[key] = toJS(val)));
    return out;
  } catch {
    return null;
  } finally {
    doc.destroy();
  }
}

/** Every plugin instance recorded in a snapshot's instance index (ADR 0033), so a
 *  results view can enumerate what to decode without knowing the deck. */
export function decodePluginInstances(snapshot: Uint8Array): PluginInstanceEntry[] {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, snapshot);
    return readPluginInstances(doc);
  } catch {
    return [];
  } finally {
    doc.destroy();
  }
}
