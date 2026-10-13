import { test, expect } from "bun:test";
import { linkWithToken } from "./links";

test("a presenter link is built from the page's token, not from the address bar", () => {
  // After the cookie exchange the address bar has no `t`, only the tab's participant id.
  expect(linkWithToken("https://live.example/s/abc?pid=p-123#presenter", "G.sig")).toBe("https://live.example/s/abc?t=G.sig");
});

test("a stale t in the URL is replaced, other params stay, the participant id goes", () => {
  expect(linkWithToken("https://live.example/s/abc?t=old&x=1&pid=p-123", "new")).toBe("https://live.example/s/abc?t=new&x=1");
});

test("without a token (a standalone deck) the query is kept minus the participant id", () => {
  expect(linkWithToken("file:///deck.html?pid=p-123")).toBe("file:///deck.html");
  expect(linkWithToken("http://localhost:3000/?a=1&pid=p-123")).toBe("http://localhost:3000/?a=1");
});
