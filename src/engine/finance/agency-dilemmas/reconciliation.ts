import type { AccessAgreement } from "@/engine/consequences/accessAgreements";
import type {
  AgencyEmployee,
  ClientRelationship,
  FinancialRecord,
  GameDate,
  GameState,
  RetainerContract,
} from "@/engine/core/types";
import { addGameWeeks } from "@/engine/core/gameDate";
import {
  normalizeAgencyStrategyState,
  type AgencyOperatingPolicy,
  type AgencyStrategyState,
} from "../agencyStrategy";
import { openSatelliteOffice } from "../internationalExpansion";
import { applyBalanceTransaction } from "../expenses";
import { clamp, createLockedUntil, gameDate, normalizeRegion, activeClients } from "./helpers";

function findSelectedAgencyDecision(state: GameState, decisionId: string) {
  const decision = state.consequenceState.decisions[decisionId];
  if (!decision || !decision.selectedOptionId) return undefined;
  return decision;
}

function setAgencyPolicy(
  finances: FinancialRecord,
  policy: AgencyOperatingPolicy,
  now: GameDate,
  focusRegionId?: string,
): FinancialRecord {
  const nextStrategy: AgencyStrategyState = {
    policy,
    selectedAt: { ...now },
    lockedUntil: createLockedUntil(now),
    lastAppliedAt: normalizeAgencyStrategyState(finances.agencyStrategyState)?.lastAppliedAt,
    ...(normalizeRegion(focusRegionId) ? { focusRegionId: normalizeRegion(focusRegionId) } : {}),
  };
  return {
    ...finances,
    agencyStrategyState: nextStrategy,
  };
}

function updateClient(finances: FinancialRecord, clubId: string, delta: number, status?: ClientRelationship["status"]): FinancialRecord {
  return {
    ...finances,
    clientRelationships: (finances.clientRelationships ?? []).map((client) =>
      client.clubId === clubId
        ? {
            ...client,
            satisfaction: clamp(client.satisfaction + delta, 0, 100),
            ...(status ? { status } : {}),
          }
        : client,
    ),
  };
}

function updateEmployees(finances: FinancialRecord, mapper: (employee: AgencyEmployee) => AgencyEmployee): FinancialRecord {
  return {
    ...finances,
    employees: finances.employees.map(mapper),
  };
}

function ensureRetainer(
  finances: FinancialRecord,
  clubId: string,
  now: GameDate,
  monthlyFee: number,
  requiredReportsPerMonth: number,
): FinancialRecord {
  const existingIndex = finances.retainerContracts.findIndex((contract) =>
    contract.clubId === clubId && contract.status === "active",
  );
  if (existingIndex >= 0) {
    return finances;
  }
  const contract: RetainerContract = {
    id: `retainer:agency-dilemma:${clubId}:s${now.season}w${now.week}`,
    clubId,
    tier: 2,
    monthlyFee,
    requiredReportsPerMonth,
    reportsDeliveredThisMonth: 0,
    status: "active",
    startWeek: now.week,
    startSeason: now.season,
    nextSettlementWeek: now.week + 4,
    nextSettlementSeason: now.season,
    termMonths: 4,
    termEndsWeek: now.week + 16,
    termEndsSeason: now.season,
    deliveredReportIds: [],
  };
  return {
    ...finances,
    retainerContracts: [...finances.retainerContracts, contract],
  };
}

function cancelRetainer(finances: FinancialRecord, clubId: string): FinancialRecord {
  return {
    ...finances,
    retainerContracts: finances.retainerContracts.map((contract) =>
      contract.clubId === clubId && contract.status === "active"
        ? { ...contract, status: "suspended" as const }
        : contract,
    ),
  };
}

function appendAppliedFact(state: GameState, decisionId: string, optionId: string): GameState {
  const factId = `fact:${decisionId}:domain-applied`;
  if (state.consequenceState.facts[factId]) return state;
  return {
    ...state,
    consequenceState: {
      ...state.consequenceState,
      facts: {
        ...state.consequenceState.facts,
        [factId]: {
          id: factId,
          kind: "AgencyDilemmaDomainApplied",
          subject: { kind: "agencyDilemma", id: decisionId },
          value: { optionId },
          observedAt: gameDate(state),
          visibility: "private",
          sourceDecisionId: decisionId,
        },
      },
    },
  };
}

function hasAppliedDomainEffect(state: GameState, decisionId: string): boolean {
  return Boolean(state.consequenceState.facts[`fact:${decisionId}:domain-applied`]);
}

function updateContactRegionTrust(
  state: GameState,
  regionId: string | undefined,
  trustDelta: number,
  relationshipDelta: number,
): GameState {
  const normalized = normalizeRegion(regionId);
  if (!normalized) return state;
  return {
    ...state,
    contacts: Object.fromEntries(Object.entries(state.contacts).map(([id, contact]) => [
      id,
      normalizeRegion(contact.country ?? contact.region) === normalized
        ? {
            ...contact,
            trustLevel: clamp((contact.trustLevel ?? contact.relationship) + trustDelta, 0, 100),
            relationship: clamp(contact.relationship + relationshipDelta, 0, 100),
          }
        : contact,
    ])),
  };
}

function addRegionalAccess(state: GameState, regionId: string | undefined, decisionId: string): GameState {
  const normalized = normalizeRegion(regionId);
  if (!normalized) return state;
  const agreementId = `access:agency-dilemma:${decisionId}:${normalized}`;
  if (state.accessAgreements?.[agreementId]) return state;
  const agreement: AccessAgreement = {
    id: agreementId,
    grantor: { kind: "territory", id: normalized },
    beneficiary: { kind: "scout", id: state.scout.id },
    scope: "regionalIntro",
    status: "active",
    exclusive: false,
    confidential: true,
    createdAt: gameDate(state),
    expiresAt: addGameWeeks(state.fixtures, gameDate(state), 10),
    countryId: normalized,
    regionId: normalized,
    sourceDecisionId: decisionId,
    metadata: {
      note: "Agency dilemma regional commitment",
    },
  };
  return {
    ...state,
    accessAgreements: {
      ...(state.accessAgreements ?? {}),
      [agreementId]: agreement,
    },
  };
}

function applyClientConcentrationChoice(state: GameState, decisionId: string, optionId: string): GameState {
  if (!state.finances) return state;
  const decision = findSelectedAgencyDecision(state, decisionId);
  const metadata = decision?.metadata;
  const anchorClientId = typeof metadata?.anchorClientId === "string"
    ? metadata.anchorClientId
    : undefined;
  if (!anchorClientId) return state;
  let finances = state.finances;
  const now = gameDate(state);
  const alternatives = String(metadata?.alternateClientIds ?? "")
    .split("|")
    .filter(Boolean);
  if (optionId === "exclusiveAnchor") {
    finances = setAgencyPolicy(finances, "stableRetainers", now);
    finances = ensureRetainer(finances, anchorClientId, now, 250, 1);
    finances = updateClient(finances, anchorClientId, 10, "active");
    for (const clubId of alternatives) finances = updateClient(finances, clubId, -6);
    finances = applyBalanceTransaction(finances, 1_200, now.week, now.season, "Anchor client advance accepted", `agency-dilemma:${decisionId}:exclusiveAnchor`);
  } else if (optionId === "rebalanceBook") {
    finances = setAgencyPolicy(finances, "marketExpansion", now);
    finances = updateClient(finances, anchorClientId, -8);
    for (const clubId of alternatives.slice(0, 2)) finances = updateClient(finances, clubId, 6);
    finances = applyBalanceTransaction(finances, -450, now.week, now.season, "Client portfolio diversification push", `agency-dilemma:${decisionId}:rebalanceBook`);
  } else if (optionId === "walkAway") {
    finances = setAgencyPolicy(finances, "placementUpside", now);
    finances = cancelRetainer(finances, anchorClientId);
    finances = updateClient(finances, anchorClientId, -16, "cooling");
  }
  return appendAppliedFact({ ...state, finances }, decisionId, optionId);
}

function applyStaffDeadlineChoice(state: GameState, decisionId: string, optionId: string): GameState {
  if (!state.finances) return state;
  const decision = findSelectedAgencyDecision(state, decisionId);
  const metadata = decision?.metadata;
  const deputyEmployeeId = typeof metadata?.deputyEmployeeId === "string"
    ? metadata.deputyEmployeeId
    : undefined;
  let finances = state.finances;
  const now = gameDate(state);
  if (optionId === "rushDeadline") {
    finances = updateEmployees(finances, (employee) => ({
      ...employee,
      fatigue: clamp(employee.fatigue + 10, 0, 100),
      morale: clamp(employee.morale - 6, 0, 100),
    }));
    for (const client of activeClients(finances)) finances = updateClient(finances, client.clubId, 4);
    finances = applyBalanceTransaction(finances, 600, now.week, now.season, "Rush-delivery completion premium", `agency-dilemma:${decisionId}:rushDeadline`);
  } else if (optionId === "protectStandards") {
    finances = setAgencyPolicy(finances, "qualityDiscipline", now);
    finances = updateEmployees(finances, (employee) => ({
      ...employee,
      fatigue: clamp(employee.fatigue - 6, 0, 100),
      morale: clamp(employee.morale + 5, 0, 100),
    }));
    for (const client of activeClients(finances)) finances = updateClient(finances, client.clubId, -4);
    finances = applyBalanceTransaction(finances, -700, now.week, now.season, "Protected report standards and rework cover", `agency-dilemma:${decisionId}:protectStandards`);
  } else if (optionId === "empowerDeputy" && deputyEmployeeId) {
    finances = setAgencyPolicy(finances, "qualityDiscipline", now);
    finances = updateEmployees(finances, (employee) =>
      employee.id === deputyEmployeeId
        ? {
            ...employee,
            morale: clamp(employee.morale + 8, 0, 100),
            fatigue: clamp(employee.fatigue + 4, 0, 100),
            experience: employee.experience + 120,
            weeklyLog: [...employee.weeklyLog, {
              week: now.week,
              season: now.season,
              action: "Agency dilemma: deputy mandate",
              result: "Took ownership of the deadline-critical workflow.",
            }].slice(-16),
          }
        : {
            ...employee,
            morale: clamp(employee.morale + 2, 0, 100),
          });
    for (const client of activeClients(finances)) finances = updateClient(finances, client.clubId, 1);
  }
  return appendAppliedFact({ ...state, finances }, decisionId, optionId);
}

function applyRegionalCommitmentChoice(state: GameState, decisionId: string, optionId: string): GameState {
  if (!state.finances) return state;
  const decision = findSelectedAgencyDecision(state, decisionId);
  const metadata = decision?.metadata;
  const regionId = typeof metadata?.regionId === "string" ? metadata.regionId : undefined;
  const focusRegionId = typeof metadata?.focusRegionId === "string" ? metadata.focusRegionId : undefined;
  let finances = state.finances;
  const now = gameDate(state);
  let updatedState = state;
  if (optionId === "expandFrontier" && regionId) {
    finances = setAgencyPolicy(finances, "marketExpansion", now, regionId);
    const opened = openSatelliteOffice(finances, regionId, now.week, now.season, (finances.actionSequence ?? 0) + 1);
    finances = opened ?? applyBalanceTransaction(finances, -1_200, now.week, now.season, `Advance regional setup in ${regionId}`, `agency-dilemma:${decisionId}:expandFrontier`);
    updatedState = updateContactRegionTrust(updatedState, regionId, 4, 3);
  } else if (optionId === "deepenStronghold" && focusRegionId) {
    finances = setAgencyPolicy(finances, "regionalDepth", now, focusRegionId);
    finances = applyBalanceTransaction(finances, -500, now.week, now.season, `Deepened regional base in ${focusRegionId}`, `agency-dilemma:${decisionId}:deepenStronghold`);
    updatedState = addRegionalAccess(updatedState, focusRegionId, decisionId);
    updatedState = updateContactRegionTrust(updatedState, focusRegionId, 6, 4);
  } else if (optionId === "stayMobile") {
    finances = setAgencyPolicy(finances, "placementUpside", now);
    updatedState = updateContactRegionTrust(updatedState, regionId ?? focusRegionId, 2, 2);
    updatedState = updateContactRegionTrust(updatedState, focusRegionId ?? regionId, 2, 2);
  }
  return appendAppliedFact({ ...updatedState, finances }, decisionId, optionId);
}

function applyCapitalCrossroadsChoice(state: GameState, decisionId: string, optionId: string): GameState {
  if (!state.finances) return state;
  const decision = findSelectedAgencyDecision(state, decisionId);
  const metadata = decision?.metadata;
  const targetClubId = typeof metadata?.targetClubId === "string"
    ? metadata.targetClubId
    : undefined;
  if (!targetClubId) return state;
  let finances = state.finances;
  const now = gameDate(state);
  if (optionId === "investorBridge") {
    finances = setAgencyPolicy(finances, "marketExpansion", now);
    finances = applyBalanceTransaction(finances, 5_000, now.week, now.season, "Minority investor bridge capital", `agency-dilemma:${decisionId}:investorBridge`);
    finances = updateEmployees(finances, (employee) => ({
      ...employee,
      morale: clamp(employee.morale + 3, 0, 100),
    }));
    for (const client of activeClients(finances)) finances = updateClient(finances, client.clubId, -3);
  } else if (optionId === "signatureRetainer") {
    finances = setAgencyPolicy(finances, "stableRetainers", now);
    finances = ensureRetainer(finances, targetClubId, now, 2_400, 3);
    finances = updateClient(finances, targetClubId, 8, "active");
  } else if (optionId === "backJudgment") {
    finances = setAgencyPolicy(finances, "placementUpside", now);
    finances = applyBalanceTransaction(finances, -300, now.week, now.season, "Placement-upside roadshow and trial travel", `agency-dilemma:${decisionId}:backJudgment`);
    for (const client of activeClients(finances)) finances = updateClient(finances, client.clubId, -2);
  }
  return appendAppliedFact({ ...state, finances }, decisionId, optionId);
}

export function reconcileAgencyDilemmaDecisions(state: GameState, _now: GameDate): GameState {
  let updated = state;
  const decisions = Object.values(state.consequenceState.decisions)
    .filter((decision) =>
      decision.source.kind === "agencyDilemma"
      && Boolean(decision.selectedOptionId),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const decision of decisions) {
    if (!decision.selectedOptionId || hasAppliedDomainEffect(updated, decision.id)) continue;
    if (decision.source.id === "clientConcentration") {
      updated = applyClientConcentrationChoice(updated, decision.id, decision.selectedOptionId);
    } else if (decision.source.id === "staffQualityDeadline") {
      updated = applyStaffDeadlineChoice(updated, decision.id, decision.selectedOptionId);
    } else if (decision.source.id === "regionalCommitment") {
      updated = applyRegionalCommitmentChoice(updated, decision.id, decision.selectedOptionId);
    } else if (decision.source.id === "capitalCrossroads") {
      updated = applyCapitalCrossroadsChoice(updated, decision.id, decision.selectedOptionId);
    }
  }
  return updated;
}
