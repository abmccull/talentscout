import type {
  ClubDecision,
  GameState,
  ProspectFollowUpDelivery,
  ProspectFollowUpStage,
  ScoutReport,
  ScoutingCase,
} from "@/engine/core/types";

const STAGES: readonly ProspectFollowUpStage[] = [
  "early-check", "decision-point", "accountability",
];
const own = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);
const positiveDate = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export class InvalidProspectFollowUpDeliveryError extends Error {
  constructor(caseId: string) {
    super(`Invalid prospect follow-up delivery authority in case ${caseId}`);
    this.name = "InvalidProspectFollowUpDeliveryError";
  }
}

export function prospectFollowUpMessageId(
  caseId: string,
  sourceId: string,
  stage: ProspectFollowUpStage,
): string {
  return `prospect-follow-up:${caseId}:${sourceId}:${stage}`;
}

/** Validate present authority without repairing, discarding, or defaulting facts. */
export function assertProspectFollowUpDeliveryAuthority(record: ScoutingCase): void {
  const rows: unknown = record.prospectFollowUpDeliveries;
  if (rows === undefined) return;
  if (!Array.isArray(rows)) throw new InvalidProspectFollowUpDeliveryError(record.id);
  const seen = new Set<string>();
  for (const row of rows) {
    if (row === null || typeof row !== "object" || Array.isArray(row)
      || !["sourceId", "stage", "deliveredWeek", "deliveredSeason"].every(key => own(row, key))
      || typeof row.sourceId !== "string" || row.sourceId.trim().length === 0
      || !STAGES.includes(row.stage)
      || !positiveDate(row.deliveredWeek) || !positiveDate(row.deliveredSeason)) {
      throw new InvalidProspectFollowUpDeliveryError(record.id);
    }
    // JSON tuple encoding keeps separator-containing source IDs unambiguous.
    const key = JSON.stringify([row.sourceId, row.stage]);
    if (seen.has(key)) throw new InvalidProspectFollowUpDeliveryError(record.id);
    seen.add(key);
  }
}

/** Keep the first actual date and all extension data on an already recorded tuple. */
export function recordProspectFollowUpDelivery(
  record: ScoutingCase,
  delivery: ProspectFollowUpDelivery,
): ScoutingCase {
  assertProspectFollowUpDeliveryAuthority(record);
  const rows = record.prospectFollowUpDeliveries ?? [];
  if (rows.some(row => row.sourceId === delivery.sourceId && row.stage === delivery.stage)) {
    return record;
  }
  const next = { ...record, prospectFollowUpDeliveries: [...rows, delivery] };
  assertProspectFollowUpDeliveryAuthority(next);
  return next;
}

interface DeliverySourceIndex {
  reportsByCaseId: ReadonlyMap<string, readonly ScoutReport[]>;
  decisionsByCaseId: ReadonlyMap<string, readonly ClubDecision[]>;
}

function buildDeliverySourceIndex(state: GameState): DeliverySourceIndex {
  const reportsByCaseId = new Map<string, ScoutReport[]>();
  const decisionsByCaseId = new Map<string, ClubDecision[]>();
  for (const report of Object.values(state.reports ?? {})) {
    if (!report.caseId) continue;
    const rows = reportsByCaseId.get(report.caseId) ?? [];
    rows.push(report);
    reportsByCaseId.set(report.caseId, rows);
  }
  for (const decision of Object.values(state.clubDecisions ?? {})) {
    if (!decision.caseId) continue;
    const rows = decisionsByCaseId.get(decision.caseId) ?? [];
    rows.push(decision);
    decisionsByCaseId.set(decision.caseId, rows);
  }
  return { reportsByCaseId, decisionsByCaseId };
}

/**
 * Reconcile legacy unknown delivery once using only an exact, unique full ID.
 * Dates come from retained messages. Later stages never imply earlier delivery.
 * A caller-supplied index avoids global report/decision scans during weekly plans.
 * Explicit legacy keys include cases reconstructed by the common loader.
 */
export function reconcileProspectFollowUpDeliveries(
  state: GameState,
  preparedIndex?: DeliverySourceIndex,
  legacyCaseKeys?: ReadonlySet<string>,
): GameState["scoutingCases"] {
  const original = state.scoutingCases ?? {};
  let cases = original;
  const pending = new Set<string>();
  for (const [key, record] of Object.entries(original)) {
    assertProspectFollowUpDeliveryAuthority(record);
    if (record.prospectFollowUpDeliveries === undefined || legacyCaseKeys?.has(key)) {
      pending.add(key);
      if (record.prospectFollowUpDeliveries === undefined) {
        if (cases === original) cases = { ...original };
        cases[key] = { ...record, prospectFollowUpDeliveries: [] };
      }
    }
  }
  if (pending.size === 0) return cases;

  const index = preparedIndex ?? buildDeliverySourceIndex(state);
  type WitnessOwner = { caseKey: string; sourceId: string; stage: ProspectFollowUpStage };
  const owners = new Map<string, WitnessOwner | null>();
  for (const [caseKey, record] of Object.entries(original)) {
    const sourceIds = new Set<string>([
      ...(index.reportsByCaseId.get(record.id) ?? []).map(report => report.id),
      ...(index.decisionsByCaseId.get(record.id) ?? []).map(decision => decision.id),
    ]);
    for (const id of record.reportIds ?? []) {
      const report = state.reports?.[id];
      if (report) sourceIds.add(report.id);
    }
    for (const id of record.decisionIds ?? []) {
      const decision = state.clubDecisions?.[id];
      if (decision) sourceIds.add(decision.id);
    }
    for (const sourceId of sourceIds) for (const stage of STAGES) {
      const id = prospectFollowUpMessageId(record.id, sourceId, stage);
      const previous = owners.get(id);
      if (previous === null) continue;
      if (previous && (previous.caseKey !== caseKey || previous.sourceId !== sourceId)) {
        owners.set(id, null);
      } else if (!previous) {
        owners.set(id, { caseKey, sourceId, stage });
      }
    }
  }
  for (const message of state.inbox ?? []) {
    const owner = owners.get(message.id);
    if (!owner || !pending.has(owner.caseKey)
      || !positiveDate(message.week) || !positiveDate(message.season)) continue;
    const record = cases[owner.caseKey];
    const next = recordProspectFollowUpDelivery(record, {
      sourceId: owner.sourceId,
      stage: owner.stage,
      deliveredWeek: message.week,
      deliveredSeason: message.season,
    });
    if (next !== record) {
      if (cases === original) cases = { ...original };
      cases[owner.caseKey] = next;
    }
  }
  return cases;
}
