import index from "./index.html";

// A dependency-free story runner: Bun's HTML import pipeline (HMR, Fast
// Refresh, CSS bundling) serving stories/main.tsx, which renders whichever
// CSF module the registry lists. Dev-only; `bun run stories` in this package.

const port = Number(process.env.PORT ?? 6007);
const server = Bun.serve({
  port,
  hostname: "0.0.0.0",
  development: { hmr: true, console: true },
  routes: { "/": index, "/*": index },
});

console.log(`stories: http://localhost:${server.port}  (also reachable on the LAN)`);
