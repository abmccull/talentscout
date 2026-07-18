import { createConsequenceEngineState } from "@/engine/consequences";
import type { WorldFact } from "@/engine/consequences/types";
import type {
  Activity,
  AgencyEmployee,
  ClientRelationship,
  GameState,
  InboxMessage,
} from "@/engine/core/types";
import { deriveCareerRolePackage, type CareerRolePackage } from "./rolePackages";

const TERRITORY_ACTIVITY_TYPES = new Set<Activity["type"]>([
  "attendMatch",
  "travel",
  "academyVisit",
  "youthTournament",
  "trainingVisit",
  "assignTerritory",
  "internationalTravel",
  "schoolMatch",
  "grassrootsTournament",
  "streetFootball",
  "academyTrialDay",
  "youthFestival",
  "reserveMatch",
  "scoutingMission",
  "trialMatch",
  "freeAgentOutreach",
]);

const DISCOVERY_ACTIVITY_TYPES = new Set<Activity["type"]>([
  "attendMatch",
  "watchVideo",
  "academyVisit",
  "youthTournament",
  "schoolMatch",
  "grassrootsTournament",
  "streetFootball",
  "academyTrialDay",
  "youthFestival",
  "reserveMatch",
  "scoutingMission",
  "databaseQuery",
  "deepVideoAnalysis",
  "marketInefficiency",
  "freeAgentOutreach",
  "agencyShowcase",
]);

const RELATIONSHIP_ACTIVITY_TYPES = new Set<Activity["type"]>([
  "networkMeeting",
  "parentCoachMeeting",
  "managerMeeting",
  "boardPresentation",
  "agentShowcase",
  "contractNegotiation",
  "analyticsTeamMeeting",
]);

const DELIVERY_ACTIVITY_TYPES = new Set<Activity["type"]>([
  "writeReport",
  "writePlacementReport",
  "reviewNPCReport",
  "loanRecommendation",
  "managerMeeting",
  "boardPresentation",
]);

const LEADERSHIP_ACTIVITY_TYPES = new Set<Activity["type"]>([
  "reviewNPCReport",
  "managerMeeting",
  "boardPresentation",
  "assignTerritory",
]);

const STAFF_ACTIVITY_TYPES = new Set<Activity["type"]>([
  "reviewNPCReport",
  "managerMeeting",
  "boardPresentation",
  "analyticsTeamMeeting",
]);

interface RoleActivitySummary {
  territory: number;
  discovery: number;
  relationships: number;
  delivery: number;
  leadership: number;
  staff: number;
}

interface RoleResolution {
  title: string;
  body: string;
  outcome: "success" | "warning";
  reputationDelta?: number;
  clubTrustDelta?: number;
  specializationDelta?: number;
  clientDelta?: number;
  employeeMoraleDelta?: number;
  affectedClientClubId?: string;
  affectedEmployeeId?: string;
  tags: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function summarizeWeek(schedule: GameState["schedule"]): RoleActivitySummary {
  const activities = schedule?.activities?.filter((activity): activity is Activity => Boolean(activity)) ?? [];
  const summary: RoleActivitySummary = {
    territory: 0,
    discovery: 0,
    relationships: 0,
    delivery: 0,
    leadership: 0,
    staff: 0,
  };
  for (const activity of activities) {
    if (TERRITORY_ACTIVITY_TYPES.has(activity.type)) summary.territory += 1;
    if (DISCOVERY_ACTIVITY_TYPES.has(activity.type)) summary.discovery += 1;
    if (RELATIONSHIP_ACTIVITY_TYPES.has(activity.type)) summary.relationships += 1;
    if (DELIVERY_ACTIVITY_TYPES.has(activity.type)) summary.delivery += 1;
    if (LEADERSHIP_ACTIVITY_TYPES.has(activity.type)) summary.leadership += 1;
    if (STAFF_ACTIVITY_TYPES.has(activity.type)) summary.staff += 1;
  }
  return summary;
}

function activeLeadershipLoad(state: GameState): number {
  return Object.values(state.leadershipPortfolio?.responsibilities ?? {}).filter((responsibility) =>
    responsibility.status === "open"
    || responsibility.status === "owned"
    || responsibility.status === "delegated"
    || responsibility.status === "deferred"
  ).length;
}

function weakestActiveClient(
  clientRelationships: readonly ClientRelationship[] | undefined,
): ClientRelationship | undefined {
  return (clientRelationships ?? [])
    .filter((client) => client.status === "active" || client.status === "cooling")
    .slice()
    .sort((left, right) =>
      left.satisfaction - right.satisfaction
      || left.tenureWeeks - right.tenureWeeks
      || left.clubId.localeCompare(right.clubId)
    )[0];
}

function lowestMoraleEmployee(
  employees: readonly AgencyEmployee[] | undefined,
): AgencyEmployee | undefined {
  return (employees ?? [])
    .slice()
    .sort((left, right) => left.morale - right.morale || left.id.localeCompare(right.id))[0];
}

function hasTrack(rolePackage: CareerRolePackage, track: CareerRolePackage["responsibilities"][number]["track"]): boolean {
  return rolePackage.responsibilities.some((responsibility) => responsibility.track === track);
}

function evaluateClubRole(
  state: GameState,
  rolePackage: CareerRolePackage,
  summary: RoleActivitySummary,
): RoleResolution | undefined {
  const leadershipLoad = activeLeadershipLoad(state);
  if (hasTrack(rolePackage, "leadership") && leadershipLoad > 0) {
    if (summary.leadership === 0) {
      return {
        title: "Leadership remit ignored",
        body: "Open department responsibilities needed ownership, delegation, or review work this week. Your itinerary stayed too narrow for the job you now hold.",
        outcome: "warning",
        reputationDelta: -1,
        clubTrustDelta: -1,
        tags: ["career-role", "leadership", "missed"],
      };
    }
    if (summary.delivery > 0 || summary.staff > 0) {
      return {
        title: "Leadership time changed outcomes",
        body: "You combined leadership attention with actual delivery work, so the club saw more than status. The role is beginning to trust your allocation of authority.",
        outcome: "success",
        clubTrustDelta: 1,
        specializationDelta: 1,
        reputationDelta: rolePackage.stage === "executive" ? 1 : 0,
        tags: ["career-role", "leadership", "delivered"],
      };
    }
  }

  if (hasTrack(rolePackage, "territory")) {
    if (summary.territory === 0) {
      return {
        title: "Territory lane went stale",
        body: "Your current remit includes owning a scouting lane. This week produced no travel, venue coverage, or region-building work, so the club's trust drifted backward.",
        outcome: "warning",
        clubTrustDelta: -1,
        tags: ["career-role", "territory", "stale"],
      };
    }
    if (summary.discovery > 0 && (summary.relationships > 0 || summary.territory > 1)) {
      return {
        title: "Territory ownership paid off",
        body: "You widened coverage and supported it with relationship or follow-up context. That is the difference between a scout trip and a territory edge.",
        outcome: "success",
        clubTrustDelta: summary.relationships > 0 ? 1 : 0,
        specializationDelta: 1,
        tags: ["career-role", "territory", "edge"],
      };
    }
  }

  return undefined;
}

function evaluateIndependentRole(
  state: GameState,
  rolePackage: CareerRolePackage,
  summary: RoleActivitySummary,
): RoleResolution | undefined {
  const finances = state.finances;
  if (!finances) return undefined;
  const lowestEmployee = lowestMoraleEmployee(finances.employees);
  const activeClient = weakestActiveClient(finances.clientRelationships);
  const activeRetainers = finances.retainerContracts.filter((contract) => contract.status === "active").length;

  if (
    hasTrack(rolePackage, "staff")
    && lowestEmployee
    && lowestEmployee.morale < 45
    && summary.staff === 0
  ) {
    return {
      title: "Staff quality debt is accumulating",
      body: `${lowestEmployee.name} needed review, support, or leadership attention. Ignoring fragile staff morale now makes future agency output less reliable.`,
      outcome: "warning",
      reputationDelta: -1,
      employeeMoraleDelta: -4,
      affectedEmployeeId: lowestEmployee.id,
      tags: ["career-role", "staff", "quality-debt"],
    };
  }

  if (
    hasTrack(rolePackage, "staff")
    && lowestEmployee
    && summary.staff > 0
    && (summary.delivery > 0 || summary.relationships > 0)
  ) {
    return {
      title: "Agency leadership stabilized delivery",
      body: `You invested real attention in staff work and still delivered outward-facing progress. ${lowestEmployee.name}'s confidence improved because leadership was visible, not abstract.`,
      outcome: "success",
      reputationDelta: 1,
      specializationDelta: 1,
      employeeMoraleDelta: 3,
      affectedEmployeeId: lowestEmployee.id,
      tags: ["career-role", "staff", "stabilized"],
    };
  }

  const shortRunway = finances.balance < 4_000;
  if (hasTrack(rolePackage, "business") && shortRunway && summary.delivery === 0) {
    return {
      title: "Runway pressure dictated the week",
      body: "Cash runway was already thin and the desk still produced no delivered work. The practice looks more fragile when pressure does not convert into actual output.",
      outcome: "warning",
      reputationDelta: -1,
      clientDelta: activeClient ? -4 : undefined,
      affectedClientClubId: activeClient?.clubId,
      tags: ["career-role", "business", "runway"],
    };
  }

  if (
    hasTrack(rolePackage, "business")
    && (activeRetainers > 0 || activeClient)
    && summary.delivery > 0
    && summary.relationships > 0
  ) {
    return {
      title: "The practice earned trust this week",
      body: "You paired delivered work with stakeholder maintenance. That is what makes an independent desk feel like a durable practice instead of a lucky report sale.",
      outcome: "success",
      reputationDelta: 1,
      clientDelta: activeClient ? 3 : undefined,
      affectedClientClubId: activeClient?.clubId,
      tags: ["career-role", "business", "trust-built"],
    };
  }

  return undefined;
}

function createRoleFact(
  id: string,
  state: GameState,
  rolePackage: CareerRolePackage,
  resolution: RoleResolution,
  summary: RoleActivitySummary,
): WorldFact {
  return {
    id,
    kind: "careerRoleWeek",
    subject: { kind: "scout", id: state.scout.id },
    observedAt: { week: state.currentWeek, season: state.currentSeason },
    visibility: "stakeholders",
    value: {
      path: rolePackage.path,
      stage: rolePackage.stage,
      tier: rolePackage.tier,
      outcome: resolution.outcome,
      title: resolution.title,
      activityMix: {
        territory: summary.territory,
        discovery: summary.discovery,
        relationships: summary.relationships,
        delivery: summary.delivery,
        leadership: summary.leadership,
        staff: summary.staff,
      },
      deltas: {
        reputation: resolution.reputationDelta ?? 0,
        clubTrust: resolution.clubTrustDelta ?? 0,
        specializationReputation: resolution.specializationDelta ?? 0,
        clientSatisfaction: resolution.clientDelta ?? 0,
        employeeMorale: resolution.employeeMoraleDelta ?? 0,
      },
    },
    metadata: {
      path: rolePackage.path,
      stage: rolePackage.stage,
      tags: resolution.tags,
      affectedClientClubId: resolution.affectedClientClubId ?? null,
      affectedEmployeeId: resolution.affectedEmployeeId ?? null,
    },
  };
}

function applyClientDelta(
  clients: readonly ClientRelationship[] | undefined,
  clubId: string | undefined,
  delta: number | undefined,
  state: GameState,
): ClientRelationship[] | undefined {
  if (!clients || !clubId || !delta) return clients ? clients.map((client) => ({ ...client })) : clients;
  return clients.map((client) =>
    client.clubId === clubId
      ? {
          ...client,
          satisfaction: clamp(client.satisfaction + delta, 0, 100),
          lastInteractionWeek: state.currentWeek,
          lastInteractionSeason: state.currentSeason,
        }
      : { ...client }
  );
}

function applyEmployeeMoraleDelta(
  employees: readonly AgencyEmployee[] | undefined,
  employeeId: string | undefined,
  delta: number | undefined,
): AgencyEmployee[] | undefined {
  if (!employees || !employeeId || !delta) return employees ? employees.map((employee) => ({ ...employee })) : employees;
  return employees.map((employee) =>
    employee.id === employeeId
      ? { ...employee, morale: clamp(employee.morale + delta, 0, 100) }
      : { ...employee }
  );
}

export function processWeeklyRoleResponsibilities(input: {
  beforeWeek: GameState;
  state: GameState;
}): GameState {
  const rolePackage = deriveCareerRolePackage({
    scout: input.state.scout,
    finances: input.state.finances,
    club: input.state.scout.currentClubId
      ? input.state.clubs?.[input.state.scout.currentClubId]
      : undefined,
    leadershipPortfolio: input.state.leadershipPortfolio,
  });
  if (rolePackage.tier < 3) return input.state;

  const summary = summarizeWeek(input.beforeWeek.schedule);
  const consequenceState = input.state.consequenceState ?? createConsequenceEngineState();
  const factId = `fact:career-role:s${input.beforeWeek.currentSeason}w${input.beforeWeek.currentWeek}`;
  if (consequenceState.facts[factId]) {
    return input.state.consequenceState ? input.state : { ...input.state, consequenceState };
  }

  const resolution = input.state.scout.careerPath === "independent"
    ? evaluateIndependentRole(input.state, rolePackage, summary)
    : evaluateClubRole(input.state, rolePackage, summary);
  if (!resolution) return input.state.consequenceState ? input.state : { ...input.state, consequenceState };

  const fact = createRoleFact(factId, input.state, rolePackage, resolution, summary);
  const inboxMessage: InboxMessage = {
    id: `inbox:${factId}`,
    week: input.state.currentWeek,
    season: input.state.currentSeason,
    type: resolution.outcome === "success" ? "feedback" : "warning",
    title: resolution.title,
    body: resolution.body,
    read: false,
    actionRequired: false,
    relatedId: input.state.scout.id,
    relatedEntityType: "narrative",
  };

  const scout = {
    ...input.state.scout,
    reputation: clamp(
      input.state.scout.reputation + (resolution.reputationDelta ?? 0),
      0,
      100,
    ),
    clubTrust: clamp(
      input.state.scout.clubTrust + (resolution.clubTrustDelta ?? 0),
      0,
      100,
    ),
    specializationReputation: clamp(
      input.state.scout.specializationReputation + (resolution.specializationDelta ?? 0),
      0,
      100,
    ),
  };

  return {
    ...input.state,
    scout,
    finances: input.state.finances
      ? {
          ...input.state.finances,
          clientRelationships: applyClientDelta(
            input.state.finances.clientRelationships,
            resolution.affectedClientClubId,
            resolution.clientDelta,
            input.state,
          ) ?? input.state.finances.clientRelationships,
          employees: applyEmployeeMoraleDelta(
            input.state.finances.employees,
            resolution.affectedEmployeeId,
            resolution.employeeMoraleDelta,
          ) ?? input.state.finances.employees,
        }
      : input.state.finances,
    consequenceState: {
      ...consequenceState,
      facts: {
        ...consequenceState.facts,
        [fact.id]: fact,
      },
    },
    inbox: input.state.inbox.some((message) => message.id === inboxMessage.id)
      ? input.state.inbox
      : [...input.state.inbox, inboxMessage],
  };
}
