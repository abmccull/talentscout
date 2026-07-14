import type { CareerTier, ScoutReport } from "@/engine/core/types";
import { getReportCaseKey } from "./reportAccountability";

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
  // A table pound is a scarce reputational stake on a scouting case, not on
  // each immutable report artifact. Remember the first time a case carried
  // that conviction so revisions cannot consume the allowance repeatedly or
  // restore it by later lowering the conviction.
  const firstStakeByCase = new Map<string, ScoutReport>();
  for (const report of input.reports) {
    if (report.scoutId !== input.scoutId || report.conviction !== "tablePound") {
      continue;
    }
    const key = getReportCaseKey(report);
    const current = firstStakeByCase.get(key);
    if (
      !current
      || report.submittedSeason < current.submittedSeason
      || (
        report.submittedSeason === current.submittedSeason
        && report.submittedWeek < current.submittedWeek
      )
    ) {
      firstStakeByCase.set(key, report);
    }
  }
  const used = [...firstStakeByCase.values()].filter(
    (report) => report.submittedSeason === input.season,
  ).length;
  return Math.max(0, getSeasonTablePoundAllowance(input.careerTier) - used);
}
