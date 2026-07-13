/** Calendar-year basis used for salaries, which are stored as monthly amounts. */
export const MONTHS_PER_YEAR = 12;

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
