import type { GameState } from "@/engine/core/types";
import { calculateAgencyHealth } from "../dashboard";
import { deriveAgencyStrategicPressure } from "../agencyStrategy";
import { buildImmediateOption } from "./effects";
import {
  activeClients,
  activeRetainers,
  alternateRegions,
  currentFocusRegion,
  sortedByRevenue,
  sortedEmployees,
} from "./helpers";
import type { AgencyDilemmaContext } from "./types";
import { createNamedRNG } from "@/engine/run";

function relationshipRevenueConcentration(state: GameState): number {
  const finances = state.finances;
  if (!finances) return 0;
  const clients = sortedByRevenue(activeClients(finances));
  if (clients.length < 2) return 0;
  const totalRevenue = clients.reduce(
    (sum, client) => sum + Math.max(0, client.totalRevenue ?? 0),
    0,
  );
  if (totalRevenue <= 0) return 0;
  return Math.max(0, clients[0]?.totalRevenue ?? 0) / totalRevenue;
}

function hasResolvedCapitalCrossroads(state: GameState): boolean {
  const currentDecisions = Object.values(state.consequenceState.decisions).some((decision) =>
    decision.source.kind === "agencyDilemma"
    && decision.source.id === "capitalCrossroads"
    && Boolean(decision.selectedOptionId),
  );
  if (currentDecisions) return true;
  const historicalDecisions = (state.consequenceState.history ?? []).some((record) =>
    record.source.kind === "agencyDilemma"
    && record.source.id === "capitalCrossroads"
    && Boolean(record.selectedOptionId),
  );
  if (historicalDecisions) return true;
  return Object.values(state.consequenceState.facts).some((fact) =>
    fact.kind === "AgencyDilemmaDomainApplied"
    && typeof fact.sourceDecisionId === "string"
    && fact.sourceDecisionId.includes(":capitalCrossroads:"),
  );
}

function resolveConcentrationContext(state: GameState): AgencyDilemmaContext | undefined {
  const finances = state.finances;
  if (!finances) return undefined;
  const clients = sortedByRevenue(activeClients(finances));
  if (clients.length < 2) return undefined;
  const pressure = deriveAgencyStrategicPressure(finances, state.scout);
  const relationshipConcentration = relationshipRevenueConcentration(state);
  const effectiveConcentration = Math.max(
    pressure.clientConcentration,
    relationshipConcentration,
  );
  if (effectiveConcentration < 0.58) return undefined;
  const anchor = clients[0];
  const alternatives = clients.slice(1).map((client) => client.clubId);
  return {
    id: "clientConcentration",
    title: "One client is starting to own the agency",
    premise: `${state.clubs[anchor.clubId]?.name ?? anchor.clubId} now represents too much of your monthly security. You can lean into the account, rebalance the book, or deliberately step away before one client owns your judgment.`,
    pressureScore: Math.round(effectiveConcentration * 100),
    semanticSignature: "agency:client-concentration",
    anchorClientId: anchor.clubId,
    alternateClientIds: alternatives,
    cast: [{ kind: "club", id: anchor.clubId }],
    topics: [{ kind: "club", id: anchor.clubId }],
    options: [
      buildImmediateOption({
        state,
        context: {
          id: "clientConcentration",
          title: "",
          premise: "",
          pressureScore: 0,
          semanticSignature: "",
          anchorClientId: anchor.clubId,
          alternateClientIds: alternatives,
          cast: [{ kind: "club", id: anchor.clubId }],
          topics: [{ kind: "club", id: anchor.clubId }],
          options: [],
        },
        optionId: "exclusiveAnchor",
        label: "Take the anchor-client advance",
        knownTradeoffs: ["Immediate cash and security", "Other clients cool if they suspect preferred treatment", "Your posture becomes more retainer-led"],
        premiseTag: "anchor-client",
        immediateReputation: 1,
        callbackReputation: 1,
      }),
      buildImmediateOption({
        state,
        context: {
          id: "clientConcentration",
          title: "",
          premise: "",
          pressureScore: 0,
          semanticSignature: "",
          anchorClientId: anchor.clubId,
          alternateClientIds: alternatives,
          cast: [{ kind: "club", id: anchor.clubId }],
          topics: [{ kind: "club", id: anchor.clubId }],
          options: [],
        },
        optionId: "rebalanceBook",
        label: "Rebalance the client book",
        knownTradeoffs: ["Costs money and time this month", "The anchor club loses some trust", "A broader portfolio reduces single-client leverage"],
        premiseTag: "portfolio-balance",
        callbackReputation: 2,
      }),
      buildImmediateOption({
        state,
        context: {
          id: "clientConcentration",
          title: "",
          premise: "",
          pressureScore: 0,
          semanticSignature: "",
          anchorClientId: anchor.clubId,
          alternateClientIds: alternatives,
          cast: [{ kind: "club", id: anchor.clubId }],
          topics: [{ kind: "club", id: anchor.clubId }],
          options: [],
        },
        optionId: "walkAway",
        label: "Walk away from the overexposed account",
        knownTradeoffs: ["Monthly revenue drops immediately", "You recover autonomy", "The club may not return quickly"],
        premiseTag: "autonomy",
        immediateReputation: 2,
        callbackReputation: 2,
      }),
    ],
  };
}

function resolveStaffContext(state: GameState): AgencyDilemmaContext | undefined {
  const finances = state.finances;
  if (!finances || finances.employees.length === 0) return undefined;
  const pressure = deriveAgencyStrategicPressure(finances, state.scout);
  if (
    pressure.qualityDebt < 38
    && pressure.capacityUtilization < 0.86
    && pressure.staffFragility < 36
  ) return undefined;
  const deputy = sortedEmployees(finances.employees)[0];
  return {
    id: "staffQualityDeadline",
    title: "The staff can hit the deadline or protect the standard, not both",
    premise: `${deputy.name} and the rest of the agency are carrying real quality debt. You can rush the week through, protect the standard, or back a deputy to own the risk.`,
    pressureScore: Math.max(pressure.qualityDebt, Math.round(pressure.capacityUtilization * 100), pressure.staffFragility),
    semanticSignature: "agency:staff-deadline",
    deputyEmployeeId: deputy.id,
    alternateClientIds: [],
    cast: [{ kind: "employee", id: deputy.id }],
    topics: [{ kind: "employee", id: deputy.id }],
    options: [
      buildImmediateOption({
        state,
        context: {
          id: "staffQualityDeadline",
          title: "",
          premise: "",
          pressureScore: 0,
          semanticSignature: "",
          deputyEmployeeId: deputy.id,
          alternateClientIds: [],
          cast: [{ kind: "employee", id: deputy.id }],
          topics: [{ kind: "employee", id: deputy.id }],
          options: [],
        },
        optionId: "rushDeadline",
        label: "Push the staff through the deadline",
        knownTradeoffs: ["Clients stay warm this week", "Fatigue and morale deteriorate", "Future mistakes become more likely"],
        premiseTag: "deadline-rush",
        callbackReputation: -1,
      }),
      buildImmediateOption({
        state,
        context: {
          id: "staffQualityDeadline",
          title: "",
          premise: "",
          pressureScore: 0,
          semanticSignature: "",
          deputyEmployeeId: deputy.id,
          alternateClientIds: [],
          cast: [{ kind: "employee", id: deputy.id }],
          topics: [{ kind: "employee", id: deputy.id }],
          options: [],
        },
        optionId: "protectStandards",
        label: "Protect the standard and absorb the hit",
        knownTradeoffs: ["Cash and client patience are spent now", "Quality debt falls", "The agency signals that standards matter"],
        premiseTag: "quality-discipline",
        immediateReputation: 1,
        callbackReputation: 1,
      }),
      buildImmediateOption({
        state,
        context: {
          id: "staffQualityDeadline",
          title: "",
          premise: "",
          pressureScore: 0,
          semanticSignature: "",
          deputyEmployeeId: deputy.id,
          alternateClientIds: [],
          cast: [{ kind: "employee", id: deputy.id }],
          topics: [{ kind: "employee", id: deputy.id }],
          options: [],
        },
        optionId: "empowerDeputy",
        label: "Give the deputy the mandate",
        knownTradeoffs: ["A rising staff member gains real authority", "A visible miss becomes theirs and yours", "The agency learns whether it can delegate"],
        premiseTag: "deputy-mandate",
        immediateReputation: 1,
        callbackReputation: 2,
      }),
    ],
  };
}

function resolveRegionalContext(state: GameState): AgencyDilemmaContext | undefined {
  const finances = state.finances;
  if (!finances) return undefined;
  const focusRegionId = currentFocusRegion(state);
  const alternatives = alternateRegions(state, focusRegionId);
  if (!focusRegionId || alternatives.length === 0) return undefined;
  if ((state.scout.independentTier ?? finances.independentTier ?? 1) < 3) return undefined;
  const pressure = deriveAgencyStrategicPressure(finances, state.scout);
  if (pressure.clientConcentration < 0.42 && activeRetainers(finances).length < 1 && finances.satelliteOffices.length < 1) {
    return undefined;
  }
  const targetRegion = alternatives[0];
  return {
    id: "regionalCommitment",
    title: "The map is asking you to choose breadth or territorial depth",
    premise: `The agency can either deepen ${focusRegionId} where trust already exists, or commit money and attention to ${targetRegion} before somebody else becomes the local expert.`,
    pressureScore: 52 + Math.round((pressure.clientConcentration + Math.max(0, pressure.capacityUtilization - 0.6)) * 20),
    semanticSignature: "agency:regional-commitment",
    regionId: targetRegion,
    focusRegionId,
    policyFocusRegionId: targetRegion,
    alternateClientIds: [],
    cast: [{ kind: "territory", id: targetRegion }],
    topics: [{ kind: "territory", id: targetRegion }],
    options: [
      buildImmediateOption({
        state,
        context: {
          id: "regionalCommitment",
          title: "",
          premise: "",
          pressureScore: 0,
          semanticSignature: "",
          regionId: targetRegion,
          focusRegionId,
          policyFocusRegionId: targetRegion,
          alternateClientIds: [],
          cast: [{ kind: "territory", id: targetRegion }],
          topics: [{ kind: "territory", id: targetRegion }],
          options: [],
        },
        optionId: "expandFrontier",
        label: `Open the frontier in ${targetRegion}`,
        knownTradeoffs: ["Setup cost hits immediately", "Coverage broadens for future work", "Current base gets less attention"],
        premiseTag: "expansion",
        callbackReputation: 1,
      }),
      buildImmediateOption({
        state,
        context: {
          id: "regionalCommitment",
          title: "",
          premise: "",
          pressureScore: 0,
          semanticSignature: "",
          regionId: targetRegion,
          focusRegionId,
          policyFocusRegionId: focusRegionId,
          alternateClientIds: [],
          cast: [{ kind: "territory", id: focusRegionId }],
          topics: [{ kind: "territory", id: focusRegionId }],
          options: [],
        },
        optionId: "deepenStronghold",
        label: `Deepen the stronghold in ${focusRegionId}`,
        knownTradeoffs: ["Global optionality narrows", "Local access compounds faster", "You are more exposed if one region cools"],
        premiseTag: "stronghold",
        immediateReputation: 1,
        callbackReputation: 2,
      }),
      buildImmediateOption({
        state,
        context: {
          id: "regionalCommitment",
          title: "",
          premise: "",
          pressureScore: 0,
          semanticSignature: "",
          regionId: targetRegion,
          focusRegionId,
          alternateClientIds: [],
          cast: [{ kind: "territory", id: targetRegion }],
          topics: [{ kind: "territory", id: targetRegion }],
          options: [],
        },
        optionId: "stayMobile",
        label: "Stay mobile and avoid fixed overhead",
        knownTradeoffs: ["No office cost today", "Regional depth compounds more slowly", "You preserve optionality for marketplace work"],
        premiseTag: "mobility",
        callbackReputation: 1,
      }),
    ],
  };
}

function resolveCapitalContext(state: GameState): AgencyDilemmaContext | undefined {
  const finances = state.finances;
  if (!finances) return undefined;
  if ((state.scout.independentTier ?? finances.independentTier ?? 1) < 3) return undefined;
  if (hasResolvedCapitalCrossroads(state)) return undefined;
  const pressure = deriveAgencyStrategicPressure(finances, state.scout);
  const health = calculateAgencyHealth(finances, state.scout);
  if ((health.runwayMonths ?? 99) > 5 && state.scout.reputation < 58) return undefined;
  const clients = sortedByRevenue([
    ...activeClients(finances),
    ...(finances.clientRelationships ?? []).filter((client) => client.status === "prospect"),
  ]);
  const targetClient = clients[0];
  if (!targetClient) return undefined;
  return {
    id: "capitalCrossroads",
    title: "You need to choose what kind of growth funds the agency",
    premise: `The agency can take outside capital, lock in a founding retainer with ${state.clubs[targetClient.clubId]?.name ?? targetClient.clubId}, or stay exposed and chase placement upside with your own balance sheet.`,
    pressureScore: health.runwayMonths === null ? 55 : Math.max(40, Math.min(90, 75 - Math.round(health.runwayMonths * 8))),
    semanticSignature: "agency:capital-crossroads",
    targetClubId: targetClient.clubId,
    anchorClientId: targetClient.clubId,
    alternateClientIds: clients.slice(1).map((client) => client.clubId),
    cast: [{ kind: "club", id: targetClient.clubId }],
    topics: [{ kind: "club", id: targetClient.clubId }],
    options: [
      buildImmediateOption({
        state,
        context: {
          id: "capitalCrossroads",
          title: "",
          premise: "",
          pressureScore: 0,
          semanticSignature: "",
          targetClubId: targetClient.clubId,
          anchorClientId: targetClient.clubId,
          alternateClientIds: clients.slice(1).map((client) => client.clubId),
          cast: [{ kind: "club", id: targetClient.clubId }],
          topics: [{ kind: "club", id: targetClient.clubId }],
          options: [],
        },
        optionId: "investorBridge",
        label: "Take the investor bridge",
        knownTradeoffs: ["Runway improves now", "Growth pressure arrives with the money", "Existing clients may question independence"],
        premiseTag: "investor-bridge",
        callbackReputation: -1,
      }),
      buildImmediateOption({
        state,
        context: {
          id: "capitalCrossroads",
          title: "",
          premise: "",
          pressureScore: 0,
          semanticSignature: "",
          targetClubId: targetClient.clubId,
          anchorClientId: targetClient.clubId,
          alternateClientIds: clients.slice(1).map((client) => client.clubId),
          cast: [{ kind: "club", id: targetClient.clubId }],
          topics: [{ kind: "club", id: targetClient.clubId }],
          options: [],
        },
        optionId: "signatureRetainer",
        label: "Sign the founding retainer",
        knownTradeoffs: ["Recurring income increases", "Marketplace freedom narrows", "One client becomes a public reference point"],
        premiseTag: "founding-retainer",
        immediateReputation: 1,
        callbackReputation: 1,
      }),
      buildImmediateOption({
        state,
        context: {
          id: "capitalCrossroads",
          title: "",
          premise: "",
          pressureScore: 0,
          semanticSignature: "",
          targetClubId: targetClient.clubId,
          anchorClientId: targetClient.clubId,
          alternateClientIds: clients.slice(1).map((client) => client.clubId),
          cast: [{ kind: "club", id: targetClient.clubId }],
          topics: [{ kind: "club", id: targetClient.clubId }],
          options: [],
        },
        optionId: "backJudgment",
        label: "Back judgment and live with the variance",
        knownTradeoffs: ["No guaranteed income arrives", "Reputation upside stays yours", "Cash pressure remains real if the next placements miss"],
        premiseTag: "placement-upside",
        immediateReputation: 2,
        callbackReputation: 2,
      }),
    ],
  };
}

export function eligibleAgencyDilemmaContexts(state: GameState): AgencyDilemmaContext[] {
  return [
    resolveStaffContext(state),
    resolveConcentrationContext(state),
    resolveRegionalContext(state),
    resolveCapitalContext(state),
  ].filter((value): value is AgencyDilemmaContext => Boolean(value));
}

export function chooseAgencyDilemmaContext(
  state: GameState,
  contexts: readonly AgencyDilemmaContext[],
): AgencyDilemmaContext {
  const rng = createNamedRNG(
    state.runManifest.rootSeed,
    "agency-dilemma-context",
    state.currentSeason,
    state.currentWeek,
    contexts.map((context) => `${context.id}:${context.pressureScore}`).join("|"),
  );
  const total = contexts.reduce((sum, context) => sum + Math.max(1, context.pressureScore), 0);
  let remaining = rng.next() * total;
  for (const context of [...contexts].sort(
    (left, right) => right.pressureScore - left.pressureScore || left.id.localeCompare(right.id),
  )) {
    remaining -= Math.max(1, context.pressureScore);
    if (remaining <= 0) return context;
  }
  return contexts[0];
}
