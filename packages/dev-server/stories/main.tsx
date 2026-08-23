import { type ReactNode, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { STORY_MODULES, type StoryModule } from "./registry";

// The runner: a nav of CSF stories, a canvas whose width you can drag (the
// question this exists to answer is how the sidebar behaves as the viewport
// shrinks). No args panel; variants are named exports.

interface StoryRef {
  group: string;
  name: string;
  render: (ctx: StoryContext) => ReactNode;
  note?: string;
}

export interface StoryContext {
  width: number;
  height: number;
}

function collect(): StoryRef[] {
  const refs: StoryRef[] = [];
  for (const mod of STORY_MODULES as StoryModule[]) {
    const group = mod.default.title;
    for (const [name, value] of Object.entries(mod)) {
      if (name === "default" || typeof value !== "function") continue;
      const story = value as ((ctx: StoryContext) => ReactNode) & { note?: string };
      refs.push({ group, name, render: story, note: story.note });
    }
  }
  return refs;
}

const WIDTHS = [480, 640, 860, 1024, 1280, 1440, 1680];

function useHash(): [string, (next: string) => void] {
  const [hash, setHash] = useState(() => decodeURIComponent(location.hash.slice(1)));
  useEffect(() => {
    const on = () => setHash(decodeURIComponent(location.hash.slice(1)));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return [hash, (next) => (location.hash = encodeURIComponent(next))];
}

function Runner() {
  const stories = collect();
  const [hash, setHash] = useHash();
  const active = stories.find((s) => `${s.group}/${s.name}` === hash) ?? stories[0]!;
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(720);

  const groups = [...new Set(stories.map((s) => s.group))];

  return (
    <div className="runner">
      <div className="runner-bar">
        <b>dev-server stories</b>
        <label>
          width
          <input type="range" min={400} max={1800} step={10} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
          <span className="val">{width}px</span>
        </label>
        <select value={width} onChange={(e) => setWidth(Number(e.target.value))}>
          {WIDTHS.map((w) => (
            <option key={w} value={w}>
              {w}px
            </option>
          ))}
        </select>
        <label>
          height
          <input type="range" min={400} max={1000} step={10} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
          <span className="val">{height}px</span>
        </label>
      </div>
      <nav className="runner-nav">
        {groups.map((group) => (
          <div key={group}>
            <h4>{group}</h4>
            {stories
              .filter((s) => s.group === group)
              .map((s) => (
                <a
                  key={s.name}
                  href={`#${encodeURIComponent(`${s.group}/${s.name}`)}`}
                  data-active={String(s === active)}
                  onClick={(e) => {
                    e.preventDefault();
                    setHash(`${s.group}/${s.name}`);
                  }}
                >
                  {s.name}
                </a>
              ))}
          </div>
        ))}
      </nav>
      <div className="runner-canvas">
        <div className="runner-story" style={{ width, height }} key={`${active.group}/${active.name}`}>
          {active.render({ width, height })}
        </div>
        {active.note && <p className="runner-note">{active.note}</p>}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Runner />
  </StrictMode>,
);
