// Generates brands.generated.css from the typed brand token objects.
// Run `bun run gen` after editing any brand. Keeps tokens (TS, one place) as the
// source of truth while emitting static CSS that Tailwind can process.
import { brands } from "./brands";
import { themeToCss } from "./defineTheme";

const header = "/* AUTO-GENERATED from packages/theme/src/brands/*.ts — run `bun run gen`. */\n";
const css = header + brands.map(themeToCss).join("\n") + "\n";

await Bun.write(new URL("./brands.generated.css", import.meta.url), css);
console.log(`✓ wrote brands.generated.css (${brands.map((b) => b.name).join(", ")})`);
