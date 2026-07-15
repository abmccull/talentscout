import type { GameState } from "@/engine/core/types";
import { selectLatestReportsByCase } from "@/engine/reports/reportAccountability";
import { evaluateHints } from "@/components/game/tutorial/hintConditions";
import type { TutorialState } from "@/stores/tutorialStore";

export function hasBrowsedYouthLoanWorkspace(
  visitedScreens: ReadonlySet<string>,
): boolean {
  return visitedScreens.has("youthScouting");
}

export function processWeeklyTutorialMilestones(
  previousState: GameState,
  nextState: GameState,
  tierPromoted: boolean,
  tutorial: TutorialState,
): void {
  tutorial.completeMilestone("advancedWeek");
  if (nextState.currentSeason === 1) {
    const week = nextState.currentWeek;
    if (week === 2) tutorial.startSequence("mentorCheckin:week2");
    else if (week === 3) tutorial.startSequence("mentorCheckin:week3");
    else if (week === 4) tutorial.startSequence("mentorCheckin:week4");
  }
  if (tierPromoted) tutorial.startSequence("careerProgression");

  if ((nextState.finances?.equipment?.ownedItems.length ?? 0) > 0) {
    tutorial.recordFeatureDiscovery("equipment");
  }
  if (Object.keys(nextState.npcScouts).length > 0) {
    tutorial.recordFeatureDiscovery("npcManagement");
  }
  if (nextState.freeAgentPool?.agents.some((agent) => agent.discoveredByScout)) {
    tutorial.recordFeatureDiscovery("freeAgent");
  }
  if (Object.values(nextState.contacts).some((contact) => contact.relationship > 0)) {
    tutorial.recordFeatureDiscovery("network");
  }
  if (Object.keys(nextState.rivalScouts).length > 0) {
    tutorial.recordFeatureDiscovery("rival");
  }

  const completed = tutorial.completedSequences;
  const hadAcceptedPlacement = Object.values(previousState.placementReports)
    .some((report) => report.clubResponse === "accepted");
  const hasAcceptedPlacement = Object.values(nextState.placementReports)
    .some((report) => report.clubResponse === "accepted");
  if (nextState.scout.primarySpecialization === "youth"
    && !completed.has("ahaMoment:youth")
    && !hadAcceptedPlacement && hasAcceptedPlacement) {
    tutorial.queueSequence("ahaMoment:youth");
  }
  if (nextState.scout.primarySpecialization === "data"
    && !completed.has("ahaMoment:data")
    && previousState.anomalyFlags.length === 0 && nextState.anomalyFlags.length > 0) {
    tutorial.queueSequence("ahaMoment:data");
  }
  if (!completed.has("ahaMoment:equipment")
    && !previousState.finances?.equipment?.ownedItems.length
    && (nextState.finances?.equipment?.ownedItems.length ?? 0) > 0) {
    tutorial.queueSequence("ahaMoment:equipment");
  }
  if (!completed.has("ahaMoment:npcReport")
    && Object.keys(previousState.npcReports).length === 0
    && Object.keys(nextState.npcReports).length > 0) {
    tutorial.queueSequence("ahaMoment:npcReport");
  }
  if (!completed.has("ahaMoment:freeAgent")
    && nextState.freeAgentPool?.agents.some(
      (agent) => agent.discoveredByScout && agent.status === "signed",
    )
    && !previousState.freeAgentPool?.agents.some(
      (agent) => agent.discoveredByScout && agent.status === "signed",
    )) {
    tutorial.queueSequence("ahaMoment:freeAgent");
  }
  if (!completed.has("ahaMoment:seasonAward")
    && !previousState.seasonAwardsData && nextState.seasonAwardsData) {
    tutorial.queueSequence("ahaMoment:seasonAward");
  }
  if (!completed.has("ahaMoment:contactIntel")
    && Object.keys(previousState.contactIntel).length === 0
    && Object.keys(nextState.contactIntel).length > 0) {
    tutorial.queueSequence("ahaMoment:contactIntel");
  }
  if (!completed.has("ahaMoment:perkActivated")
    && previousState.scout.unlockedPerks.length === 0
    && nextState.scout.unlockedPerks.length > 0) {
    tutorial.queueSequence("ahaMoment:perkActivated");
  }
}

export function processWeeklyContextualHint(
  state: GameState,
  tutorial: TutorialState,
): void {
  const npcHiredCount = Object.keys(state.npcScouts).length;
  const totalNpcSlots = Object.values(state.territories)
    .reduce((sum, territory) => sum + territory.maxScouts, 0);
  const freeAgents = state.freeAgentPool?.agents.filter(
    (agent) => agent.status === "available",
  ) ?? [];
  const equipment = state.finances?.equipment;
  const emptySlots = equipment
    ? (["notebook", "video", "travel", "network", "analysis"] as const)
      .filter((slot) => !equipment.loadout[slot]).length
    : 0;
  const loanWindowOpen = !!(state.transferWindow?.isOpen && state.activeLoans !== undefined);
  const hint = evaluateHints({
    currentWeek: state.currentWeek,
    currentSeason: state.currentSeason,
    fatigue: state.scout.fatigue,
    savings: state.finances?.balance ?? 0,
    hasClub: !!state.scout.currentClubId,
    observationCount: Object.keys(state.observations).length,
    reportCount: selectLatestReportsByCase(Object.values(state.reports)).length,
    comparisonCount: 0,
    networkMeetingsHeld: Object.values(state.contacts)
      .filter((contact) => contact.relationship > 0).length,
    unfulfilledDirectiveWeeks: state.managerDirectives
      ? state.managerDirectives.some((directive) => !directive.fulfilled)
        ? Math.max(0, state.currentWeek - 1) : 0
      : 0,
    scheduledRestDays: state.schedule.activities
      .filter((activity) => activity?.type === "rest").length,
    transferWindowClosingIn: state.transferWindow?.isOpen && state.transferWindow.closeWeek
      ? state.transferWindow.closeWeek - state.currentWeek : null,
    unsubmittedReportCount: 0,
    specialization: state.scout.primarySpecialization,
    unclaimedPerks: 0,
    emptyEquipmentSlots: emptySlots,
    discoveryCount: state.discoveryRecords.length,
    alumniCount: state.alumniRecords.length,
    hasCheckedAlumni: tutorial.visitedScreens.has("alumniDashboard"),
    hasCheckedLeaderboard: tutorial.visitedScreens.has("leaderboard"),
    npcSlotsAvailable: Math.max(0, totalNpcSlots - npcHiredCount),
    npcHiredCount,
    freeAgentCount: freeAgents.length,
    hasBrowsedFreeAgents: tutorial.visitedScreens.has("freeAgents"),
    loanMarketActive: loanWindowOpen,
    hasBrowsedLoans: hasBrowsedYouthLoanWorkspace(tutorial.visitedScreens),
    careerTier: state.scout.careerTier,
  }, tutorial.dismissedHints);
  if (hint) tutorial.showHint(hint);
}
