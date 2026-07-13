/**
 * Versioned persistence envelope shared by IndexedDB and Steam Cloud records.
 *
 * Schema versions describe the serialized save shape. Rules versions describe
 * simulation semantics and are deliberately independent so balance changes do
 * not force a storage migration.
 */

import { createConsequenceEngineState } from "@/engine/consequences";
import { createEventDirectorState } from "@/engine/events/eventDirector";
import {
  RUN_RULES_VERSION,
  createRunManifest,
} from "@/engine/run";
import {
  migratePlayerExperience,
  readPlayerExperience,
  type PlayerExperienceRecord,
} from "@/lib/playerExperience";

export const CURRENT_SAVE_SCHEMA_VERSION = 4;
export const CURRENT_RULES_VERSION = RUN_RULES_VERSION;
export const CURRENT_BUILD_VERSION =
  process.env.NEXT_PUBLIC_BUILD_VERSION ?? "development";

// Migration outputs are historical contracts. Never replace these literals
// with CURRENT_* constants: doing so would make identical old bytes migrate to
// different state after a future rules/content release.
const V1_TO_V2_RULES_VERSION = "youth-ea.2";
const V2_TO_V3_RULES_VERSION = "youth-ea.3";
const V2_TO_V3_CONTENT_VERSION = "run-content.1";
// Schema 4 adds profile experience metadata only; simulation rules stay pinned.
const V3_TO_V4_RULES_VERSION = V2_TO_V3_RULES_VERSION;

export type SaveMigrationErrorCode =
  | "CORRUPT_SAVE"
  | "INVALID_VERSION"
  | "FUTURE_VERSION"
  | "MISSING_MIGRATION";

export class SaveMigrationError extends Error {
  constructor(
    public readonly code: SaveMigrationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SaveMigrationError";
  }
}

export interface SaveEnvelope<TState = unknown> {
  schemaVersion: number;
  rulesVersion: string;
  buildVersion: string;
  savedAt: number;
  /** Added in schema 4; optional in public metadata types for legacy callers. */
  playerExperience?: PlayerExperienceRecord;
  state: TState;
}

type MutableEnvelope = Record<string, unknown> & SaveEnvelope<unknown>;
type SaveMigration = (envelope: MutableEnvelope) => MutableEnvelope;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Legacy records had metadata and state, but no explicit schema fields. */
const migrateV0ToV1: SaveMigration = (legacy) => ({
  ...legacy,
  schemaVersion: 1,
  rulesVersion:
    typeof legacy.rulesVersion === "string"
      ? legacy.rulesVersion
      : "legacy-pre-versioning",
  buildVersion:
    typeof legacy.buildVersion === "string"
      ? legacy.buildVersion
      : "legacy-pre-versioning",
  savedAt:
    typeof legacy.savedAt === "number" && Number.isFinite(legacy.savedAt)
      ? legacy.savedAt
      : 0,
});

/**
 * Adds the academy-placement case records without rewriting historical
 * judgments. Old cases and decisions are enriched only with derived links and
 * empty collections, so the migration is deterministic and idempotent.
 */
const migrateV1ToV2: SaveMigration = (legacy) => {
  if (!isRecord(legacy.state)) {
    return {
      ...legacy,
      schemaVersion: 2,
      rulesVersion: V1_TO_V2_RULES_VERSION,
    };
  }
  const state = legacy.state;
  const rawCases = isRecord(state.scoutingCases) ? state.scoutingCases : {};
  const scoutingCases = Object.fromEntries(
    Object.entries(rawCases).map(([id, value]) => {
      if (!isRecord(value)) return [id, value];
      const reportIds = Array.isArray(value.reportIds)
        ? value.reportIds.filter((entry): entry is string => typeof entry === "string")
        : [];
      return [id, {
        ...value,
        hypothesisIds: Array.isArray(value.hypothesisIds) ? value.hypothesisIds : [],
        reviewIds: Array.isArray(value.reviewIds) ? value.reviewIds : [],
        activeReportId:
          typeof value.activeReportId === "string"
            ? value.activeReportId
            : reportIds.at(-1),
      }];
    }),
  );
  const rawDecisions = isRecord(state.clubDecisions) ? state.clubDecisions : {};
  const clubDecisions = Object.fromEntries(
    Object.entries(rawDecisions).map(([id, value]) => {
      if (!isRecord(value)) return [id, value];
      return [id, {
        ...value,
        reasons: Array.isArray(value.reasons)
          ? value.reasons
          : typeof value.reason === "string"
            ? [value.reason]
            : [],
      }];
    }),
  );

  return {
    ...legacy,
    schemaVersion: 2,
    rulesVersion: V1_TO_V2_RULES_VERSION,
    state: {
      ...state,
      scoutingCases,
      clubDecisions,
      youthRecruitmentBriefs: isRecord(state.youthRecruitmentBriefs)
        ? state.youthRecruitmentBriefs
        : {},
      recommendationReviews: isRecord(state.recommendationReviews)
        ? state.recommendationReviews
        : {},
    },
  };
};

function migratedSpecialization(value: unknown): "youth" | "firstTeam" | "regional" | "data" {
  return value === "firstTeam" || value === "regional" || value === "data"
    ? value
    : "youth";
}

function migratedDifficulty(value: unknown): "casual" | "normal" | "hard" | "ironman" {
  return value === "casual" || value === "hard" || value === "ironman"
    ? value
    : "normal";
}

/** Pins run identity and initializes the causal decision projection. */
const migrateV2ToV3: SaveMigration = (legacy) => {
  if (!isRecord(legacy.state)) {
    return {
      ...legacy,
      schemaVersion: 3,
      rulesVersion: V2_TO_V3_RULES_VERSION,
    };
  }

  const state = legacy.state;
  const scout = isRecord(state.scout) ? state.scout : {};
  const selectedCountries = Array.isArray(state.countries)
    ? state.countries.filter((entry): entry is string =>
        typeof entry === "string" && entry.trim().length > 0)
    : [];
  if (selectedCountries.length === 0) selectedCountries.push("england");
  const rootSeed = typeof state.seed === "string" && state.seed.trim().length > 0
    ? state.seed
    : "legacy-import";
  const runManifest = isRecord(state.runManifest)
    ? state.runManifest
    : createRunManifest({
        rootSeed,
        specialization: migratedSpecialization(scout.primarySpecialization),
        difficulty: migratedDifficulty(state.difficulty),
        selectedCountries,
        startingCountry: selectedCountries[0],
        integrity: "legacy-import",
        creationRulesVersion: "legacy-pre-run-manifest",
        contentVersion: V2_TO_V3_CONTENT_VERSION,
      });

  return {
    ...legacy,
    schemaVersion: 3,
    rulesVersion: V2_TO_V3_RULES_VERSION,
    state: {
      ...state,
      runManifest,
      consequenceState: createConsequenceEngineState(
        (isRecord(state.consequenceState) ? state.consequenceState : {}) as Partial<
          import("@/engine/consequences").ConsequenceEngineState
        >,
      ),
      eventDirector: createEventDirectorState(
        (isRecord(state.eventDirector) ? state.eventDirector : {}) as Partial<
          import("@/engine/events/eventDirector").EventDirectorState
        >,
      ),
    },
  };
};

/** Carries account-level onboarding experience with every save backend. */
const migrateV3ToV4: SaveMigration = (legacy) => ({
  ...legacy,
  schemaVersion: 4,
  rulesVersion: V3_TO_V4_RULES_VERSION,
  playerExperience: migratePlayerExperience(legacy.playerExperience),
});

/** Ordered by the version they consume. Never mutate an existing migration. */
const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = Object.freeze({
  0: migrateV0ToV1,
  1: migrateV1ToV2,
  2: migrateV2ToV3,
  3: migrateV3ToV4,
});

function assertEnvelopeShape(raw: Record<string, unknown>): asserts raw is MutableEnvelope {
  if (!("state" in raw) || !isRecord(raw.state)) {
    throw new SaveMigrationError(
      "CORRUPT_SAVE",
      "Invalid save data: missing object state payload",
    );
  }

  if (
    typeof raw.savedAt !== "number" ||
    !Number.isFinite(raw.savedAt) ||
    raw.savedAt < 0
  ) {
    throw new SaveMigrationError(
      "CORRUPT_SAVE",
      "Invalid save data: savedAt must be a non-negative timestamp",
    );
  }

  if (typeof raw.rulesVersion !== "string" || raw.rulesVersion.length === 0) {
    throw new SaveMigrationError(
      "CORRUPT_SAVE",
      "Invalid save data: missing rulesVersion",
    );
  }

  if (typeof raw.buildVersion !== "string" || raw.buildVersion.length === 0) {
    throw new SaveMigrationError(
      "CORRUPT_SAVE",
      "Invalid save data: missing buildVersion",
    );
  }
}

/**
 * Upgrade a persisted save envelope to the current schema.
 *
 * This function is pure: callers can retain the original bytes for recovery,
 * and running it twice produces the same result.
 */
export function migrateSaveEnvelope(raw: unknown): SaveEnvelope<unknown> & Record<string, unknown> {
  if (!isRecord(raw)) {
    throw new SaveMigrationError(
      "CORRUPT_SAVE",
      "Invalid save data: expected an object envelope",
    );
  }

  const suppliedVersion = raw.schemaVersion ?? 0;
  if (
    typeof suppliedVersion !== "number" ||
    !Number.isInteger(suppliedVersion) ||
    suppliedVersion < 0
  ) {
    throw new SaveMigrationError(
      "INVALID_VERSION",
      "Invalid save data: schemaVersion must be a non-negative integer",
    );
  }

  if (suppliedVersion > CURRENT_SAVE_SCHEMA_VERSION) {
    throw new SaveMigrationError(
      "FUTURE_VERSION",
      `Save schema ${suppliedVersion} is newer than supported schema ${CURRENT_SAVE_SCHEMA_VERSION}`,
    );
  }

  let working = { ...raw, schemaVersion: suppliedVersion } as MutableEnvelope;
  while (working.schemaVersion < CURRENT_SAVE_SCHEMA_VERSION) {
    const migration = SAVE_MIGRATIONS[working.schemaVersion];
    if (!migration) {
      throw new SaveMigrationError(
        "MISSING_MIGRATION",
        `No migration registered for save schema ${working.schemaVersion}`,
      );
    }

    const previousVersion = working.schemaVersion;
    working = migration({ ...working });
    if (working.schemaVersion !== previousVersion + 1) {
      throw new SaveMigrationError(
        "MISSING_MIGRATION",
        `Migration ${previousVersion} did not advance exactly one schema version`,
      );
    }
  }

  // Player experience has its own version lifecycle inside schema 4. Normalize
  // it even when the outer envelope is already current.
  working = {
    ...working,
    playerExperience: migratePlayerExperience(working.playerExperience),
  };

  assertEnvelopeShape(working);
  return working;
}

export function createSaveEnvelope<TState>(
  state: TState,
  savedAt = Date.now(),
  playerExperience = readPlayerExperience(),
): SaveEnvelope<TState> {
  return {
    schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
    rulesVersion: CURRENT_RULES_VERSION,
    buildVersion: CURRENT_BUILD_VERSION,
    savedAt,
    playerExperience: migratePlayerExperience(playerExperience),
    state,
  };
}

/** Read profile experience without accepting a legacy raw GameState as one. */
export function extractSavePlayerExperience(
  raw: unknown,
): PlayerExperienceRecord | null {
  if (
    isRecord(raw)
    && ("schemaVersion" in raw
      || ("state" in raw && "savedAt" in raw && "buildVersion" in raw))
  ) {
    return migratePlayerExperience(migrateSaveEnvelope(raw).playerExperience);
  }
  return null;
}

/**
 * Accept either a current/versioned cloud payload or the legacy raw GameState
 * JSON used before save envelopes were introduced.
 */
export function extractSaveStatePayload(raw: unknown): unknown {
  if (
    isRecord(raw) &&
    ("schemaVersion" in raw ||
      ("state" in raw && "savedAt" in raw && "buildVersion" in raw))
  ) {
    return migrateSaveEnvelope(raw).state;
  }
  return raw;
}
