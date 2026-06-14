import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightPageActions from "starlight-page-actions";
import astroAgentAnnotate from "astro-agent-annotate";
import remarkGfm from "remark-gfm";

// Static docs site for liebstoeckel. Astro Starlight → static HTML (Islands: zero JS
// by default, Pagefind search, dark mode). starlight-page-actions adds the per-page
// toolbar (Copy as Markdown · Open in ChatGPT/Claude · Share) and emits /llms.txt,
// so the docs are LLM-native. Build with Bun: `bun --bun astro build`.
export default defineConfig({
  site: "https://docs.liebstoeckel.app",
  // Astro 6.4 stopped applying GFM to MDX by default, which dropped every
  // Markdown table (they leaked through as raw `| --- |` pipes). Declare
  // remark-gfm explicitly so tables/strikethrough/autolinks render regardless.
  markdown: { remarkPlugins: [remarkGfm] },
  integrations: [
    astroAgentAnnotate(),
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
        // Default social card. Starlight emits og:title/description/url + the
        // twitter:summary_large_image card, but no image; supply the brand's
        // 1200x630 card (a checked-in copy of corporate-design's out/og-card.png)
        // so shared docs links unfurl. Absolute URLs — unfurlers require them.
        { tag: "meta", attrs: { property: "og:image", content: "https://docs.liebstoeckel.app/og-card.png" } },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        {
          tag: "meta",
          attrs: {
            property: "og:image:alt",
            content: "liebstoeckel: AI-driven decks that ship as one self-contained, ejectable HTML file",
          },
        },
        { tag: "meta", attrs: { name: "twitter:image", content: "https://docs.liebstoeckel.app/og-card.png" } },
        // site-wide structured data: the org + the docs WebSite, for search and
        // answer engines.
        {
          tag: "script",
          attrs: { type: "application/ld+json" },
          content: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                "@id": "https://liebstoeckel.app/#org",
                name: "liebstoeckel",
                url: "https://liebstoeckel.app",
                logo: "https://liebstoeckel.app/apple-touch-icon.png",
              },
              {
                "@type": "WebSite",
                "@id": "https://docs.liebstoeckel.app/#website",
                name: "liebstoeckel docs",
                url: "https://docs.liebstoeckel.app",
                publisher: { "@id": "https://liebstoeckel.app/#org" },
              },
            ],
          }),
        },
      ],
      customCss: ["./src/styles/theme.css"],
      // the start page is the only `template: splash` page; its hero is the
      // landing-derived typographic hero + install terminal. The Footer keeps
      // Starlight's pagination and appends the brand footer with the legal
      // links (Impressum/Datenschutz live on the apex and cover the docs).
      components: {
        Hero: "./src/components/Hero.astro",
        Footer: "./src/components/Footer.astro",
      },
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
          items: ["guides/building", "guides/thumbnails", "guides/chromium"],
        },
        {
          label: "Cloud & teams",
          items: ["guides/cloud"],
        },
        {
          label: "Concepts",
          items: ["concepts/architecture", "concepts/rendering", "concepts/state-model"],
        },
        {
          label: "Reference",
          items: ["reference/cli", "reference/engine-api", "reference/components", "reference/file-format"],
        },
      ],
    }),
  ],
});
