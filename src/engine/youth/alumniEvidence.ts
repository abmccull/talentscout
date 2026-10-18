import type { AlumniRecord, AlumniStatus } from "@/engine/core/types";

/** New alumni facts must identify their committed fixture or movement source. */
export function isSourcedAlumniEvent(event: { sourceId?: string }): boolean {
  return typeof event.sourceId === "string" && event.sourceId.trim().length > 0;
}

/** Historical payload alone cannot establish a verified senior breakthrough. */
export function hasRecordedSeniorAppearance(record: AlumniRecord): boolean {
  return record.milestones.some(event => event.type === "firstTeamDebut" && isSourcedAlumniEvent(event))
    || record.seasonStats.some(stats => stats.source === "canonicalCompetition" && stats.appearances > 0);
}

export function deriveAlumniDisplayStatus(record: AlumniRecord): AlumniStatus {
  const status = record.currentStatus ?? "academy";
  return status === "firstTeam" && !hasRecordedSeniorAppearance(record) ? "academy" : status;
}

/** Keep old story text visible while making its missing provenance explicit. */
export function describeAlumniHistory(event: { sourceId?: string; description: string }): string {
  return isSourcedAlumniEvent(event)
    ? event.description
    : `Legacy entry (source unavailable): ${event.description}`;
}
