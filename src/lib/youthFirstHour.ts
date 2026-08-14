/**
 * First-hour chrome: start → watch → file → see next week.
 * World, Career, and the stacked Desk command center stay backstage
 * until the opening week has a booked second look or the calendar moves.
 */
export function isYouthFirstHour(state: {
  currentWeek?: number;
  currentSeason?: number;
  reports?: Record<string, unknown> | null;
  openingCase?: unknown;
  schedule?: { activities?: Array<unknown | null> } | null;
} | null | undefined): boolean {
  if (!state?.openingCase) return false;
  if ((state.currentSeason ?? 1) !== 1) return false;
  if ((state.currentWeek ?? 1) > 1) return false;
  const booked = state.schedule?.activities?.some((activity) => activity != null) ?? false;
  return !booked;
}

export function isYouthOpeningWeek(state: {
  currentWeek?: number;
  currentSeason?: number;
} | null | undefined): boolean {
  if (!state) return false;
  return (state.currentSeason ?? 1) === 1 && (state.currentWeek ?? 1) <= 1;
}

export function isYouthWatchScreen(screen: string | null | undefined): boolean {
  return screen === "observation" || screen === "openingDiscovery";
}
