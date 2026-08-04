"use client";

export function formatBalance(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}£${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}£${(abs / 1_000).toFixed(0)}K`;
  return `${sign}£${abs}`;
}

export function formatMoney(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
  return `£${n}`;
}

export function getOrdinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

export function threatBadgeVariant(
  quality: number,
): "default" | "warning" | "destructive" | "secondary" {
  if (quality >= 4) return "destructive";
  if (quality >= 3) return "warning";
  if (quality >= 2) return "default";
  return "secondary";
}

export function threatLabel(quality: number): string {
  if (quality >= 4) return "High Threat";
  if (quality >= 3) return "Medium";
  if (quality >= 2) return "Low";
  return "Minimal";
}

export interface YouthEvidenceSortEntry {
  observationCount: number;
  intelCount: number;
  reported: boolean;
  buzzLevel: number;
  visibility: number;
}

export function sortYouthByEvidence(
  a: YouthEvidenceSortEntry,
  b: YouthEvidenceSortEntry,
): number {
  return (
    b.observationCount - a.observationCount ||
    Number(b.reported) - Number(a.reported) ||
    b.intelCount - a.intelCount ||
    b.buzzLevel - a.buzzLevel ||
    b.visibility - a.visibility
  );
}

export function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case "critical": return "border-red-500/50 bg-red-500/10 text-red-400";
    case "high": return "border-amber-500/50 bg-amber-500/10 text-amber-400";
    case "medium": return "border-blue-500/50 bg-blue-500/10 text-blue-400";
    default: return "border-zinc-600 bg-zinc-800 text-zinc-400";
  }
}

export function performanceRatingColor(rating: number): string {
  if (rating >= 70) return "text-emerald-400";
  if (rating >= 40) return "text-amber-400";
  return "text-red-400";
}

export function moraleEmoji(morale: number): string {
  if (morale >= 75) return "😊";
  if (morale >= 50) return "😐";
  if (morale >= 25) return "😕";
  return "😞";
}

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
