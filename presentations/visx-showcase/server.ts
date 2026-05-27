import index from "./index.html";

const server = Bun.serve({
  routes: { "/": index },
  development: { hmr: true, console: true },
  hostname: "0.0.0.0",
  port: 3001,
});

console.log(`▶  http://localhost:${server.port}`);
