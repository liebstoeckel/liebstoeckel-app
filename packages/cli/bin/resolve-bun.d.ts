// Types for resolve-bun.js, which stays plain JavaScript so it runs under Node.

export interface Machine {
  platform: string;
  arch: string;
  musl: boolean;
}

export interface BunProblem {
  code: string;
  error: string;
  details: string[];
  fix: string;
}

export type InstallKind = "bun-global" | "bunx" | "npx" | "npm-global" | "local";

export declare const PRIMARY: Record<string, string>;
export declare function bunCandidates(m: Machine): { candidates: string[]; needs: string | null };
export declare function binaryIn(pkgDir: string, platform: string): string;
export declare function pinnedVersion(pkgJson: { optionalDependencies?: Record<string, string> }): string | null;
export declare function installKind(cliDir: string, env?: Record<string, string | undefined>): InstallKind;
export declare function bunProblem(
  m: Machine & {
    version: string | null;
    tried: string[];
    needs: string | null;
    kind: string;
    found?: { pkg: string; version: string } | null;
    empty?: string | null;
  },
): BunProblem;
export declare function spawnProblem(bin: string, err: unknown): BunProblem;
export declare function problemText(p: BunProblem): string;
export declare function problemJson(p: BunProblem): string;
export declare function wantsJson(argv: string[]): boolean;
