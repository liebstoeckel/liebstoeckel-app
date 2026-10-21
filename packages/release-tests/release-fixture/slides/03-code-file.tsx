import { CodeMagic } from "@liebstoeckel/engine";
import { Kicker } from "../components/Kicker";
import greet from "./greet.code.md";

export default function CodeFile() {
  return (
    <div className="w-full">
      <Kicker>Code file</Kicker>
      <CodeMagic title="greet.ts" steps={greet} />
    </div>
  );
}
