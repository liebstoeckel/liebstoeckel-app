import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightPageActions from "starlight-page-actions";

// Static docs site for liebstoeckel. Astro Starlight → static HTML (Islands: zero JS
// by default, Pagefind search, dark mode). starlight-page-actions adds the per-page
// toolbar (Copy as Markdown · Open in ChatGPT/Claude · Share) and emits /llms.txt,
// so the docs are LLM-native. Build with Bun: `bun --bun astro build`.
export default defineConfig({
  site: "https://docs.liebstoeckel.app",
  integrations: [
    starlight({
      title: "liebstoeckel",
      // the brand-book header lockup: mark beside the wordmark, mark color
      // picked by ground (gold on dark, darkened gold on cream) — assets are
      // checked-in copies of @liebstoeckel/corporate-design's out/ SVGs
      logo: {
        dark: "./src/assets/logo-gold.svg",
        light: "./src/assets/logo-goldcream.svg",
        alt: "",
      },
      favicon: "/favicon.svg",
      head: [
        { tag: "link", attrs: { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" } },
        { tag: "link", attrs: { rel: "apple-touch-icon", href: "/apple-touch-icon.png" } },
      ],
      customCss: ["./src/styles/theme.css"],
      description:
        "A code-first presentation engine that produces stunning, animated, single-file HTML decks — Bun + React 19 + Motion + Tailwind v4, authored in MDX + TSX.",
      tagline: "Code-first presentations that talk back.",
      // `baseUrl` is required for the llms.txt generation + absolute Markdown URLs
      // the "Open in ChatGPT/Claude" actions link to.
      plugins: [starlightPageActions({ baseUrl: "https://docs.liebstoeckel.app" })],
      sidebar: [
        {
          label: "Start here",
          items: ["guides/what-is-liebstoeckel", "guides/getting-started", "guides/your-first-deck"],
        },
        {
          label: "Authoring",
          items: ["guides/authoring", "guides/scaffolding", "guides/animated-code", "guides/theming", "guides/mobile"],
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
          label: "Cloud & teams",
          items: ["guides/cloud"],
        },
        {
          label: "Concepts",
          items: ["concepts/architecture", "concepts/rendering", "concepts/state-model", "concepts/testing"],
        },
        {
          label: "Reference",
          items: ["reference/cli", "reference/engine-api", "reference/components"],
        },
      ],
    }),
  ],
});
