import type { GameState } from "@/engine/core/types";
import {
  expandClubFinancialObligation,
  expandLoanDeal,
  InvalidTerminalRecordArchiveError,
} from "@/engine/finance/terminalRecordArchive";
import { SaveMigrationError } from "./saveEnvelope";

/** Refuse accessor ancestry before clone or normalization can evaluate or erase it. */
export function assertStoredFinancialArchives(candidate: object): void {
  const dataValue = (value: unknown, key: string): unknown => {
    if (value === null || typeof value !== "object") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) return undefined;
    if (!Object.hasOwn(descriptor, "value")) {
      throw new SaveMigrationError("CORRUPT_SAVE", `Stored financial field ${key} must be a data property`);
    }
    return descriptor.value;
  };
  const visitRows = (value: unknown, visit: (row: unknown) => void): void => {
    if (!Array.isArray(value)) return;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor) continue;
      if (!Object.hasOwn(descriptor, "value")) {
        throw new SaveMigrationError("CORRUPT_SAVE", `Stored financial row ${index} must be a data property`);
      }
      visit(descriptor.value);
    }
  };
  try {
    visitRows(dataValue(candidate, "loanHistory"), row => {
      expandLoanDeal(row as NonNullable<GameState["loanHistory"]>[number]);
    });
    const clubs = dataValue(candidate, "clubs");
    if (clubs !== null && typeof clubs === "object" && !Array.isArray(clubs)) {
      for (const clubId of Object.getOwnPropertyNames(clubs)) {
        const club = dataValue(clubs, clubId);
        visitRows(dataValue(club, "financialObligations"), row => {
          expandClubFinancialObligation(row as NonNullable<GameState["clubs"][string]["financialObligations"]>[number]);
        });
      }
    }
  } catch (error) {
    if (error instanceof InvalidTerminalRecordArchiveError) {
      throw new SaveMigrationError("CORRUPT_SAVE", error.message);
    }
    throw error;
  }
}
