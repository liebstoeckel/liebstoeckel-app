import { describe, expect, test } from "bun:test";
import { parseChromiumArgs } from "./capture";

describe("parseChromiumArgs (the LIEBSTOECKEL_CHROMIUM_ARGS escape hatch)", () => {
  test("splits a whitespace-separated flag list", () => {
    expect(parseChromiumArgs("--no-sandbox --disable-gpu")).toEqual(["--no-sandbox", "--disable-gpu"]);
    expect(parseChromiumArgs("  --a \t --b=1\n--c  ")).toEqual(["--a", "--b=1", "--c"]);
  });

  test("unset or blank means: use the defaults", () => {
    expect(parseChromiumArgs(undefined)).toBeNull();
    expect(parseChromiumArgs("")).toBeNull();
    expect(parseChromiumArgs("   ")).toBeNull();
  });
});
