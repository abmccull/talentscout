import { getScheduledActivityInstances } from "@/engine/core/calendar";
import type { ActivityType, GameState } from "@/engine/core/types";

const SCOUTING_SESSIONS = new Set<ActivityType>([
  "attendMatch", "watchVideo", "trainingVisit", "academyVisit", "youthTournament",
  "schoolMatch", "grassrootsTournament", "streetFootball", "academyTrialDay",
  "youthFestival", "followUpSession", "agencyShowcase", "reserveMatch",
  "scoutingMission", "oppositionAnalysis", "agentShowcase", "trialMatch",
  "deepVideoAnalysis", "loanMonitoring",
]);
const MEETINGS = new Set<ActivityType>([
  "networkMeeting", "parentCoachMeeting", "managerMeeting", "analyticsTeamMeeting",
]);

/** Summarise completed calendar work and actual filings, including filings made live. */
export function getWeeklyWorkCounts(beforeWeek: GameState, afterWeek: GameState) {
  const instances = getScheduledActivityInstances(beforeWeek.schedule);
  return {
    scoutingSessions: instances.filter(({ activity }) => SCOUTING_SESSIONS.has(activity.type)).length,
    matchesAttended: instances.filter(({ activity }) => activity.type === "attendMatch").length,
    meetingsHeld: instances.filter(({ activity }) => MEETINGS.has(activity.type)).length,
    // Desk preparation is not a filed assessment. Immutable revisions count when filed.
    reportsWritten: Object.values(afterWeek.reports).filter((report) =>
      report.scoutId === beforeWeek.scout.id
      && report.submittedWeek === beforeWeek.currentWeek
      && report.submittedSeason === beforeWeek.currentSeason,
    ).length,
  };
}
