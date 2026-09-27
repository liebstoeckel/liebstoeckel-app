import { test, expect, describe } from "bun:test";
import * as Y from "yjs";
import { detectLive } from "./detect";
import { getParticipantId, withoutParticipant } from "./participant";
import { mergeUi } from "./ui";
import { getDeckIndex, setDeckIndex } from "./deckIndex";

describe("detectLive", () => {
  test("reads the injected global, null otherwise", () => {
    const g = globalThis as { __LIEBSTOECKEL_LIVE__?: unknown };
    expect(detectLive()).toBeNull();
    g.__LIEBSTOECKEL_LIVE__ = { ws: "ws://x/sync?t=1", session: "s", role: "viewer", token: "1" };
    expect(detectLive()?.role).toBe("viewer");
    delete g.__LIEBSTOECKEL_LIVE__;
  });
});

describe("getParticipantId", () => {
  test("generates once and persists in storage", () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    const a = getParticipantId(store);
    const b = getParticipantId(store);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(10);
  });

  const memStore = () => {
    const m = new Map<string, string>();
    return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  // storage in an opaque-origin sandbox: every access throws
  const deniedStore = {
    getItem: (): string | null => {
      throw new Error("Access is denied");
    },
    setItem: (): void => {
      throw new Error("Access is denied");
    },
  };
  const urlSlot = (href: string) => {
    const slot = { href, writes: 0, read: () => slot.href, write: (h: string) => void ((slot.href = h), slot.writes++) };
    return slot;
  };

  test("a URL-supplied id is used verbatim and the URL is left alone", () => {
    const url = urlSlot("https://relay.example/s/abc?t=tok&pid=viewer-1234#presenter");
    expect(getParticipantId(memStore(), url)).toBe("viewer-1234");
    expect(getParticipantId(deniedStore, url)).toBe("viewer-1234");
    expect(url.writes).toBe(0);
  });

  test("the URL id wins over the one in storage", () => {
    const store = memStore();
    store.m.set("liebstoeckel:pid", "stored-id-0001");
    expect(getParticipantId(store, urlSlot("https://h/s/x?pid=from-url-0001"))).toBe("from-url-0001");
  });

  test("without a URL id or usable storage, a fresh id is minted into the URL and survives a reload", () => {
    const url = urlSlot("https://relay.example/s/abc?t=tok#presenter");
    const first = getParticipantId(deniedStore, url);
    expect(url.writes).toBe(1);
    const written = new URL(url.href);
    expect(written.searchParams.get("pid")).toBe(first);
    expect(written.searchParams.get("t")).toBe("tok"); // the grant survives
    expect(written.hash).toBe("#presenter"); // so does the view selector
    // a reload reads the same URL: same id, no second write
    expect(getParticipantId(deniedStore, url)).toBe(first);
    expect(url.writes).toBe(1);
  });

  test("with working storage a minted id stays out of the URL", () => {
    const url = urlSlot("http://192.168.1.5:3000/?t=tok");
    const store = memStore();
    const id = getParticipantId(store, url);
    expect(url.writes).toBe(0);
    expect(url.href).toBe("http://192.168.1.5:3000/?t=tok");
    expect(getParticipantId(store, url)).toBe(id);
  });

  test("a malformed URL id is ignored", () => {
    for (const bad of ["short", "has space here", "<script>alert(1)</script>", "x".repeat(65)]) {
      const url = urlSlot(`https://h/s/x?pid=${encodeURIComponent(bad)}`);
      const id = getParticipantId(deniedStore, url);
      expect(id).not.toBe(bad);
      expect(new URL(url.href).searchParams.get("pid")).toBe(id);
    }
  });

  test("a URL that can't be rewritten still yields an ephemeral id", () => {
    const url = {
      read: () => "https://h/s/x?t=tok",
      write: () => {
        throw new Error("SecurityError");
      },
    };
    expect(getParticipantId(deniedStore, url).length).toBeGreaterThan(10);
  });
});

describe("withoutParticipant", () => {
  test("drops only the participant id from a query string", () => {
    expect(withoutParticipant("?t=tok&pid=abc12345")).toBe("?t=tok");
    expect(withoutParticipant("?pid=abc12345")).toBe("");
    expect(withoutParticipant("?t=tok")).toBe("?t=tok");
    expect(withoutParticipant("")).toBe("");
  });
});

describe("mergeUi", () => {
  const A = () => null;
  const B = () => null;
  test("overrides win, others kept", () => {
    expect(mergeUi({ Bar: A, Row: A }, { Bar: B })).toEqual({ Bar: B, Row: A });
    expect(mergeUi({ Bar: A })).toEqual({ Bar: A });
  });
});

describe("deck index over shared doc", () => {
  test("propagates presenter→viewer", () => {
    const pres = new Y.Doc();
    const view = new Y.Doc();
    setDeckIndex(pres, 3);
    Y.applyUpdate(view, Y.encodeStateAsUpdate(pres));
    expect(getDeckIndex(view)).toBe(3);
    expect(getDeckIndex(new Y.Doc())).toBe(0); // default
  });
});
