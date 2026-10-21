import { Step } from "@liebstoeckel/engine";

export default function Title() {
  return (
    <div className="w-full">
      <h1 className="font-heading text-7xl font-semibold text-text">liebstoeckel e2e</h1>
      <div className="mt-8 space-y-3 font-body text-2xl text-muted">
        <Step>First reveal</Step>
        <Step>Second reveal</Step>
      </div>
    </div>
  );
}
