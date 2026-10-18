import type { GameState } from "@/engine/core/types";
import {
  expandPlayerMovementHistory,
  expandPlayerMovementSummaries,
  InvalidMovementRowsArchiveError,
  type StoredPlayerMovementSummaries,
} from "@/engine/world/movementRowsArchive";
import {
  expandObservationSituationSnapshot,
  InvalidObservationSituationArchiveError,
} from "@/engine/observation/situationArchive";
import { SaveMigrationError } from "./saveEnvelope";

/** Validate recognized history formats on original descriptors before cloning or repair. */
export function assertStoredHistoryArchives(candidate: object): void {
  const dataValue = (value: unknown, key: string): unknown => {
    if (value === null || typeof value !== "object") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) return undefined;
    if (!Object.hasOwn(descriptor, "value")) {
      throw new SaveMigrationError("CORRUPT_SAVE", `Stored history field ${key} must be a data property`);
    }
    return descriptor.value;
  };
  const visitRows = (value: unknown, visit: (row: unknown) => void): void => {
    if (!Array.isArray(value)) return;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor) continue;
      if (!Object.hasOwn(descriptor, "value")) {
        throw new SaveMigrationError("CORRUPT_SAVE", `Stored history row ${index} must be a data property`);
      }
      visit(descriptor.value);
    }
  };
  try {
    const movements = dataValue(candidate, "playerMovementHistory");
    if (movements !== undefined && movements !== null) {
      expandPlayerMovementHistory(movements as GameState["playerMovementHistory"]);
    }
    visitRows(dataValue(dataValue(candidate, "worldHistory"), "seasons"), (season) => {
      const summaries = dataValue(season, "playerMovementSummaries");
      if (summaries !== undefined && summaries !== null) {
        expandPlayerMovementSummaries(summaries as StoredPlayerMovementSummaries);
      }
    });
    const observations = dataValue(candidate, "observations");
    if (observations !== null && typeof observations === "object" && !Array.isArray(observations)) {
      for (const id of Object.getOwnPropertyNames(observations)) {
        expandObservationSituationSnapshot(dataValue(dataValue(observations, id), "situation"));
      }
    }
  } catch (error) {
    if (error instanceof InvalidMovementRowsArchiveError) {
      throw new SaveMigrationError(error.code, error.message);
    }
    if (error instanceof InvalidObservationSituationArchiveError) {
      throw new SaveMigrationError("CORRUPT_SAVE", error.message);
    }
    throw error;
  }
}
