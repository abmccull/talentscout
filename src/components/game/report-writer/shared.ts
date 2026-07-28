import type {
  ConvictionLevel,
  EvidenceConfidenceBand,
  JudgmentCategory,
  PlayerAttribute,
} from "@/engine/core/types";
import type { QualityBreakdown } from "@/engine/reports";

import type { ReportWorkflowStep } from "@/components/game/reportWriterMode";

export const CONVICTION_KEYS: ConvictionLevel[] = [
  "note",
  "recommend",
  "strongRecommend",
  "tablePound",
];

export function initialAssessmentConviction(
  confidence: EvidenceConfidenceBand | undefined,
): ConvictionLevel {
  if (confidence === "robust") return "strongRecommend";
  if (confidence === "supported") return "recommend";
  return "note";
}

export function confidenceColor(confidence: number): string {
  if (confidence >= 0.7) return "text-emerald-400";
  if (confidence >= 0.4) return "text-amber-400";
  return "text-red-400";
}

export function qualityScoreColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

export function qualityScoreBg(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

export function qualityScoreBorder(score: number): string {
  if (score >= 70) return "border-emerald-500/30";
  if (score >= 40) return "border-amber-500/30";
  return "border-red-500/30";
}

export function describeReportCraft(score: number): {
  label: string;
  representativeScore: number;
} {
  if (score >= 85) return { label: "Boardroom ready", representativeScore: 90 };
  if (score >= 70) return { label: "Credible", representativeScore: 77 };
  if (score >= 40) return { label: "Developing", representativeScore: 55 };
  return { label: "Fragile", representativeScore: 25 };
}

export const BREAKDOWN_LABELS: Record<
  keyof QualityBreakdown,
  { label: string; max: number }
> = {
  observationDepth: { label: "Observation depth", max: 25 },
  confidenceLevel: { label: "Evidence confidence", max: 20 },
  convictionFit: { label: "Conviction calibration", max: 15 },
  detail: { label: "Evidence-backed detail", max: 20 },
  scoutSkill: { label: "Scout technique", max: 20 },
};

export function formatValue(n: number): string {
  if (n >= 1_000_000) return `\u00A3${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `\u00A3${(n / 1_000).toFixed(0)}K`;
  return `\u00A3${n}`;
}

export function attrLabel(attr: string): string {
  return attr.replace(/([A-Z])/g, " $1").trim();
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export interface DescriptorOption {
  attributes: PlayerAttribute[];
  descriptor: string;
  estimatedValue: number;
  confidence: number;
}

export const MAX_STRENGTHS = 3;
export const MAX_WEAKNESSES = 2;
export const JUDGMENT_CATEGORIES: JudgmentCategory[] = [
  "potential",
  "roleFit",
  "characterRisk",
];
export const JUDGMENT_LABELS: Record<JudgmentCategory, string> = {
  potential: "Development potential",
  roleFit: "Tactical role fit",
  characterRisk: "Character and adaptation risk",
};

export interface CategoryDraft {
  status: "unselected" | "assessed" | "notAssessed";
  evidenceCardId: string;
  claimOptionId: string;
  unknownOptionId: string;
  confidence: "low" | "medium" | "high";
}

export interface RiskDraft {
  status: "observed" | "untested" | "noSignal";
  evidenceCardId?: string;
}

export interface SectionNavigatorItem extends ReportWorkflowStep {
  targetId: string;
  label: string;
  detail: string;
}

export interface FormDisplay {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: "up" | "down" | "neutral";
}

const FORM_MAP: Record<number, FormDisplay> = {
  3: {
    label: "Exceptional Form",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/15",
    borderColor: "border-emerald-500/40",
    icon: "up",
  },
  2: {
    label: "Good Form",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    icon: "up",
  },
  1: {
    label: "Decent Form",
    color: "text-emerald-300",
    bgColor: "bg-emerald-500/5",
    borderColor: "border-emerald-500/20",
    icon: "up",
  },
  0: {
    label: "Average Form",
    color: "text-zinc-400",
    bgColor: "bg-zinc-500/10",
    borderColor: "border-zinc-500/20",
    icon: "neutral",
  },
  [-1]: {
    label: "Below Average",
    color: "text-red-300",
    bgColor: "bg-red-500/5",
    borderColor: "border-red-500/20",
    icon: "down",
  },
  [-2]: {
    label: "Poor Form",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    icon: "down",
  },
  [-3]: {
    label: "Terrible Form",
    color: "text-red-400",
    bgColor: "bg-red-500/15",
    borderColor: "border-red-500/40",
    icon: "down",
  },
};

export function getFormDisplay(form: number): FormDisplay {
  const clamped = Math.max(-3, Math.min(3, Math.round(form)));
  return FORM_MAP[clamped] ?? FORM_MAP[0];
}
