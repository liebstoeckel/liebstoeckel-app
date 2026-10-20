// The part of react-refresh's runtime the dev runtime uses (the package ships no types).
declare module "react-refresh/runtime" {
  const RefreshRuntime: {
    injectIntoGlobalHook(globalObject: unknown): void;
    register(type: unknown, id: string): void;
    setSignature(type: unknown, key: string, forceReset?: boolean, getCustomHooks?: () => unknown[]): void;
    performReactRefresh(): unknown;
    isLikelyComponentType(type: unknown): boolean;
  };
  export default RefreshRuntime;
}
