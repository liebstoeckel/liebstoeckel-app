import index from "./index.html";

// Dev server with frontend HMR + React Fast Refresh. Bound to 0.0.0.0 so it's
// reachable across the container bridge. Port 3002 so it can run alongside the
// demo (3000) and showcase (3001) decks.
const server = Bun.serve({
  routes: { "/": index },
  development: { hmr: true, console: true },
  hostname: "0.0.0.0",
  port: 3002,
});

console.log(`▶  http://localhost:${server.port}`);
