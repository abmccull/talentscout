import type {
  InboxMessage,
  ReflectionFlaggedMomentRecord,
  ReflectionHypothesisRecord,
} from "@/engine/core/types";

export interface FormDisplay {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: "up" | "down" | "neutral";
}

const FORM_MAP: Record<number, FormDisplay> = {
  3: { label: "Exceptional Form", color: "text-emerald-400", bgColor: "bg-emerald-500/15", borderColor: "border-emerald-500/40", icon: "up" },
  2: { label: "Good Form", color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/30", icon: "up" },
  1: { label: "Decent Form", color: "text-emerald-300", bgColor: "bg-emerald-500/5", borderColor: "border-emerald-500/20", icon: "up" },
  0: { label: "Average Form", color: "text-zinc-400", bgColor: "bg-zinc-500/10", borderColor: "border-zinc-500/20", icon: "neutral" },
};

FORM_MAP[-1] = { label: "Below Average", color: "text-red-300", bgColor: "bg-red-500/5", borderColor: "border-red-500/20", icon: "down" };
FORM_MAP[-2] = { label: "Poor Form", color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/30", icon: "down" };
FORM_MAP[-3] = { label: "Terrible Form", color: "text-red-400", bgColor: "bg-red-500/15", borderColor: "border-red-500/40", icon: "down" };

export const DOMAIN_LABELS: Record<string, string> = {
  technical: "Technical",
  physical: "Physical",
  mental: "Mental",
  tactical: "Tactical",
};

export const DOMAIN_ORDER = ["technical", "physical", "mental", "tactical"] as const;

export function getFormDisplay(form: number): FormDisplay {
  const clamped = Math.max(-3, Math.min(3, Math.round(form)));
  return FORM_MAP[clamped] ?? FORM_MAP[0];
}

export function confidenceColor(confidence: number): string {
  if (confidence >= 0.7) return "bg-emerald-500";
  if (confidence >= 0.4) return "bg-amber-500";
  return "bg-red-500";
}

export function attributeValueColor(midpoint: number): string {
  if (midpoint >= 16) return "bg-emerald-500";
  if (midpoint >= 12) return "bg-emerald-600/80";
  if (midpoint >= 8) return "bg-amber-500";
  if (midpoint >= 5) return "bg-orange-500";
  return "bg-red-500";
}

export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.7) return "High";
  if (confidence >= 0.4) return "Medium";
  return "Low";
}

export function compareSeasonWeekDesc(
  left: { season: number; week: number },
  right: { season: number; week: number },
): number {
  if (right.season !== left.season) return right.season - left.season;
  return right.week - left.week;
}

export function formatMarketValue(value: number): string {
  if (value >= 1_000_000) return `\u00A3${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `\u00A3${(value / 1_000).toFixed(0)}K`;
  return `\u00A3${value}`;
}

export function formatAttribute(attr: string): string {
  const spaced = attr.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function formatSeasonWeekLabel(season: number, week: number): string {
  return `Season ${season}, Week ${week}`;
}

export function formatMomentType(
  momentType: ReflectionFlaggedMomentRecord["momentType"],
): string {
  return formatAttribute(momentType);
}

export function isQualitativeIntelMessage(message: InboxMessage): boolean {
  const title = message.title.toLowerCase();
  const body = message.body.toLowerCase();
  if (title.startsWith("network intel:")) return true;
  if (title.startsWith("exclusive tip")) return true;
  if (title.startsWith("gossip from")) return true;

  return [
    "coach",
    "parent",
    "family",
    "contact",
    "intel",
    "tip",
    "gossip",
  ].some((token) => title.includes(token) || body.includes(token));
}

export function getHypothesisStateDisplay(
  state: ReflectionHypothesisRecord["state"],
): {
  label: string;
  className: string;
} {
  switch (state) {
    case "confirmed":
      return {
        label: "Confirmed",
        className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
      };
    case "supported":
      return {
        label: "Supported",
        className: "border-sky-500/40 bg-sky-500/10 text-sky-300",
      };
    case "contradicted":
      return {
        label: "Contradicted",
        className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
      };
    case "debunked":
      return {
        label: "Debunked",
        className: "border-red-500/40 bg-red-500/10 text-red-300",
      };
    default:
      return {
        label: "Open",
        className: "border-zinc-600 bg-zinc-800/70 text-zinc-300",
      };
  }
}

export function getFlaggedReactionDisplay(
  reaction: ReflectionFlaggedMomentRecord["reaction"],
): {
  label: string;
  className: string;
} {
  switch (reaction) {
    case "promising":
      return {
        label: "Promising",
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      };
    case "concerning":
      return {
        label: "Concern",
        className: "border-red-500/30 bg-red-500/10 text-red-300",
      };
    case "interesting":
      return {
        label: "Interesting",
        className: "border-sky-500/30 bg-sky-500/10 text-sky-300",
      };
    default:
      return {
        label: "Watch",
        className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      };
  }
}
