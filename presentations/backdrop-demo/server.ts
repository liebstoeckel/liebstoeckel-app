import index from "./index.html";

const server = Bun.serve({
  routes: { "/*": index },
  development: true,
  hostname: "0.0.0.0",
  port: 3003,
});

console.log(`▶  http://localhost:${server.port}`);
