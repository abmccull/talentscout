/** Calendar-year bases for recurring amounts. */
export const MONTHS_PER_YEAR = 12;
export const WEEKS_PER_YEAR = 52;

/**
 * Convert a monthly amount into a calendar-year estimate. This intentionally
 * does not depend on competition weeks: employment salary accrues year-round.
 */
export function annualizeMonthlyAmount(
  monthlyAmount: number,
  years = 1,
): number {
  if (!Number.isFinite(monthlyAmount) || !Number.isFinite(years)) return 0;
  return Math.max(0, monthlyAmount) * MONTHS_PER_YEAR * Math.max(0, years);
}

/** Convert the scout's canonical weekly salary into a calendar-year estimate. */
export function annualizeWeeklyAmount(
  weeklyAmount: number,
  years = 1,
): number {
  if (!Number.isFinite(weeklyAmount) || !Number.isFinite(years)) return 0;
  return Math.max(0, weeklyAmount) * WEEKS_PER_YEAR * Math.max(0, years);
}

/** Calendar-month equivalent of a canonical weekly football salary. */
export function monthlyEquivalentOfWeeklyAmount(weeklyAmount: number): number {
  return Math.round(annualizeWeeklyAmount(weeklyAmount) / MONTHS_PER_YEAR);
}

/**
 * Twelve financial periods are distributed across every competition season.
 * This prevents a 38-week league from paying fewer annual salary/expense
 * cycles than a 46- or 50-week league.
 */
export function isFinancialPeriodClose(
  week: number,
  seasonLength: number,
): boolean {
  if (!Number.isFinite(week) || !Number.isFinite(seasonLength)) return false;
  const normalizedLength = Math.max(1, Math.floor(seasonLength));
  const normalizedWeek = Math.max(1, Math.min(normalizedLength, Math.floor(week)));
  const periodsAtWeek = Math.floor((normalizedWeek * MONTHS_PER_YEAR) / normalizedLength);
  const periodsBeforeWeek = Math.floor(
    ((normalizedWeek - 1) * MONTHS_PER_YEAR) / normalizedLength,
  );
  return periodsAtWeek > periodsBeforeWeek;
}
