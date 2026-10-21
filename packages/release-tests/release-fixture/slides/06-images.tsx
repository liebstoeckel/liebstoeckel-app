import { Kicker } from "../components/Kicker";
import gradient from "../assets/gradient.png";
import mark from "../assets/mark.svg";

export default function Images() {
  return (
    <div className="w-full">
      <Kicker>Images</Kicker>
      <div className="flex items-center gap-10">
        <img data-testid="png" src={gradient} alt="a PNG" width={288} height={192} className="rounded-xl" />
        <img data-testid="svg" src={mark} alt="an SVG" width={192} height={192} />
        <div className="h-48 w-72 rounded-xl" style={{ backgroundImage: `url(${gradient})`, backgroundSize: "cover" }} />
      </div>
    </div>
  );
}
