export type Role = "presenter" | "viewer";

export interface Session {
  id: string;
  presenterToken: string;
  viewerToken: string;
}

const hex = (bytes = 16): string => {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
};

/** Create a session with two unguessable tokens. `gen` is injectable for tests. */
export function createSession(gen: () => string = () => hex()): Session {
  return { id: gen().slice(0, 8), presenterToken: gen(), viewerToken: gen() };
}

/** Resolve a role from a URL token. Unknown/missing → null (deny). */
export function roleForToken(s: Session, token: string | undefined | null): Role | null {
  if (!token) return null;
  if (token === s.presenterToken) return "presenter";
  if (token === s.viewerToken) return "viewer";
  return null;
}

export interface Links {
  presenter: string;
  viewer: string;
}

/** Build the shareable links. `base` is e.g. `http://192.168.1.5:4321`. */
export function buildLinks(base: string, s: Session): Links {
  const b = base.replace(/\/$/, "");
  return {
    presenter: `${b}/?t=${s.presenterToken}`,
    viewer: `${b}/?t=${s.viewerToken}`,
  };
}
