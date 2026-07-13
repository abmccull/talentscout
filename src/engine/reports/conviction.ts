import type { CareerTier, ScoutReport } from "@/engine/core/types";

/** A scarce reputational resource, derived from durable reports so it needs no save field. */
export function getSeasonTablePoundAllowance(careerTier: CareerTier): number {
  return careerTier >= 4 ? 2 : 1;
}

export function getRemainingTablePounds(input: {
  reports: Iterable<ScoutReport>;
  scoutId: string;
  season: number;
  careerTier: CareerTier;
}): number {
  const used = [...input.reports].filter((report) =>
    report.scoutId === input.scoutId
    && report.submittedSeason === input.season
    && report.conviction === "tablePound"
  ).length;
  return Math.max(0, getSeasonTablePoundAllowance(input.careerTier) - used);
}
