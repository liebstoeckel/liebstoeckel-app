import index from "./index.html";

// Dev server with frontend HMR + React Fast Refresh.
const server = Bun.serve({
  routes: { "/": index },
  development: { hmr: true, console: true },
  hostname: "0.0.0.0",
  port: 3000,
});

console.log(`▶  http://localhost:${server.port}`);
