/**
 * First-hour chrome: start → watch → file → see next week.
 * World, Career, and the stacked Desk command center stay backstage
 * until the opening report exists or the calendar has moved.
 */
export function isYouthFirstHour(state: {
  currentWeek?: number;
  currentSeason?: number;
  reports?: Record<string, unknown> | null;
  openingCase?: unknown;
} | null | undefined): boolean {
  if (!state) return false;
  return (
    Boolean(state.openingCase)
    && (state.currentSeason ?? 1) === 1
    && (state.currentWeek ?? 1) <= 1
    && Object.keys(state.reports ?? {}).length === 0
  );
}

export function isYouthOpeningWeek(state: {
  currentWeek?: number;
  currentSeason?: number;
} | null | undefined): boolean {
  if (!state) return false;
  return (state.currentSeason ?? 1) === 1 && (state.currentWeek ?? 1) <= 1;
}
