import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CodeMagic } from "./CodeMagic";
import { StepsProvider } from "./steps";
import type { TokenizedStep } from "./code/types";

const tok = (content: string, color?: string) => ({ content, color });
const STEPS: TokenizedStep[] = [
  { lang: "ts", lines: [[tok("const a = 1", "var(--shiki-token-keyword)")]] },
  {
    lang: "ts",
    lines: [[tok("const a = 1", "var(--shiki-token-keyword)")], [tok("const b = 2", "var(--shiki-token-keyword)")]],
  },
];

describe("CodeMagic", () => {
  test("renders the chrome bar (title + lang)", () => {
    const html = renderToStaticMarkup(<CodeMagic steps={STEPS} title="demo.ts" />);
    expect(html).toContain("demo.ts");
    expect(html).toContain("pi-code-lang");
    expect(html).toContain("ts");
  });

  test("token colors are emitted as Shiki CSS vars (brand-bound)", () => {
    const html = renderToStaticMarkup(<CodeMagic steps={STEPS} />);
    expect(html).toContain("var(--shiki-token-keyword)");
  });

  test("outside a StepsProvider it shows the FINAL state (static/thumbnail)", () => {
    const html = renderToStaticMarkup(<CodeMagic steps={STEPS} />);
    expect(html).toContain("const b = 2"); // the line only present in the last state
  });

  test("inside a StepsProvider at step 0 it shows the FIRST state only", () => {
    const html = renderToStaticMarkup(
      <StepsProvider step={0} slideIndex={0}>
        <CodeMagic steps={STEPS} />
      </StepsProvider>,
    );
    // pre-registration the reveal resolves to state 0 → second line absent
    expect(html).toContain("const a = 1");
    expect(html).not.toContain("const b = 2");
  });
});
