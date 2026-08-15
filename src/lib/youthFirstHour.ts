type OpeningState = {
  currentWeek?: number;
  currentSeason?: number;
  reports?: Record<string, unknown> | null;
  openingCase?: unknown;
  schedule?: { activities?: Array<unknown | null> } | null;
} | null | undefined;

function isOpeningSeasonOneWeekOne(state: OpeningState): boolean {
  if (!state?.openingCase) return false;
  if ((state.currentSeason ?? 1) !== 1) return false;
  return (state.currentWeek ?? 1) <= 1;
}

/**
 * Unbooked opening: Desk still has one next verb (watch / write).
 * Booking the second look does not mean the Steam first week is over.
 */
export function isYouthFirstHour(state: OpeningState): boolean {
  if (!isOpeningSeasonOneWeekOne(state)) return false;
  const booked = state?.schedule?.activities?.some((activity) => activity != null) ?? false;
  return !booked;
}

export function isYouthOpeningWeek(state: {
  currentWeek?: number;
  currentSeason?: number;
} | null | undefined): boolean {
  if (!state) return false;
  return (state.currentSeason ?? 1) === 1 && (state.currentWeek ?? 1) <= 1;
}

/**
 * Steam first-week shell. Inbox, World, Career, and achievement juice stay
 * off the HUD until week 2 — including the Planner receipt after filing.
 */
export function isYouthOpeningShell(state: OpeningState): boolean {
  return isOpeningSeasonOneWeekOne(state);
}

/**
 * The opening case is still the career. Week 2–4 must stay the same game:
 * same kid, same gold, four rooms — not a sudden World/Career OS.
 */
export function isYouthEarlyCareer(state: OpeningState): boolean {
  if (!state?.openingCase) return false;
  if ((state.currentSeason ?? 1) !== 1) return false;
  return (state.currentWeek ?? 1) <= 4;
}

export type YouthWorkspacePhase = "opening" | "case" | "career";

export function getYouthWorkspacePhase(state: OpeningState): YouthWorkspacePhase {
  if (isYouthOpeningShell(state)) return "opening";
  if (isYouthEarlyCareer(state)) return "case";
  return "career";
}

export function shouldShowYouthWorldCareer(state: OpeningState): boolean {
  return getYouthWorkspacePhase(state) === "career";
}

export function isYouthWatchScreen(screen: string | null | undefined): boolean {
  return screen === "observation" || screen === "openingDiscovery";
}

/** Inbox joins the four-room board in week 2. Not during the opening week. */
export function shouldShowYouthInbox(state: OpeningState): boolean {
  return !isYouthOpeningShell(state);
}

/** Hold Steam juice through Watch and the first two weeks of the same case. */
export function shouldHoldAchievementToasts(
  screen: string | null | undefined,
  state: OpeningState,
): boolean {
  if (isYouthWatchScreen(screen)) return true;
  if (screen === "internationalView") return true;
  if (isYouthOpeningShell(state)) return true;
  return isYouthEarlyCareer(state) && (state?.currentWeek ?? 1) <= 2;
}
