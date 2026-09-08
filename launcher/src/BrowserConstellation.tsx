import type { CSSProperties } from "react";
import type { BrowserState } from "./types";

const DOTS = [
  [8, 18, -118, 38, 0], [18, 34, -102, 20, 45], [27, 12, -84, 62, 80],
  [34, 54, -66, -6, 120], [43, 25, -48, 44, 160], [52, 67, -28, -24, 200],
  [61, 15, -8, 54, 240], [70, 48, 14, 12, 280], [79, 27, 38, 38, 320],
  [88, 64, 62, -12, 360], [94, 20, 90, 48, 400], [12, 76, -96, -26, 440],
  [24, 88, -76, -52, 480], [39, 83, -52, -42, 520], [55, 91, -22, -58, 560],
  [73, 84, 18, -44, 600], [86, 91, 52, -56, 640], [96, 78, 92, -30, 680],
] as const;

type ConstellationState = "idle" | "surge" | "steady" | "dim";

function constellationState(status: BrowserState["status"] | undefined): ConstellationState {
  if (status === "loading" || status === "testing" || status === "running") return "surge";
  if (status === "error") return "dim";
  if (status === "ready") return "steady";
  return "idle";
}

export function BrowserConstellation({ status, reducedMotion, variant = "empty" }: {
  status: BrowserState["status"] | undefined;
  reducedMotion: boolean;
  variant?: "browser" | "empty";
}) {
  const state = constellationState(status);
  return <div className={`browser-constellation is-${state} is-${variant}${reducedMotion ? " is-reduced-motion" : ""}`} aria-hidden="true">
    <div className="browser-constellation-glow" />
    {DOTS.map(([x, y, tx, ty, delay], index) => (
      <i
        className="browser-constellation-star"
        key={index}
        style={{
          "--star-x": `${x}%`,
          "--star-y": `${y}%`,
          "--star-tx": `${tx}px`,
          "--star-ty": `${ty}px`,
          "--star-delay": `${delay}ms`,
        } as CSSProperties}
      />
    ))}
    {variant === "empty" ? <div className="browser-constellation-moon" /> : null}
  </div>;
}
