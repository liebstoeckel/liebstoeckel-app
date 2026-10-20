// Static checks a host can run on a deck's source without building it (the hosted
// gateway runs them on every snapshot, outside the sandbox): the macro rule the
// build enforces, and the code-file syntax.
export { macroProblems, withoutCodeStep, MACRO_MODULE } from "./core/macro.ts";
export { codeBlocks, CODE_FILE } from "./core/code-file.ts";
export { bunfigProblems } from "./profile.ts";
