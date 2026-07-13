import type {
  Contact,
  GameState,
  InboxMessage,
  InternationalAssignment,
  InternationalAssignmentDeliverable,
  InternationalAssignmentDeliverableKind,
  Observation,
  ObservationContext,
  ScoutReport,
} from "@/engine/core/types";
import { isScoutAbroad } from "@/engine/world/travel";
import { normalizeCountryKey } from "@/lib/country";

const FIELD_OBSERVATION_CONTEXTS = new Set<ObservationContext>([
  "liveMatch",
  "trainingGround",
  "youthTournament",
  "academyVisit",
  "schoolMatch",
  "grassrootsTournament",
  "streetFootball",
  "academyTrialDay",
  "youthFestival",
  "followUpSession",
  "reserveMatch",
  "agentShowcase",
  "trialMatch",
]);

export interface InternationalAssignmentProgressEvent {
  id: string;
  kind: InternationalAssignmentDeliverableKind;
}

function countryIdentity(country: string | undefined): string | null {
  if (!country) return null;
  return normalizeCountryKey(country)
    ?? country.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isDestination(country: string | undefined, assignment: InternationalAssignment): boolean {
  return Boolean(countryIdentity(country) && countryIdentity(country) === countryIdentity(assignment.country));
}

function deliverableBlueprint(
  type: InternationalAssignment["type"],
): InternationalAssignmentDeliverable[] {
  switch (type) {
    case "youthTournament":
      return [
        {
          kind: "liveObservation",
          label: "Complete 3 field observations of players based in the destination",
          target: 3,
          progress: 0,
        },
        {
          kind: "submittedReport",
          label: "Submit 1 destination-player report before returning",
          target: 1,
          progress: 0,
        },
      ];
    case "seniorFriendly":
      return [
        {
          kind: "liveObservation",
          label: "Complete 2 field observations of destination-based players",
          target: 2,
          progress: 0,
        },
        {
          kind: "submittedReport",
          label: "Submit 1 destination-player report before returning",
          target: 1,
          progress: 0,
        },
      ];
    case "scoutingMission":
      return [
        {
          kind: "liveObservation",
          label: "Complete 2 field observations of destination-based players",
          target: 2,
          progress: 0,
        },
        {
          kind: "submittedReport",
          label: "Submit 1 destination-player report before returning",
          target: 1,
          progress: 0,
        },
        {
          kind: "networkOutcome",
          label: "Complete 1 meeting with a contact based in the destination",
          target: 1,
          progress: 0,
        },
      ];
  }
}

/** Adds current objective definitions without inventing progress for a legacy assignment. */
export function migrateInternationalAssignment(
  assignment: InternationalAssignment,
): InternationalAssignment {
  const blueprint = deliverableBlueprint(assignment.type);
  const priorByKind = new Map(
    (assignment.deliverables ?? []).map((deliverable) => [deliverable.kind, deliverable]),
  );
  const deliverables = blueprint.map((definition) => {
    const prior = priorByKind.get(definition.kind);
    return {
      ...definition,
      progress: Math.max(
        0,
        Math.min(definition.target, Math.floor(prior?.progress ?? 0)),
      ),
    };
  });

  return {
    ...assignment,
    deliverables,
    creditedEventIds: [...new Set(assignment.creditedEventIds ?? [])],
  };
}

/** Starts a clean, auditable assignment attempt at acceptance time. */
export function activateInternationalAssignment(
  assignment: InternationalAssignment,
  week: number,
  season: number,
): InternationalAssignment {
  const migrated = migrateInternationalAssignment(assignment);
  return {
    ...migrated,
    deliverables: migrated.deliverables?.map((deliverable) => ({
      ...deliverable,
      progress: 0,
    })),
    creditedEventIds: [],
    acceptedWeek: week,
    acceptedSeason: season,
    outcome: undefined,
  };
}

/** Credits one canonical action once. Duplicate retries and reloads are neutral. */
export function recordInternationalAssignmentProgress(
  assignment: InternationalAssignment,
  event: InternationalAssignmentProgressEvent,
): InternationalAssignment {
  const migrated = migrateInternationalAssignment(assignment);
  if (!migrated.acceptedSeason || (migrated.creditedEventIds ?? []).includes(event.id)) {
    return migrated;
  }
  const index = (migrated.deliverables ?? []).findIndex(
    (deliverable) => deliverable.kind === event.kind,
  );
  if (index < 0) return migrated;

  const deliverables = (migrated.deliverables ?? []).map((deliverable, deliverableIndex) =>
    deliverableIndex === index
      ? { ...deliverable, progress: Math.min(deliverable.target, deliverable.progress + 1) }
      : deliverable,
  );
  return {
    ...migrated,
    deliverables,
    creditedEventIds: [...(migrated.creditedEventIds ?? []), event.id],
  };
}

function playerCountry(
  state: GameState,
  playerId: string,
  observation?: Observation,
): string | undefined {
  if (observation?.matchId) {
    const fixture = state.fixtures[observation.matchId];
    const fixtureLeague = fixture ? state.leagues[fixture.leagueId] : undefined;
    if (fixtureLeague?.country) return fixtureLeague.country;
  }

  const unsigned = state.unsignedYouth[playerId]
    ?? Object.values(state.unsignedYouth).find((candidate) => candidate.player.id === playerId);
  if (unsigned?.country) return unsigned.country;

  const freeAgent = state.freeAgentPool?.agents.find((candidate) => candidate.playerId === playerId);
  if (freeAgent?.country) return freeAgent.country;

  const player = state.players[playerId] ?? state.retiredPlayers[playerId];
  const club = player ? state.clubs[player.clubId] : undefined;
  const league = club ? state.leagues[club.leagueId] : undefined;
  return league?.country;
}

function reportMatchesDestination(
  state: GameState,
  assignment: InternationalAssignment,
  report: ScoutReport,
): boolean {
  return isDestination(playerCountry(state, report.playerId), assignment);
}

function observationMatchesDestination(
  state: GameState,
  assignment: InternationalAssignment,
  observation: Observation,
): boolean {
  return FIELD_OBSERVATION_CONTEXTS.has(observation.context)
    && isDestination(playerCountry(state, observation.playerId, observation), assignment);
}

function contactMatchesDestination(
  contact: Contact,
  assignment: InternationalAssignment,
): boolean {
  return isDestination(contact.country, assignment);
}

function canCreditCurrentWeek(state: GameState, assignment: InternationalAssignment): boolean {
  const booking = state.scout.travelBooking;
  return Boolean(
    assignment.acceptedSeason
    && booking
    && isScoutAbroad(state.scout, state.currentWeek)
    && isDestination(booking.destinationCountry, assignment),
  );
}

/**
 * Reconciles objective progress from visible canonical records for the current
 * abroad week. It can run after every action and again during weekly/batch
 * advancement because event IDs make it exactly-once.
 */
export function synchronizeInternationalAssignmentProgress(state: GameState): GameState {
  const source = state.activeInternationalAssignment;
  if (!source) return state;
  let assignment = migrateInternationalAssignment(source);
  if (!canCreditCurrentWeek(state, assignment)) {
    return assignment === source
      ? state
      : { ...state, activeInternationalAssignment: assignment };
  }

  const observations = Object.values(state.observations)
    .filter((observation) =>
      observation.week === state.currentWeek
      && observation.season === state.currentSeason
      && observationMatchesDestination(state, assignment, observation),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const observation of observations) {
    assignment = recordInternationalAssignmentProgress(assignment, {
      id: `observation:${observation.id}`,
      kind: "liveObservation",
    });
  }

  const reports = Object.values(state.reports)
    .filter((report) =>
      report.submittedWeek === state.currentWeek
      && report.submittedSeason === state.currentSeason
      && reportMatchesDestination(state, assignment, report),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const report of reports) {
    assignment = recordInternationalAssignmentProgress(assignment, {
      id: `report:${report.id}`,
      kind: "submittedReport",
    });
  }

  const contacts = Object.values(state.contacts)
    .filter((contact) =>
      contactMatchesDestination(contact, assignment)
      && state.inbox.some((message) =>
        message.id === `meeting-${contact.id}-w${state.currentWeek}-s${state.currentSeason}`,
      ),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const contact of contacts) {
    assignment = recordInternationalAssignmentProgress(assignment, {
      id: `network:${contact.id}:s${state.currentSeason}:w${state.currentWeek}`,
      kind: "networkOutcome",
    });
  }

  return { ...state, activeInternationalAssignment: assignment };
}

/** A deterministic liaison makes the mission's local-network objective actionable. */
export function ensureInternationalAssignmentLiaison(
  contacts: Record<string, Contact>,
  assignment: InternationalAssignment,
): Record<string, Contact> {
  if (assignment.type !== "scoutingMission") return contacts;
  const id = `assignment-liaison-${assignment.id}`;
  if (contacts[id]) return contacts;
  const countryLabel = assignment.country.charAt(0).toUpperCase() + assignment.country.slice(1);
  return {
    ...contacts,
    [id]: {
      id,
      name: `${countryLabel} Assignment Liaison`,
      type: "localScout",
      organization: `${countryLabel} Football Network`,
      relationship: 20,
      reliability: 50,
      knownPlayerIds: [],
      region: assignment.region,
      country: assignment.country,
      trustLevel: 20,
      loyalty: 55,
      interactionHistory: [],
      gossipQueue: [],
      referralNetwork: [],
      betrayalRisk: 0,
    },
  };
}

function resultLabel(grade: "full" | "partial" | "failed"): string {
  if (grade === "full") return "Full success";
  if (grade === "partial") return "Partial success";
  return "Failed";
}

/** Grades and archives one assignment. Travel by itself always produces 0%. */
export function resolveInternationalAssignment(
  state: GameState,
  source: InternationalAssignment,
): GameState {
  const assignment = migrateInternationalAssignment(source);
  const deliverables = assignment.deliverables ?? [];
  const achieved = deliverables.reduce(
    (sum, deliverable) => sum + Math.min(deliverable.progress, deliverable.target),
    0,
  );
  const possible = deliverables.reduce((sum, deliverable) => sum + deliverable.target, 0);
  const completionPercent = possible > 0 ? Math.round((achieved / possible) * 100) : 0;
  const grade = completionPercent === 100
    ? "full" as const
    : completionPercent > 0
      ? "partial" as const
      : "failed" as const;
  const reputationDelta = grade === "full"
    ? Math.min(4, Math.max(1, assignment.reputationReward))
    : grade === "partial"
      ? Math.min(2, Math.max(1, Math.round(assignment.reputationReward * completionPercent / 100)))
      : -1;
  const fullFamiliarity = assignment.type === "scoutingMission" ? 4 : 3;
  const familiarityDelta = grade === "full"
    ? fullFamiliarity
    : grade === "partial"
      ? Math.max(1, Math.round(fullFamiliarity * completionPercent / 100))
      : 0;
  const progressExplanation = deliverables
    .map((deliverable) => `${deliverable.progress}/${deliverable.target} ${deliverable.kind}`)
    .join(", ");
  const explanation = `${resultLabel(grade)} (${completionPercent}%): ${progressExplanation || "no objective work recorded"}. Travel alone earns no assignment credit.`;
  const outcome = {
    grade,
    completionPercent,
    reputationDelta,
    familiarityDelta,
    explanation,
    resolvedWeek: state.currentWeek,
    resolvedSeason: state.currentSeason,
  };
  const resolvedAssignment: InternationalAssignment = { ...assignment, outcome };

  const countryKey = countryIdentity(assignment.country) ?? assignment.country;
  const existingCountryRep = state.scout.countryReputations[countryKey] ?? {
    country: countryKey,
    familiarity: 0,
    reportsSubmitted: 0,
    successfulFinds: 0,
    contactCount: 0,
  };
  const reportProgress = deliverables.find((deliverable) => deliverable.kind === "submittedReport")?.progress ?? 0;
  const networkProgress = deliverables.find((deliverable) => deliverable.kind === "networkOutcome")?.progress ?? 0;
  const updatedScout = {
    ...state.scout,
    reputation: Math.max(0, Math.min(100, state.scout.reputation + reputationDelta)),
    countryReputations: {
      ...state.scout.countryReputations,
      [countryKey]: {
        ...existingCountryRep,
        familiarity: Math.max(0, Math.min(100, existingCountryRep.familiarity + familiarityDelta)),
        reportsSubmitted: existingCountryRep.reportsSubmitted + reportProgress,
        contactCount: existingCountryRep.contactCount + networkProgress,
      },
    },
  };
  const completionMessage: InboxMessage = {
    id: `assignment-complete-${assignment.id}-w${state.currentWeek}-s${state.currentSeason}`,
    week: state.currentWeek,
    season: state.currentSeason,
    type: "event",
    title: `${resultLabel(grade)}: ${assignment.country}`,
    body: `${explanation} Reputation ${reputationDelta >= 0 ? "+" : ""}${reputationDelta}; destination familiarity +${familiarityDelta}.`,
    read: false,
    actionRequired: false,
    relatedId: assignment.id,
    relatedEntityType: "assignment",
  };

  return {
    ...state,
    scout: updatedScout,
    activeInternationalAssignment: null,
    internationalAssignmentHistory: [
      ...(state.internationalAssignmentHistory ?? []),
      resolvedAssignment,
    ],
    inbox: state.inbox.some((message) => message.id === completionMessage.id)
      ? state.inbox
      : [completionMessage, ...state.inbox],
  };
}

