import type {
  GameState,
  WeekSimulationState,
} from "@/engine/core/types";
import type { ScenarioProgress } from "@/engine/scenarios";
import type {
  ContextualHint,
  GuidedMilestoneId,
  TutorialSequenceId,
} from "@/stores/tutorialStore";
import type { GameScreen, WeekSummary } from "../gameStoreTypes";
import type {
  WeeklyTransactionJob,
  WeeklyWorkerMetrics,
  WeeklyWorkerTelemetry,
} from "@/engine/core/weeklyTransactionProtocol";

/** Player-profile tutorial facts required by weekly presentation decisions. */
export interface WeeklyTutorialSnapshot {
  completedSequences: string[];
  visitedScreens: string[];
  dismissedHints: string[];
  discoveredFeatures: string[];
}

export type WeeklyTutorialCommand =
  | { type: "completeMilestone"; id: GuidedMilestoneId }
  | { type: "startSequence"; id: TutorialSequenceId }
  | { type: "queueSequence"; id: TutorialSequenceId }
  | { type: "showHint"; hint: ContextualHint }
  | { type: "recordFeatureDiscovery"; feature: string };

/**
 * Everything the authoritative weekly transaction reads outside GameState.
 * The payload is structured-clone safe and contains no Zustand functions.
 */
export interface WeeklyWorkerInput {
  gameState: GameState;
  weekSimulation: WeekSimulationState;
  currentScreen: GameScreen;
  isLoaded: boolean;
  tutorial: WeeklyTutorialSnapshot;
}

export interface WeeklyWorkerGameStatePatch {
  changedFields: Partial<GameState>;
  removedFields: Array<keyof GameState>;
}

export type WeeklyWorkerWireState =
  | { kind: "replace"; input: WeeklyWorkerInput }
  | {
      kind: "patch";
      base: {
        seed: string;
        season: number;
        week: number;
        mode: GameState["scout"]["primarySpecialization"];
      };
      gameState: WeeklyWorkerGameStatePatch;
      weekSimulation: WeekSimulationState;
      currentScreen: GameScreen;
      isLoaded: boolean;
      tutorial: WeeklyTutorialSnapshot;
    };

/** Store fields the canonical transaction may commit. */
export interface WeeklyTransactionStorePatch {
  gameState?: GameState | null;
  isLoaded?: boolean;
  currentScreen?: GameScreen;
  lastWeekSummary?: WeekSummary | null;
  scenarioProgress?: ScenarioProgress | null;
  scenarioOutcome?: "victory" | "failure" | null;
  scenarioOutcomeScenarioId?: string | null;
  pendingCelebration?: {
    tier: "minor" | "major" | "epic";
    title: string;
    description: string;
  } | null;
}

export interface WeeklyHeadlessCommit {
  patch: WeeklyTransactionStorePatch;
  tutorialCommands: WeeklyTutorialCommand[];
  simulationPhases?: Array<{
    phase: string;
    elapsedMs: number;
  }>;
}

export type WeeklyGameStateCommit =
  | { kind: "replace"; state: GameState | null }
  | {
      kind: "delta";
      changedFields: Partial<GameState>;
      recordDeltas: Partial<Record<keyof GameState, WeeklyRecordDelta>>;
      arrayDeltas: Partial<Record<keyof GameState, WeeklyArrayDelta>>;
      removedFields: Array<keyof GameState>;
    };

export interface WeeklyRecordDelta {
  changedEntries: Record<string, WeeklyValueDelta>;
  removedEntries: string[];
}

export interface WeeklyArrayDelta {
  nextLength: number;
  changedEntries: Record<string, WeeklyValueDelta>;
}

export type WeeklyValueDelta =
  | { kind: "replace"; value: unknown }
  | { kind: "record"; delta: WeeklyRecordDelta }
  | { kind: "array"; delta: WeeklyArrayDelta }
  | {
      kind: "array-window";
      dropFirst: number;
      append: unknown[];
    };

/** Compact worker response; unchanged GameState branches never cross back. */
export interface WeeklyWorkerCommit {
  patch: Omit<WeeklyTransactionStorePatch, "gameState">;
  gameState: WeeklyGameStateCommit;
  tutorialCommands: WeeklyTutorialCommand[];
  metrics: WeeklyWorkerMetrics;
}

export interface WeeklyWorkerExecution {
  commit: WeeklyWorkerCommit;
  /** Materialized once so the live store and worker cache share one base. */
  materializedCommit?: WeeklyHeadlessCommit;
  route: "worker" | "main-thread-fallback";
  fallbackReason?: "worker-unavailable" | "worker-failed" | "worker-response-mismatch";
  telemetry: WeeklyWorkerTelemetry;
}

export interface WeeklyWorkerErrorPayload {
  name: string;
  message: string;
  stack?: string;
}

/** Browser-native structured-clone request; avoids redundant JSON encode/parse. */
export interface WeeklyWorkerWireRequest {
  kind: "weekly-transaction-request";
  protocolVersion: 1;
  job: WeeklyTransactionJob;
  state: WeeklyWorkerWireState;
}

export type WeeklyWorkerMessage =
  | {
      kind: "weekly-transaction-result";
      protocolVersion: 1;
      jobId: string;
      source: {
        seed: string;
        mode: GameState["scout"]["primarySpecialization"];
        season: number;
        week: number;
      };
      state: WeeklyWorkerCommit;
    }
  | {
      kind: "weekly-transaction-error";
      protocolVersion: 1;
      jobId: string;
      error: WeeklyWorkerErrorPayload;
    };
