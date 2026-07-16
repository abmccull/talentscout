import type {
  GameModeId,
  GameState,
  RunKind,
  Specialization,
} from "./types";
import { getRunGameModeId, getRunKind } from "../run/runManifest";

/**
 * The persisted GameState remains wire-compatible while the game grows beyond
 * Youth Scout. These facades make ownership explicit without forcing a
 * destructive save-schema rewrite: shared-world facts stay shared, each
 * specialization owns only its practice data, and caches remain disposable.
 */

export const SHARED_WORLD_STATE_KEYS = [
  "seed",
  "runManifest",
  "currentWeek",
  "currentSeason",
  "difficulty",
  "leagues",
  "clubs",
  "players",
  "fixtures",
  "countries",
  "narrativeEvents",
  "activeStorylines",
  "eventDirector",
  "storyDirectorV2",
  "consequenceState",
  "rivalScouts",
  "rivalOrganizationState",
  "unlockedTools",
  "managerProfiles",
  "transferWindow",
  "seasonEvents",
  "dailySchedule",
  "completedScenarioIds",
  "invalidScenarioArchives",
  "playedFixtures",
  "youthTournaments",
  "internationalAssignments",
  "activeInternationalAssignment",
  "internationalAssignmentHistory",
  "retiredPlayerIds",
  "retiredPlayers",
  "playerMovementHistory",
  "worldHistory",
  "worldConditionState",
  "worldConditionArcState",
  "matchRatings",
  "disciplinaryRecords",
  "freeAgentPool",
  "freeAgentNegotiations",
  "activeLoans",
  "loanHistory",
] as const satisfies readonly (keyof GameState)[];

export const SHARED_CAREER_STATE_KEYS = [
  "scout",
  "schedule",
  "weeklyStrategy",
  "jobOffers",
  "performanceReviews",
  "careerChronology",
  "careerMoments",
  "careerStoryArchive",
  "stakeholderProfiles",
  "inbox",
  "npcScouts",
  "npcReports",
  "npcDelegations",
  "leadershipPortfolio",
  "careerRecovery",
  "territories",
  "finances",
  "observations",
  "reports",
  "scoutingCases",
  "reportDeliveries",
  "clubDecisions",
  "contacts",
  "discoveryRecords",
  "performanceHistory",
  "activeScenarioId",
  "completedInteractiveSessions",
  "activeObservationSession",
  "watchlist",
  "contactIntel",
  "scoutingInfrastructure",
  "assistantScouts",
  "eventChains",
  "rivalActivities",
  "boardProfile",
  "boardReactions",
  "gossipItems",
  "satisfactionHistory",
  "seasonAwardsData",
  // Fit assessments are player-facing, report/session-specific working
  // knowledge. They must survive reloads for every career path.
  "systemFitCache",
  "createdAt",
  "lastSaved",
  "totalWeeksPlayed",
] as const satisfies readonly (keyof GameState)[];

export const MODE_STATE_KEYS = {
  youth: [
    "openingCase",
    "veteranPrologue",
    "youthRecruitmentBriefs",
    "recommendationReviews",
    "unsignedYouth",
    "placementReports",
    "gutFeelings",
    "reflectionJournal",
    "alumniRecords",
    "legacyScore",
    "subRegions",
  ],
  firstTeam: [
    "managerDirectives",
    "clubResponses",
    "transferRecords",
    "activeNegotiations",
    "loanRecommendations",
  ],
  regional: ["regionalKnowledge"],
  data: [
    "predictions",
    "dataAnalysts",
    "statisticalProfiles",
    "anomalyFlags",
    "analystReports",
  ],
} as const satisfies Record<Specialization, readonly (keyof GameState)[]>;

/** No persisted GameState field is currently safe to discard on load. */
export const REBUILDABLE_GAME_STATE_CACHE_KEYS = [] as const satisfies readonly (keyof GameState)[];

export type SharedWorldState = Readonly<
  Pick<GameState, (typeof SHARED_WORLD_STATE_KEYS)[number]>
>;

export type SharedCareerState = Readonly<
  Pick<GameState, (typeof SHARED_CAREER_STATE_KEYS)[number]>
>;

export type ModeStateBySpecialization = {
  [Mode in Specialization]: Readonly<
    Pick<GameState, (typeof MODE_STATE_KEYS)[Mode][number]>
  >;
};

export type RebuildableGameStateCaches = Readonly<
  Pick<GameState, (typeof REBUILDABLE_GAME_STATE_CACHE_KEYS)[number]>
>;

export interface GameStatePartitions<Mode extends Specialization = Specialization> {
  sharedWorld: SharedWorldState;
  sharedCareer: SharedCareerState;
  mode: ModeStateBySpecialization[Mode];
  rebuildableCaches: RebuildableGameStateCaches;
}

/** Return a read-only ownership facade over the canonical persisted object. */
export function partitionGameState<Mode extends Specialization>(
  state: GameState,
  mode: Mode = state.runManifest.specialization as Mode,
): GameStatePartitions<Mode> {
  return {
    sharedWorld: state,
    sharedCareer: state,
    mode: state as ModeStateBySpecialization[Mode],
    rebuildableCaches: state,
  };
}

/** Compatibility specialization derived from immutable run identity. */
export function getActiveGameMode(
  state: Pick<GameState, "runManifest">,
): Specialization {
  return state.runManifest.specialization;
}

/** Authoritative product mode used by capability and workspace routing. */
export function getActiveGameModeId(
  state: Pick<GameState, "runManifest">,
): GameModeId {
  return getRunGameModeId(state.runManifest);
}

/** Whether the host mode is an open career or a constrained challenge. */
export function getActiveRunKind(
  state: Pick<GameState, "runManifest">,
): RunKind {
  return getRunKind(state.runManifest);
}

/**
 * Return any enumerable state fields without an ownership classification.
 * This is intentionally runtime-visible so tests catch additions to GameState
 * before a future mode accidentally treats a shared field as private truth.
 */
export function findUnpartitionedGameStateKeys(state: GameState): string[] {
  const owned = new Set<string>([
    ...SHARED_WORLD_STATE_KEYS,
    ...SHARED_CAREER_STATE_KEYS,
    ...Object.values(MODE_STATE_KEYS).flat(),
    ...REBUILDABLE_GAME_STATE_CACHE_KEYS,
  ]);
  return Object.keys(state)
    .filter((key) => !owned.has(key))
    .sort();
}

/** Minimal root shape accepted by a Zustand selector without importing the store. */
export interface GameStateStoreSlice {
  gameState: GameState | null;
}

/**
 * Build a stable narrow selector for one canonical field. Define selectors at
 * module scope (for example `const selectReports = gameStateFieldSelector("reports")`)
 * so screens do not subscribe to the entire game state just to read one record.
 */
export function gameStateFieldSelector<Key extends keyof GameState>(
  key: Key,
): (store: GameStateStoreSlice) => GameState[Key] | null {
  return (store) => store.gameState?.[key] ?? null;
}

/**
 * Compatibility hook for future derived indexes. It intentionally preserves
 * all current data until every consumer has a real rebuild-on-read path.
 */
export function resetRebuildableGameStateCaches(state: GameState): GameState {
  return state;
}
