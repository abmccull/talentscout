import type { ArchivedInjury, Injury, InjuryHistory } from "../core/types";

/** Reconstruct original incident data, not the live recovery countdown. */
export function expandHistoricalInjury(entry: ArchivedInjury, ownerId: string): Injury {
  if (Array.isArray(entry)) {
    const [id, type, severity, recoveryWeeks, occurredWeek, occurredSeason] = entry;
    return { id, type, severity, recoveryWeeks, occurredWeek, occurredSeason,
      playerId: ownerId, weeksRemaining: recoveryWeeks, reinjuryRisk: 0 };
  }
  return {
    ...entry,
    playerId: entry.playerId ?? ownerId,
    weeksRemaining: entry.weeksRemaining ?? entry.recoveryWeeks,
    reinjuryRisk: entry.reinjuryRisk ?? 0,
  };
}

/** Omit only values exactly implied by the archive; preserve all exceptions. */
export function compactHistoricalInjury(entry: ArchivedInjury, ownerId: string): ArchivedInjury {
  if (Array.isArray(entry)) return entry;
  const omitPlayer = entry.playerId === ownerId;
  const omitWeeks = entry.weeksRemaining === entry.recoveryWeeks;
  const omitRisk = entry.reinjuryRisk === 0;
  const compacted = { ...entry };
  if (omitPlayer) delete compacted.playerId;
  if (omitWeeks) delete compacted.weeksRemaining;
  if (omitRisk) delete compacted.reinjuryRisk;
  const keys = ["id", "type", "severity", "recoveryWeeks", "occurredWeek", "occurredSeason"];
  if (Object.keys(compacted).every(key => keys.includes(key))
    && keys.every(key => compacted[key as keyof typeof compacted] !== undefined)) {
    return [compacted.id, compacted.type, compacted.severity, compacted.recoveryWeeks,
      compacted.occurredWeek, compacted.occurredSeason];
  }
  // Match detail, exceptional defaults and unknown extension fields retain the
  // object form so packing never discards information.
  return !omitPlayer && !omitWeeks && !omitRisk ? entry : compacted;
}

export function compactInjuryArchive(history: InjuryHistory): InjuryHistory {
  const injuries = history.injuries.map((entry) => compactHistoricalInjury(entry, history.playerId));
  return injuries.every((entry, index) => entry === history.injuries[index])
    ? history : { ...history, injuries };
}
