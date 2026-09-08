import type { LensType } from "@/engine/observation/types";

export const LENS_KEYS: LensType[] = [
  "technical",
  "physical",
  "mental",
  "tactical",
  "general",
];

export type LensShape = "square" | "triangle" | "plus" | "bar" | "circle";

export interface LensVisual {
  label: string;
  className: string;
  borderClassName: string;
  shape: LensShape;
}

/**
 * Dual-coded lens language: word + shape + token.
 * Hue alone is not enough for colorblind remaps.
 */
export const LENS_VISUAL: Record<LensType, LensVisual> = {
  technical: {
    label: "Technical",
    className: "signal-focus",
    borderClassName: "border-[color:var(--signal-focus)]/40",
    shape: "square",
  },
  physical: {
    label: "Physical",
    className: "signal-warn",
    borderClassName: "border-[color:var(--signal-warn)]/40",
    shape: "triangle",
  },
  mental: {
    label: "Mental",
    className: "signal-moment",
    borderClassName: "border-[color:var(--signal-moment)]/40",
    shape: "plus",
  },
  tactical: {
    label: "Tactical",
    className: "signal-danger",
    borderClassName: "border-[color:var(--signal-danger)]/40",
    shape: "bar",
  },
  general: {
    label: "General",
    className: "signal-general",
    borderClassName: "border-[color:var(--signal-general)]/40",
    shape: "circle",
  },
};

export function lensShapeClass(shape: LensShape): string {
  switch (shape) {
    case "square":
      return "h-2.5 w-2.5 rounded-[2px] bg-current";
    case "triangle":
      return "h-0 w-0 border-x-[5px] border-b-[9px] border-x-transparent border-b-current bg-transparent";
    case "plus":
      return "h-2.5 w-2.5 bg-current [clip-path:polygon(35%_0,65%_0,65%_35%,100%_35%,100%_65%,65%_65%,65%_100%,35%_100%,35%_65%,0_65%,0_35%,35%_35%)]";
    case "bar":
      return "h-2 w-3.5 rounded-sm bg-current";
    case "circle":
      return "h-2.5 w-2.5 rounded-full bg-current";
  }
}
