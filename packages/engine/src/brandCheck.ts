import { brands as builtInBrands, type Theme } from "@liebstoeckel/theme";

/** The brand a deck gets when it names none: the house brand, which the theme
 *  styles always ship. A name with no `[data-brand]` block behind it would leave
 *  every design token empty and the deck silently unthemed. */
export const DEFAULT_BRANDS: string[] = ["liebstoeckel"];

/** Edit distance between two short names, for the "did you mean" hint. */
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length]!;
}

/** The warning for a brand name that is not among the known brands, or null when
 *  it is. Names the brand, lists the known ones and suggests the closest match.
 *  Pure, so it is testable without a DOM. */
export function missingBrandMessage(name: string, known: Iterable<string>): string | null {
  const names = [...new Set(known)].sort();
  if (names.includes(name)) return null;
  const closest = names
    .map((n) => ({ n, d: distance(name.toLowerCase(), n.toLowerCase()) }))
    .filter(({ d }) => d <= 2)
    .sort((a, b) => a.d - b.d)[0]?.n;
  const available = names.length ? names.map((n) => `"${n}"`).join(", ") : "none";
  return (
    `[liebstoeckel] brand "${name}" is not defined, so the deck renders without theme tokens.` +
    (closest ? ` Did you mean "${closest}"?` : "") +
    ` Available brands: ${available}.` +
    ` A brand of your own needs its theme passed in \`brandThemes\` as well as its name in \`brands\`.`
  );
}

/** Whether any stylesheet gives `name` a background token, probed on a detached
 *  element so it works for brands that are not active yet. This also sees brands
 *  that a deck defines in its own CSS. */
function brandResolves(name: string): boolean {
  // Custom properties inherit, so the probe sits in a wrapper that resets the
  // token; otherwise it would pick up the active brand's value from the body.
  const wrapper = document.createElement("div");
  wrapper.hidden = true;
  wrapper.style.setProperty("--brand-bg", "initial");
  const probe = document.createElement("div");
  probe.dataset.brand = name;
  wrapper.appendChild(probe);
  document.body.appendChild(wrapper);
  const value = getComputedStyle(probe).getPropertyValue("--brand-bg").trim();
  wrapper.remove();
  return value !== "";
}

const warned = new Set<string>();

/** Development-time check that every brand a deck names exists, so a typo in a
 *  brand the deck only cycles to is reported up front too. Warns once per name
 *  when its background token does not resolve. A deck build pins
 *  `process.env.NODE_ENV` to "production", which drops the whole body, and the
 *  message with it, from built decks. */
export function warnIfBrandsMissing(names: readonly string[], brandThemes: readonly Theme[] = []): void {
  if (process.env.NODE_ENV !== "production") {
    if (typeof document === "undefined") return;
    const check = () => {
      const known = [...builtInBrands, ...brandThemes].map((t) => t.name);
      for (const name of names) {
        if (warned.has(name) || brandResolves(name)) continue;
        const message = missingBrandMessage(name, known);
        if (!message) continue;
        warned.add(name);
        console.warn(message);
      }
    };
    // Stylesheets can still be attaching on first mount (the dev server injects
    // them), so check once the document has loaded.
    if (document.readyState === "complete") requestAnimationFrame(check);
    else window.addEventListener("load", check, { once: true });
  }
}
