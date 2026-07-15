import type { GameState, InboxMessage } from "@/engine/core/types";
import type { WeekProcessingResult } from "@/engine/core/calendar";
import type { ActivityQualityResult } from "@/engine/core/activityQuality";

export interface WeeklyActivityFeedbackInput {
  state: GameState;
  qualityRolls: ReadonlyArray<{
    dayIndex: number;
    result: ActivityQualityResult;
  }>;
  weekResult: Pick<
    WeekProcessingResult,
    "skillXpGained" | "attributeXpGained" | "fatigueChange"
  >;
}

const SCOUTING_ACTIVITY_TYPES = new Set([
  "academyVisit", "youthTournament", "trainingVisit", "watchVideo",
  "schoolMatch", "grassrootsTournament", "streetFootball", "academyTrialDay",
  "youthFestival", "followUpSession", "parentCoachMeeting",
  "reserveMatch", "scoutingMission", "oppositionAnalysis", "agentShowcase", "trialMatch",
  "databaseQuery", "deepVideoAnalysis", "statsBriefing", "algorithmCalibration",
  "marketInefficiency", "analyticsTeamMeeting",
]);

const ACTIVITY_LABELS: Record<string, string> = {
  attendMatch: "Match Attendance",
  watchVideo: "Video Analysis",
  writeReport: "Report Writing",
  networkMeeting: "Network Meeting",
  trainingVisit: "Training Visit",
  study: "Study Session",
  academyVisit: "Academy Visit",
  youthTournament: "Youth Tournament",
};

const SKILL_LABELS: Record<string, string> = {
  technicalEye: "Technical Eye",
  physicalAssessment: "Physical Assessment",
  psychologicalRead: "Psychological Read",
  tacticalUnderstanding: "Tactical Understanding",
  dataLiteracy: "Data Literacy",
  playerJudgment: "Player Judgment",
  potentialAssessment: "Potential Assessment",
};

const TIER_LABELS: Record<string, string> = {
  poor: "Poor",
  average: "Average",
  good: "Good",
  excellent: "Excellent",
  exceptional: "Exceptional",
};

const DAY_LABELS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

/** Render non-scouting activity outcomes after their mechanical effects resolve. */
export function processWeeklyActivityFeedback(
  input: WeeklyActivityFeedbackInput,
): GameState {
  const messages: InboxMessage[] = [];
  for (const [index, entry] of input.qualityRolls.entries()) {
    const quality = entry.result;
    if (SCOUTING_ACTIVITY_TYPES.has(quality.activityType)) continue;
    const parts: string[] = [quality.narrative, ""];
    for (const [skill, value] of Object.entries(input.weekResult.skillXpGained)) {
      if (value && value > 0) parts.push(`${SKILL_LABELS[skill] ?? skill} +${value} XP`);
    }
    for (const [attribute, value] of Object.entries(input.weekResult.attributeXpGained)) {
      if (value && value > 0) {
        parts.push(`${attribute.charAt(0).toUpperCase() + attribute.slice(1)} +${value} XP`);
      }
    }
    parts.push(
      `Fatigue ${input.weekResult.fatigueChange >= 0 ? "+" : ""}${input.weekResult.fatigueChange}.`,
    );
    messages.push({
      id: `activity-${quality.activityType}-d${entry.dayIndex}-w${input.state.currentWeek}-${index}`,
      week: input.state.currentWeek,
      season: input.state.currentSeason,
      type: "feedback",
      title: `${ACTIVITY_LABELS[quality.activityType] ?? quality.activityType} (${TIER_LABELS[quality.tier] ?? quality.tier}) — ${DAY_LABELS[entry.dayIndex] ?? `Day ${entry.dayIndex + 1}`}`,
      body: parts.join("\n"),
      read: false,
      actionRequired: false,
    });
  }
  return messages.length > 0
    ? { ...input.state, inbox: [...input.state.inbox, ...messages] }
    : input.state;
}
