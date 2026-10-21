declare module "*.code.md" {
  import type { TokenizedStep } from "@liebstoeckel/engine";
  const steps: TokenizedStep[];
  export default steps;
}
declare module "*.png" {
  const url: string;
  export default url;
}
declare module "*.svg" {
  const url: string;
  export default url;
}
