"use client";

import { getCoursePlannerStatusModel } from "@/engine/career/courses";
import type {
  CourseEnrollment,
  DiscoveryRecord,
  GameState,
  PerformanceReview,
  Scout,
  ScoutAttribute,
  ScoutSkill,
} from "@/engine/core/types";

export const SKILL_LABELS: Record<ScoutSkill, string> = {
  technicalEye: "Technical Eye",
  physicalAssessment: "Physical Assessment",
  psychologicalRead: "Psychological Read",
  tacticalUnderstanding: "Tactical Understanding",
  dataLiteracy: "Data Literacy",
  playerJudgment: "Player Judgment",
  potentialAssessment: "Potential Assessment",
};

export const ATTRIBUTE_LABELS: Record<ScoutAttribute, string> = {
  networking: "Networking",
  persuasion: "Persuasion",
  endurance: "Endurance",
  adaptability: "Adaptability",
  memory: "Memory",
  intuition: "Intuition",
};

export const SPEC_LABELS: Record<string, string> = {
  youth: "Youth Scout",
  firstTeam: "First Team Scout",
  regional: "Regional Expert",
  data: "Data Scout",
};

export type CareerWorkspaceTab =
  | "overview"
  | "development"
  | "trackRecord"
  | "finances";

export const CAREER_TAB_ITEMS: Array<{ value: CareerWorkspaceTab; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "development", label: "Development" },
  { value: "trackRecord", label: "Track Record" },
  { value: "finances", label: "Finances" },
];

export type CareerMetricTone =
  | "default"
  | "emerald"
  | "amber"
  | "blue"
  | "violet"
  | "red";

export interface CareerMetricTileProps {
  label: string;
  value: string;
  helper?: string;
  tone?: CareerMetricTone;
}

export interface CareerTimelineEntry {
  id: string;
  season: number;
  week: number;
  label: string;
  title: string;
  description: string;
  tone: Exclude<CareerMetricTone, "violet">;
}

export function getCareerCourseSummary(input: {
  activeCourseDurationWeeks?: number;
  activeEnrollment?: CourseEnrollment | null;
  completedCourseCount: number;
  currentWeek: number;
  currentSeason: number;
  scheduledStudySessions: number;
  seasonLength: number;
}): string {
  const {
    activeCourseDurationWeeks,
    activeEnrollment,
    completedCourseCount,
    currentWeek,
    currentSeason,
    scheduledStudySessions,
    seasonLength,
  } = input;

  if (!activeEnrollment) {
    return `${completedCourseCount} completed`;
  }

  const status = getCoursePlannerStatusModel({
    activeEnrollment,
    courseDurationWeeks: activeCourseDurationWeeks,
    currentWeek,
    currentSeason,
    scheduledStudySessions,
    seasonLength,
  });
  if (!status) {
    return "Training enrolled - Planner study required";
  }

  if (status.studyWeeksPlanned >= 2) {
    return `${status.progressLabel} - intensive pace booked`;
  }
  if (status.studyWeeksPlanned === 1) {
    return `${status.progressLabel} - normal pace booked`;
  }
  return `${status.progressLabel} - Planner study required`;
}

export function formatSalary(salary: number): string {
  if (salary >= 1000) return `\u00a3${(salary / 1000).toFixed(1)}K/wk`;
  return `\u00a3${salary}/wk`;
}

export function formatBalance(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}\u00a3${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}\u00a3${(abs / 1_000).toFixed(0)}K`;
  return `${sign}\u00a3${abs}`;
}

export function formatWeekSeason(season: number, week: number): string {
  return `S${season} W${week}`;
}

export function formatExpenseLabel(label: string): string {
  return label
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}

export function getCareerBaseLabel(scout: Scout, clubName?: string): string {
  if (clubName) return clubName;
  return scout.careerPath === "independent" ? "Own practice" : "Available";
}

export function formatMovementLabel(type: string): string {
  switch (type) {
    case "permanentTransfer":
      return "Transfer";
    case "loanStart":
      return "Loan move";
    case "loanReturn":
      return "Loan return";
    case "loanRecall":
      return "Loan recall";
    case "loanBuyOption":
      return "Loan option";
    case "release":
      return "Released";
    case "freeAgentSigning":
      return "Free signing";
    case "contractRenewal":
      return "Renewed";
    case "retirement":
      return "Retired";
    case "footballExit":
      return "Exited football";
    case "youthSigning":
      return "Academy intake";
    default:
      return type.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
  }
}

export function deriveTransferCareerStats(transferRecords: GameState["transferRecords"]) {
  const completedTransfers = transferRecords.filter(
    (record) =>
      record.outcome === "hit"
      || record.outcome === "decent"
      || record.outcome === "flop",
  );
  const hitCount = transferRecords.filter((record) => record.outcome === "hit").length;
  const hitRate = completedTransfers.length > 0
    ? Math.round((hitCount / completedTransfers.length) * 100)
    : null;

  return {
    completedTransfers,
    hitCount,
    hitRate,
    decentCount: transferRecords.filter((record) => record.outcome === "decent").length,
    flopCount: transferRecords.filter((record) => record.outcome === "flop").length,
  };
}

export function derivePredictionCareerStats(predictions: GameState["predictions"]) {
  const resolvedPredictions = predictions.filter((prediction) => prediction.resolved);
  const correctPredictions = resolvedPredictions.filter(
    (prediction) => prediction.wasCorrect === true,
  );
  const predictionAccuracy = resolvedPredictions.length > 0
    ? Math.round((correctPredictions.length / resolvedPredictions.length) * 100)
    : null;
  const oracleStreak = (() => {
    let streak = 0;
    const sorted = [...resolvedPredictions].sort(
      (left, right) =>
        right.madeInSeason - left.madeInSeason
        || right.madeInWeek - left.madeInWeek,
    );
    for (const prediction of sorted) {
      if (prediction.wasCorrect === true) streak += 1;
      else break;
    }
    return streak;
  })();

  return {
    resolvedPredictions,
    correctPredictions,
    predictionAccuracy,
    oracleStreak,
    isOracle:
      predictionAccuracy !== null
      && predictionAccuracy >= 70
      && resolvedPredictions.length >= 10,
  };
}

export function buildCareerTimeline(input: {
  discoveryRecords: DiscoveryRecord[];
  discoveredPlayerIds: Set<string>;
  gameState: GameState;
  playerFacingDiscoveryById: Map<string, { isHighUpsideProjection?: boolean }>;
}): CareerTimelineEntry[] {
  const { discoveryRecords, discoveredPlayerIds, gameState, playerFacingDiscoveryById } = input;

  return [
    ...discoveryRecords.map((record) => {
      const player =
        gameState.players[record.playerId] ?? gameState.retiredPlayers?.[record.playerId];
      const summary = playerFacingDiscoveryById.get(record.playerId);
        return {
          id: `discovery-${record.playerId}`,
          season: record.discoveredSeason,
          week: record.discoveredWeek,
          label: "Discovery",
          title: player ? `${player.firstName} ${player.lastName}` : "Youth prospect",
          description: summary?.isHighUpsideProjection
            ? "Your original report projected high upside."
            : "Added to your professional scouting record.",
          tone: summary?.isHighUpsideProjection
            ? ("amber" as const)
            : ("emerald" as const),
        };
    }),
    ...discoveryRecords
      .filter((record) => record.placementSeason != null && record.placementWeek != null)
      .map((record) => {
        const player =
          gameState.players[record.playerId] ?? gameState.retiredPlayers?.[record.playerId];
        const club = record.placementClubId
          ? gameState.clubs[record.placementClubId]
          : undefined;
        return {
          id: `placement-${record.playerId}-${record.placementSeason}-${record.placementWeek}`,
          season: record.placementSeason!,
          week: record.placementWeek!,
          label: "Placement",
          title: player ? `${player.firstName} ${player.lastName}` : "Youth prospect",
          description: `Placed with ${club?.name ?? "a professional academy"}${
            record.placementType
              ? ` via ${
                record.placementType === "academyIntake"
                  ? "academy intake"
                  : "youth contract"
              }`
              : ""
          }.`,
          tone: "blue" as const,
        };
      }),
    ...(gameState.playerMovementHistory ?? [])
      .filter((movement) => discoveredPlayerIds.has(movement.playerId))
      .map((movement) => {
        const player =
          gameState.players[movement.playerId] ?? gameState.retiredPlayers?.[movement.playerId];
        const fromClub = movement.fromClubId
          ? gameState.clubs[movement.fromClubId]
          : undefined;
        const toClub = movement.toClubId ? gameState.clubs[movement.toClubId] : undefined;
        const route = fromClub || toClub
          ? `${fromClub?.shortName ?? "Free agent"} to ${toClub?.shortName ?? "out of football"}`
          : movement.reason ?? "Career status updated";
        return {
          id: `movement-${movement.id}`,
          season: movement.season,
          week: movement.week,
          label: formatMovementLabel(movement.type),
          title: player ? `${player.firstName} ${player.lastName}` : "Tracked prospect",
          description: `${route}${movement.fee ? ` for ${formatBalance(movement.fee)}` : ""}.`,
          tone:
            movement.type === "retirement" || movement.type === "footballExit"
              ? ("default" as const)
              : movement.type === "release"
                ? ("red" as const)
                : ("blue" as const),
        };
      }),
  ]
    .sort((left, right) => right.season - left.season || right.week - left.week)
    .slice(0, 40);
}

export function summarizeLatestReview(
  performanceReviews: PerformanceReview[],
): PerformanceReview | undefined {
  return performanceReviews.at(-1);
}
