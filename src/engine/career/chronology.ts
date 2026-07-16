import type { CareerTier, Scout } from "../core/types";

export const CAREER_CHRONOLOGY_VERSION = 1 as const;

export interface CareerDate {
  week: number;
  season: number;
}

export interface CareerChronologyState {
  version: typeof CAREER_CHRONOLOGY_VERSION;
  startedSeason: number;
  lastAgedSeason: number;
  completedSeasons: number;
  peakTier: CareerTier;
  tierReachedAt: Partial<Record<CareerTier, CareerDate>>;
  /** True when pre-chronology save evidence established tenure but not exact dates. */
  inferredFromLegacy?: boolean;
}

export interface CareerSeasonRolloverResult {
  scout: Scout;
  chronology: CareerChronologyState;
  seasonsAged: number;
}

function finiteSeason(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

/**
 * Initializes chronology without inventing history for an imported save.
 * Migration callers should pass the loaded season as both current and last-aged
 * season; the next real rollover will then age the scout exactly once.
 */
export function createCareerChronologyState(input: {
  currentSeason: number;
  careerTier: CareerTier;
  partial?: Partial<CareerChronologyState>;
}): CareerChronologyState {
  const currentSeason = finiteSeason(input.currentSeason, 1);
  const partial = input.partial;
  const startedSeason = finiteSeason(partial?.startedSeason ?? currentSeason, currentSeason);
  const lastAgedSeason = Math.max(
    startedSeason,
    finiteSeason(partial?.lastAgedSeason ?? currentSeason, currentSeason),
  );
  const completedSeasons = Math.max(
    0,
    Math.trunc(partial?.completedSeasons ?? Math.max(0, lastAgedSeason - startedSeason)),
  );
  const peakTier = Math.max(partial?.peakTier ?? input.careerTier, input.careerTier) as CareerTier;

  return {
    version: CAREER_CHRONOLOGY_VERSION,
    startedSeason,
    lastAgedSeason,
    completedSeasons,
    peakTier,
    tierReachedAt: { ...(partial?.tierReachedAt ?? {}) },
    inferredFromLegacy: partial?.inferredFromLegacy,
  };
}

/**
 * Backfill only tenure facts explicitly retained by an older save. Exact tier
 * dates remain unknown instead of being fabricated at migration time.
 */
export function inferLegacyCareerChronology(input: {
  currentSeason: number;
  careerTier: CareerTier;
  legacyCompletedSeasons?: number;
  legacyPeakTier?: number;
  performanceReviewSeasons?: readonly number[];
  performanceSnapshotSeasons?: readonly number[];
}): CareerChronologyState {
  const currentSeason = finiteSeason(input.currentSeason, 1);
  const explicitReviewSeasons = new Set([
    ...(input.performanceReviewSeasons ?? []),
    ...(input.performanceSnapshotSeasons ?? []),
  ].filter((season) => Number.isFinite(season) && season < currentSeason));
  const completedSeasons = Math.max(
    0,
    Math.trunc(input.legacyCompletedSeasons ?? 0),
    explicitReviewSeasons.size,
  );
  const legacyPeakTier = Math.max(
    1,
    Math.min(5, Math.trunc(input.legacyPeakTier ?? input.careerTier)),
  ) as CareerTier;
  return createCareerChronologyState({
    currentSeason,
    careerTier: input.careerTier,
    partial: {
      startedSeason: Math.max(1, currentSeason - completedSeasons),
      lastAgedSeason: currentSeason,
      completedSeasons,
      peakTier: Math.max(input.careerTier, legacyPeakTier) as CareerTier,
      tierReachedAt: {},
      inferredFromLegacy: completedSeasons > 0,
    },
  });
}

/**
 * Ages the scout once for every newly crossed season boundary. Repeating the
 * same rollover is a no-op, which keeps manual and batch advancement aligned.
 */
export function processCareerSeasonRollover(input: {
  scout: Scout;
  chronology: CareerChronologyState;
  nextSeason: number;
}): CareerSeasonRolloverResult {
  const chronology = createCareerChronologyState({
    currentSeason: input.chronology.lastAgedSeason,
    careerTier: input.scout.careerTier,
    partial: input.chronology,
  });
  const nextSeason = finiteSeason(input.nextSeason, chronology.lastAgedSeason);
  const seasonsAged = Math.max(0, nextSeason - chronology.lastAgedSeason);
  if (seasonsAged === 0) {
    return { scout: input.scout, chronology, seasonsAged: 0 };
  }

  return {
    scout: { ...input.scout, age: input.scout.age + seasonsAged },
    chronology: {
      ...chronology,
      lastAgedSeason: nextSeason,
      completedSeasons: chronology.completedSeasons + seasonsAged,
      peakTier: Math.max(chronology.peakTier, input.scout.careerTier) as CareerTier,
    },
    seasonsAged,
  };
}

/** Records a promotion boundary without changing the scout itself. */
export function recordCareerTierReached(
  chronology: CareerChronologyState,
  tier: CareerTier,
  at: CareerDate,
): CareerChronologyState {
  if (chronology.tierReachedAt[tier]) {
    return {
      ...chronology,
      peakTier: Math.max(chronology.peakTier, tier) as CareerTier,
    };
  }
  return {
    ...chronology,
    peakTier: Math.max(chronology.peakTier, tier) as CareerTier,
    tierReachedAt: { ...chronology.tierReachedAt, [tier]: { ...at } },
  };
}

export interface FinalChapterEligibility {
  eligible: boolean;
  reasons: Array<"veteranAge" | "longCareer" | "eliteTenure">;
}

/**
 * The final chapter is elective. Eligibility opens narrative options but never
 * silently retires or weakens the scout.
 */
export function getFinalChapterEligibility(
  scout: Scout,
  chronology: CareerChronologyState,
  now: CareerDate,
): FinalChapterEligibility {
  const reasons: FinalChapterEligibility["reasons"] = [];
  if (scout.age >= 60) reasons.push("veteranAge");
  if (chronology.completedSeasons >= 12) reasons.push("longCareer");
  const eliteAt = chronology.tierReachedAt[5];
  if (scout.careerTier === 5 && eliteAt && now.season - eliteAt.season >= 3) {
    reasons.push("eliteTenure");
  }
  return { eligible: reasons.length > 0, reasons };
}
