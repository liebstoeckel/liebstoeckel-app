import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightLlmsTxt from "starlight-llms-txt";

// Static docs site for present-it. Astro Starlight → static HTML (Islands: zero JS
// by default, Pagefind search, dark mode). starlight-llms-txt emits /llms.txt and
// /llms-full.txt so the docs are LLM-native. Build with Bun: `bun --bun astro build`.
export default defineConfig({
  site: "https://present-it.dev",
  integrations: [
    starlight({
      title: "present-it",
      description:
        "A code-first presentation engine that produces stunning, animated, single-file HTML decks — Bun + React 19 + Motion + Tailwind v4, authored in MDX + TSX.",
      tagline: "Code-first presentations that talk back.",
      plugins: [
        starlightLlmsTxt({
          projectName: "present-it",
          description:
            "present-it is a code-first presentation engine: animated single-file HTML decks, multi-brand theming, a live Yjs-backed plugin system (poll / Q&A / reactions), build-time thumbnails, a secure relay, and a mobile-ready viewer.",
        }),
      ],
      sidebar: [
        {
          label: "Start here",
          items: ["guides/what-is-present-it", "guides/getting-started", "guides/your-first-deck"],
        },
        {
          label: "Authoring",
          items: ["guides/authoring", "guides/animated-code", "guides/theming", "guides/mobile"],
        },
        {
          label: "Live & collaboration",
          items: ["guides/live", "guides/relay"],
        },
        {
          label: "Plugins",
          items: [
            "plugins/overview",
            "plugins/building-a-plugin",
            "plugins/state-and-sync",
            "plugins/server-plugins",
            "plugins/testing",
          ],
        },
        {
          label: "Build & deploy",
          items: ["guides/building", "guides/thumbnails"],
        },
        {
          label: "Concepts",
          items: ["concepts/architecture", "concepts/rendering", "concepts/testing"],
        },
        {
          label: "Reference",
          items: ["reference/cli", "reference/engine-api", "reference/components"],
        },
      ],
    }),
  ],
});
