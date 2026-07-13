import type { GameState, NPCScout, Territory } from "../core/types";
import type { RNG } from "../rng";
import { addGameWeeks } from "../core/gameDate";
import { delegateScoutingTask } from "../core/quickScout";
import {
  assignTerritory,
  generateNPCScoutRoster,
} from "./npcScouts";

export interface LeadershipBootstrapResult {
  state: GameState;
  addedScoutIds: string[];
}

/**
 * Materialize the first delegation team when leadership becomes available.
 *
 * Tier 4 used to unlock only a screen: no production path ever created an NPC
 * scout, leaving delegation impossible during normal play. This bootstrap is
 * deliberately idempotent. Any existing staff means the career has already
 * crossed (or customized) the boundary, including after save/reload.
 */
export function ensureLeadershipDelegationTeam(
  state: GameState,
  rng: RNG,
  teamSize = 2,
): LeadershipBootstrapResult {
  if (state.scout.careerTier < 4 || Object.keys(state.npcScouts).length > 0) {
    return { state, addedScoutIds: [] };
  }

  const roster = generateNPCScoutRoster(rng, state.scout, teamSize);
  if (roster.length === 0) return { state, addedScoutIds: [] };

  const territories: Record<string, Territory> = Object.fromEntries(
    Object.entries(state.territories).map(([id, territory]) => [
      id,
      { ...territory, assignedScoutIds: [...territory.assignedScoutIds] },
    ]),
  );
  const territoryIds = Object.keys(territories).sort();
  const npcScouts: Record<string, NPCScout> = {};

  for (const [index, generatedScout] of roster.entries()) {
    let npcScout = generatedScout;
    if (territoryIds.length > 0) {
      const pivot = index % territoryIds.length;
      const orderedTerritoryIds = [
        ...territoryIds.slice(pivot),
        ...territoryIds.slice(0, pivot),
      ];
      const territoryId = orderedTerritoryIds.find((id) => {
        const territory = territories[id];
        return territory.assignedScoutIds.length < territory.maxScouts;
      });
      if (territoryId) {
        const assigned = assignTerritory(npcScout, territories[territoryId]);
        npcScout = assigned.npcScout;
        territories[territoryId] = assigned.territory;
      }
    }
    npcScouts[npcScout.id] = npcScout;
  }

  const addedScoutIds = Object.keys(npcScouts);
  return {
    state: {
      ...state,
      npcScouts,
      territories,
      scout: {
        ...state.scout,
        npcScoutIds: [
          ...new Set([...(state.scout.npcScoutIds ?? []), ...addedScoutIds]),
        ],
      },
    },
    addedScoutIds,
  };
}

export const LEADERSHIP_PORTFOLIO_CAPACITY = 3;
export const LEADERSHIP_ATTENTION_PER_WEEK = 2;
export const LEADERSHIP_TERMINAL_RETENTION = 24;

export type LeadershipResponsibilityChoice = "own" | "delegate" | "defer" | "reject";
export type LeadershipResponsibilityStatus =
  | "open"
  | "owned"
  | "delegated"
  | "deferred"
  | "succeeded"
  | "failed"
  | "rejected";

export interface LeadershipResponsibility {
  id: string;
  playerId: string;
  title: string;
  description: string;
  priority: "high" | "critical";
  createdWeek: number;
  createdSeason: number;
  dueWeek: number;
  dueSeason: number;
  status: LeadershipResponsibilityStatus;
  choice?: LeadershipResponsibilityChoice;
  choiceWeek?: number;
  choiceSeason?: number;
  assignedNpcScoutId?: string;
  delegationId?: string;
  sourceContactId?: string;
  clubId?: string;
  deferrals: number;
  resolvedWeek?: number;
  resolvedSeason?: number;
  outcomeReason?: string;
  attributedNpcScoutId?: string;
}

export interface LeadershipTrackRecord {
  ownedSuccesses: number;
  ownedFailures: number;
  delegatedSuccesses: number;
  delegatedFailures: number;
  deferrals: number;
  rejected: number;
  expired: number;
}

export interface LeadershipPortfolioState {
  version: 1;
  attentionWeek: number;
  attentionSeason: number;
  attentionCapacity: number;
  attentionUsed: number;
  responsibilities: Record<string, LeadershipResponsibility>;
  trackRecord: LeadershipTrackRecord;
}

export interface LeadershipChoiceResult {
  state: GameState;
  accepted: boolean;
  reason?: string;
}

const ACTIVE_RESPONSIBILITY_STATUSES = new Set<LeadershipResponsibilityStatus>([
  "open",
  "owned",
  "delegated",
  "deferred",
]);

const EMPTY_TRACK_RECORD: LeadershipTrackRecord = {
  ownedSuccesses: 0,
  ownedFailures: 0,
  delegatedSuccesses: 0,
  delegatedFailures: 0,
  deferrals: 0,
  rejected: 0,
  expired: 0,
};

export function createLeadershipPortfolioState(
  partial: Partial<LeadershipPortfolioState> = {},
  week = 1,
  season = 1,
): LeadershipPortfolioState {
  return {
    version: 1,
    attentionWeek: partial.attentionWeek ?? week,
    attentionSeason: partial.attentionSeason ?? season,
    attentionCapacity: LEADERSHIP_ATTENTION_PER_WEEK,
    attentionUsed: Math.max(0, Math.min(
      LEADERSHIP_ATTENTION_PER_WEEK,
      partial.attentionUsed ?? 0,
    )),
    responsibilities: Object.fromEntries(
      Object.entries(partial.responsibilities ?? {}).map(([id, responsibility]) => [
        id,
        { ...responsibility },
      ]),
    ),
    trackRecord: {
      ...EMPTY_TRACK_RECORD,
      ...(partial.trackRecord ?? {}),
    },
  };
}

function currentPortfolio(state: GameState): LeadershipPortfolioState {
  const portfolio = createLeadershipPortfolioState(
    state.leadershipPortfolio,
    state.currentWeek,
    state.currentSeason,
  );
  if (
    portfolio.attentionWeek === state.currentWeek
    && portfolio.attentionSeason === state.currentSeason
  ) {
    return portfolio;
  }
  return {
    ...portfolio,
    attentionWeek: state.currentWeek,
    attentionSeason: state.currentSeason,
    attentionUsed: 0,
  };
}

function isDue(
  currentWeek: number,
  currentSeason: number,
  dueWeek: number,
  dueSeason: number,
): boolean {
  return currentSeason > dueSeason
    || (currentSeason === dueSeason && currentWeek >= dueWeek);
}

function dateAtOrAfter(
  week: number,
  season: number,
  referenceWeek: number,
  referenceSeason: number,
): boolean {
  return season > referenceSeason
    || (season === referenceSeason && week >= referenceWeek);
}

function stableScore(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function knownLeadershipCandidates(state: GameState): string[] {
  const knownPlayerIds = new Set<string>([
    ...(state.watchlist ?? []),
    ...Object.values(state.observations ?? {}).map((observation) => observation.playerId),
    ...Object.values(state.reports ?? {}).map((report) => report.playerId),
    ...Object.values(state.contacts ?? {}).flatMap((contact) => contact.knownPlayerIds ?? []),
  ]);
  const retiredIds = new Set(state.retiredPlayerIds ?? []);
  const eligible = Object.values(state.players ?? {}).filter((player) =>
    player.age <= 25 && !retiredIds.has(player.id),
  );
  const known = eligible.filter((player) => knownPlayerIds.has(player.id));
  return (known.length >= LEADERSHIP_PORTFOLIO_CAPACITY ? known : eligible)
    .map((player) => player.id)
    .sort((left, right) =>
      stableScore(`${state.seed}:${state.currentSeason}:${state.currentWeek}:${left}`)
      - stableScore(`${state.seed}:${state.currentSeason}:${state.currentWeek}:${right}`)
      || left.localeCompare(right),
    );
}

function selectSourceContact(state: GameState, playerId: string): string | undefined {
  const contacts = Object.values(state.contacts ?? {}).sort((left, right) =>
    stableScore(`${state.seed}:${state.currentSeason}:${playerId}:${left.id}`)
    - stableScore(`${state.seed}:${state.currentSeason}:${playerId}:${right.id}`)
    || left.id.localeCompare(right.id),
  );
  return contacts.find((contact) => contact.knownPlayerIds.includes(playerId))?.id
    ?? contacts[0]?.id;
}

const RESPONSIBILITY_THEMES = [
  {
    title: "Urgent second opinion",
    description: "A decision-maker wants a defensible recommendation before the market moves.",
    priority: "critical" as const,
  },
  {
    title: "Succession shortlist",
    description: "Your department needs a credible development option, not another name on a spreadsheet.",
    priority: "high" as const,
  },
  {
    title: "Evidence conflict review",
    description: "The existing evidence disagrees. Decide who should own the follow-up and its consequences.",
    priority: "high" as const,
  },
] as const;

function fillLeadershipPortfolio(
  state: GameState,
  portfolio: LeadershipPortfolioState,
): LeadershipPortfolioState {
  const responsibilities = { ...portfolio.responsibilities };
  const active = Object.values(responsibilities).filter((responsibility) =>
    ACTIVE_RESPONSIBILITY_STATUSES.has(responsibility.status),
  );
  if (active.length >= LEADERSHIP_PORTFOLIO_CAPACITY) return portfolio;

  const activePlayerIds = new Set(active.map((responsibility) => responsibility.playerId));
  const historicalPlayerIds = new Set(
    Object.values(responsibilities).map((responsibility) => responsibility.playerId),
  );
  const candidates = knownLeadershipCandidates(state);
  const freshCandidates = candidates.filter((playerId) => !historicalPlayerIds.has(playerId));
  const fallbackCandidates = candidates.filter((playerId) => !activePlayerIds.has(playerId));
  const orderedCandidates = [...freshCandidates, ...fallbackCandidates.filter(
    (playerId) => !freshCandidates.includes(playerId),
  )];
  const needed = LEADERSHIP_PORTFOLIO_CAPACITY - active.length;

  for (let index = 0; index < needed; index += 1) {
    const playerId = orderedCandidates[index];
    if (!playerId) break;
    const slot = active.length + index;
    const theme = RESPONSIBILITY_THEMES[slot % RESPONSIBILITY_THEMES.length];
    const due = addGameWeeks(
      state.fixtures,
      { week: state.currentWeek, season: state.currentSeason },
      2,
    );
    const id = `leadership:${state.currentSeason}:${state.currentWeek}:${slot}:${playerId}`;
    responsibilities[id] = {
      id,
      playerId,
      title: theme.title,
      description: theme.description,
      priority: theme.priority,
      createdWeek: state.currentWeek,
      createdSeason: state.currentSeason,
      dueWeek: due.week,
      dueSeason: due.season,
      status: "open",
      sourceContactId: state.scout.careerPath === "independent"
        ? selectSourceContact(state, playerId)
        : undefined,
      clubId: state.scout.currentClubId,
      deferrals: 0,
    };
    activePlayerIds.add(playerId);
  }

  return { ...portfolio, responsibilities };
}

function boundedResponsibilities(
  responsibilities: Record<string, LeadershipResponsibility>,
): Record<string, LeadershipResponsibility> {
  const active = Object.values(responsibilities).filter((responsibility) =>
    ACTIVE_RESPONSIBILITY_STATUSES.has(responsibility.status),
  );
  const terminal = Object.values(responsibilities)
    .filter((responsibility) => !ACTIVE_RESPONSIBILITY_STATUSES.has(responsibility.status))
    .sort((left, right) =>
      (right.resolvedSeason ?? right.createdSeason) - (left.resolvedSeason ?? left.createdSeason)
      || (right.resolvedWeek ?? right.createdWeek) - (left.resolvedWeek ?? left.createdWeek)
      || right.id.localeCompare(left.id),
    )
    .slice(0, LEADERSHIP_TERMINAL_RETENTION);
  return Object.fromEntries([...active, ...terminal].map((responsibility) => [
    responsibility.id,
    responsibility,
  ]));
}

function applyLeadershipOutcome(
  state: GameState,
  responsibilityId: string,
  outcome: "succeeded" | "failed" | "rejected",
  reason: string,
  attributedNpcScoutId?: string,
): GameState {
  const portfolio = currentPortfolio(state);
  const responsibility = portfolio.responsibilities[responsibilityId];
  if (!responsibility || !ACTIVE_RESPONSIBILITY_STATUSES.has(responsibility.status)) {
    return state;
  }

  const succeeded = outcome === "succeeded";
  const delegated = responsibility.choice === "delegate";
  const trackRecord = { ...portfolio.trackRecord };
  if (outcome === "rejected") trackRecord.rejected += 1;
  else if (delegated && succeeded) trackRecord.delegatedSuccesses += 1;
  else if (delegated) trackRecord.delegatedFailures += 1;
  else if (responsibility.choice === "own" && succeeded) trackRecord.ownedSuccesses += 1;
  else if (responsibility.choice === "own") trackRecord.ownedFailures += 1;

  const resolvedResponsibility: LeadershipResponsibility = {
    ...responsibility,
    status: outcome,
    resolvedWeek: state.currentWeek,
    resolvedSeason: state.currentSeason,
    outcomeReason: reason,
    attributedNpcScoutId,
  };
  const responsibilities = {
    ...portfolio.responsibilities,
    [responsibility.id]: resolvedResponsibility,
  };

  const stakeholder = responsibility.sourceContactId
    ? { kind: "contact", id: responsibility.sourceContactId }
    : { kind: state.boardProfile ? "board" : "manager", id: responsibility.clubId ?? "career" };
  const subject = attributedNpcScoutId
    ? { kind: "npcScout", id: attributedNpcScoutId }
    : { kind: "scout", id: state.scout.id };
  const memoryId = `leadership-memory:${responsibility.id}:${outcome}`;
  const memory = {
    id: memoryId,
    stakeholder,
    subject,
    tags: ["leadership", delegated ? "delegation" : "personalOwnership", outcome],
    valence: succeeded ? 35 : outcome === "rejected" ? -45 : -30,
    intensity: succeeded ? 55 : 65,
    salience: succeeded ? 48 : 62,
    visibility: "stakeholders" as const,
    createdAt: { week: state.currentWeek, season: state.currentSeason },
    halfLifeWeeks: 104,
    metadata: {
      responsibilityId: responsibility.id,
      title: responsibility.title,
      playerId: responsibility.playerId,
      outcome,
      reason,
    },
  };

  const relationshipDelta = succeeded ? 2 : outcome === "rejected" ? -4 : -3;
  const contacts = responsibility.sourceContactId && state.contacts[responsibility.sourceContactId]
    ? {
        ...state.contacts,
        [responsibility.sourceContactId]: {
          ...state.contacts[responsibility.sourceContactId],
          relationship: Math.max(0, Math.min(
            100,
            state.contacts[responsibility.sourceContactId].relationship + relationshipDelta,
          )),
          trustLevel: Math.max(0, Math.min(
            100,
            (state.contacts[responsibility.sourceContactId].trustLevel
              ?? state.contacts[responsibility.sourceContactId].relationship) + relationshipDelta,
          )),
        },
      }
    : state.contacts;
  const npcScouts = attributedNpcScoutId && state.npcScouts[attributedNpcScoutId]
    ? {
        ...state.npcScouts,
        [attributedNpcScoutId]: {
          ...state.npcScouts[attributedNpcScoutId],
          morale: Math.max(1, Math.min(
            10,
            state.npcScouts[attributedNpcScoutId].morale + (succeeded ? 1 : -1),
          )),
        },
      }
    : state.npcScouts;
  const boardProfile = state.boardProfile
    ? {
        ...state.boardProfile,
        satisfactionLevel: Math.max(0, Math.min(
          100,
          state.boardProfile.satisfactionLevel + relationshipDelta,
        )),
        patience: Math.max(0, Math.min(
          100,
          state.boardProfile.patience + (succeeded ? 1 : -2),
        )),
      }
    : state.boardProfile;
  const managerRelationship = state.scout.managerRelationship
    ? {
        ...state.scout.managerRelationship,
        trust: Math.max(0, Math.min(
          100,
          state.scout.managerRelationship.trust + relationshipDelta,
        )),
      }
    : state.scout.managerRelationship;
  const attributedScout = attributedNpcScoutId ? state.npcScouts[attributedNpcScoutId] : undefined;
  const attribution = attributedScout
    ? ` ${attributedScout.firstName} ${attributedScout.lastName} is named in the outcome record.`
    : "";
  const stakeholderFeedback = responsibility.sourceContactId
    ? ` ${state.contacts[responsibility.sourceContactId]?.name ?? "The source contact"}'s trust changed by ${relationshipDelta >= 0 ? "+" : ""}${relationshipDelta}.`
    : ` Club confidence changed by ${relationshipDelta >= 0 ? "+" : ""}${relationshipDelta}.`;

  return {
    ...state,
    leadershipPortfolio: {
      ...portfolio,
      responsibilities: boundedResponsibilities(responsibilities),
      trackRecord,
    },
    scout: {
      ...state.scout,
      reputation: Math.max(0, Math.min(100, state.scout.reputation + (succeeded ? 1 : -1))),
      clubTrust: state.scout.careerPath === "club"
        ? Math.max(0, Math.min(100, (state.scout.clubTrust ?? 0) + relationshipDelta))
        : state.scout.clubTrust,
      managerRelationship,
    },
    boardProfile,
    contacts,
    npcScouts,
    consequenceState: {
      ...state.consequenceState,
      memories: {
        ...state.consequenceState.memories,
        [memoryId]: memory,
      },
    },
    inbox: [
      ...state.inbox,
      {
        id: `leadership-outcome:${responsibility.id}:${outcome}`,
        week: state.currentWeek,
        season: state.currentSeason,
        type: succeeded ? "feedback" : "event",
        title: succeeded ? "Leadership responsibility delivered" : "Leadership responsibility missed",
        body: `${reason}${attribution}${stakeholderFeedback}`,
        read: false,
        actionRequired: false,
        relatedId: responsibility.playerId,
        relatedEntityType: "player",
      },
    ],
  };
}

export function chooseLeadershipResponsibility(
  state: GameState,
  responsibilityId: string,
  choice: LeadershipResponsibilityChoice,
  npcScoutId?: string,
): LeadershipChoiceResult {
  if (state.scout.careerTier < 4) {
    return { state, accepted: false, reason: "Leadership responsibilities unlock at Tier 4." };
  }
  const portfolio = currentPortfolio(state);
  const responsibility = portfolio.responsibilities[responsibilityId];
  if (!responsibility || responsibility.status !== "open") {
    return { state, accepted: false, reason: "This responsibility is no longer open." };
  }

  const attentionCost = choice === "own" ? 2 : choice === "delegate" ? 1 : 0;
  if (portfolio.attentionUsed + attentionCost > portfolio.attentionCapacity) {
    return {
      state,
      accepted: false,
      reason: `Only ${portfolio.attentionCapacity - portfolio.attentionUsed} leadership attention remains this week.`,
    };
  }

  if (choice === "reject") {
    const rejectingPortfolio: LeadershipPortfolioState = {
      ...portfolio,
      responsibilities: {
        ...portfolio.responsibilities,
        [responsibilityId]: {
          ...responsibility,
          choice: "reject",
          choiceWeek: state.currentWeek,
          choiceSeason: state.currentSeason,
        },
      },
    };
    return {
      state: applyLeadershipOutcome(
        { ...state, leadershipPortfolio: rejectingPortfolio },
        responsibilityId,
        "rejected",
        "You declined the recruitment responsibility and the stakeholder recorded the refusal.",
      ),
      accepted: true,
    };
  }

  if (choice === "defer") {
    const trackRecord = {
      ...portfolio.trackRecord,
      deferrals: portfolio.trackRecord.deferrals + 1,
    };
    if (responsibility.deferrals >= 1) {
      return {
        state: applyLeadershipOutcome(
          {
            ...state,
            leadershipPortfolio: { ...portfolio, trackRecord },
          },
          responsibilityId,
          "failed",
          "A second deferral exhausted the opportunity and damaged confidence in your department.",
        ),
        accepted: true,
      };
    }
    const due = addGameWeeks(
      state.fixtures,
      { week: state.currentWeek, season: state.currentSeason },
      1,
    );
    return {
      state: {
        ...state,
        leadershipPortfolio: {
          ...portfolio,
          responsibilities: {
            ...portfolio.responsibilities,
            [responsibilityId]: {
              ...responsibility,
              status: "deferred",
              choice: "defer",
              choiceWeek: state.currentWeek,
              choiceSeason: state.currentSeason,
              dueWeek: due.week,
              dueSeason: due.season,
              deferrals: responsibility.deferrals + 1,
            },
          },
          trackRecord,
        },
      },
      accepted: true,
    };
  }

  if (choice === "delegate") {
    if (!npcScoutId) {
      return { state, accepted: false, reason: "Choose a scout for this responsibility." };
    }
    const delegated = delegateScoutingTask(state, npcScoutId, responsibility.playerId);
    if (!delegated.result.accepted) {
      return { state, accepted: false, reason: delegated.result.rejectionReason };
    }
    const delegation = Object.values(delegated.state.npcDelegations).find((candidate) =>
      !candidate.completed
      && candidate.npcScoutId === npcScoutId
      && candidate.playerId === responsibility.playerId,
    );
    if (!delegation) {
      return { state, accepted: false, reason: "The delegation could not be recorded." };
    }
    return {
      state: {
        ...delegated.state,
        leadershipPortfolio: {
          ...portfolio,
          attentionUsed: portfolio.attentionUsed + attentionCost,
          responsibilities: {
            ...portfolio.responsibilities,
            [responsibilityId]: {
              ...responsibility,
              status: "delegated",
              choice: "delegate",
              choiceWeek: state.currentWeek,
              choiceSeason: state.currentSeason,
              assignedNpcScoutId: npcScoutId,
              delegationId: delegation.id,
              dueWeek: delegation.completionWeek,
              dueSeason: delegation.completionSeason,
            },
          },
        },
      },
      accepted: true,
    };
  }

  const due = addGameWeeks(
    state.fixtures,
    { week: state.currentWeek, season: state.currentSeason },
    2,
  );
  return {
    state: {
      ...state,
      leadershipPortfolio: {
        ...portfolio,
        attentionUsed: portfolio.attentionUsed + attentionCost,
        responsibilities: {
          ...portfolio.responsibilities,
          [responsibilityId]: {
            ...responsibility,
            status: "owned",
            choice: "own",
            choiceWeek: state.currentWeek,
            choiceSeason: state.currentSeason,
            dueWeek: due.week,
            dueSeason: due.season,
          },
        },
      },
    },
    accepted: true,
  };
}

export function processLeadershipPortfolioWeek(state: GameState): GameState {
  if (state.scout.careerTier < 4) return state;
  let nextState: GameState = {
    ...state,
    leadershipPortfolio: currentPortfolio(state),
  };
  const responsibilities = Object.values(nextState.leadershipPortfolio!.responsibilities)
    .filter((responsibility) => ACTIVE_RESPONSIBILITY_STATUSES.has(responsibility.status))
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const responsibility of responsibilities) {
    const live = nextState.leadershipPortfolio?.responsibilities[responsibility.id];
    if (!live || !ACTIVE_RESPONSIBILITY_STATUSES.has(live.status)) continue;

    if (live.status === "deferred" && isDue(
      nextState.currentWeek,
      nextState.currentSeason,
      live.dueWeek,
      live.dueSeason,
    )) {
      nextState = {
        ...nextState,
        leadershipPortfolio: {
          ...nextState.leadershipPortfolio!,
          responsibilities: {
            ...nextState.leadershipPortfolio!.responsibilities,
            [live.id]: { ...live, status: "open" },
          },
        },
      };
      continue;
    }

    if (live.status === "open" && isDue(
      nextState.currentWeek,
      nextState.currentSeason,
      live.dueWeek,
      live.dueSeason,
    )) {
      const withExpiry = {
        ...nextState,
        leadershipPortfolio: {
          ...nextState.leadershipPortfolio!,
          trackRecord: {
            ...nextState.leadershipPortfolio!.trackRecord,
            expired: nextState.leadershipPortfolio!.trackRecord.expired + 1,
          },
        },
      };
      nextState = applyLeadershipOutcome(
        withExpiry,
        live.id,
        "failed",
        "The responsibility reached its deadline without an ownership decision.",
      );
      continue;
    }

    if (live.status === "owned") {
      const authoredReport = Object.values(nextState.reports).find((report) =>
        report.playerId === live.playerId
        && dateAtOrAfter(
          report.submittedWeek,
          report.submittedSeason,
          live.choiceWeek ?? live.createdWeek,
          live.choiceSeason ?? live.createdSeason,
        ),
      );
      if (authoredReport) {
        const succeeded = authoredReport.qualityScore >= 60;
        nextState = applyLeadershipOutcome(
          nextState,
          live.id,
          succeeded ? "succeeded" : "failed",
          succeeded
            ? `Your ${authoredReport.qualityScore}/100 report resolved the responsibility with defensible evidence.`
            : `Your ${authoredReport.qualityScore}/100 report did not meet the leadership standard.`,
        );
      } else if (isDue(
        nextState.currentWeek,
        nextState.currentSeason,
        live.dueWeek,
        live.dueSeason,
      )) {
        nextState = applyLeadershipOutcome(
          nextState,
          live.id,
          "failed",
          "You owned the responsibility but did not file a report before the deadline.",
        );
      }
      continue;
    }

    if (live.status === "delegated" && live.delegationId) {
      const delegation = nextState.npcDelegations[live.delegationId];
      if (!delegation?.completed) continue;
      const report = delegation.resultReportId
        ? nextState.npcReports[delegation.resultReportId]
        : undefined;
      const assignedScout = live.assignedNpcScoutId
        ? nextState.npcScouts[live.assignedNpcScoutId]
        : undefined;
      const scoutName = assignedScout
        ? `${assignedScout.firstName} ${assignedScout.lastName}`
        : "The assigned scout";
      const succeeded = Boolean(report && report.quality >= 55);
      nextState = applyLeadershipOutcome(
        nextState,
        live.id,
        succeeded ? "succeeded" : "failed",
        report
          ? `${scoutName}'s delegated report graded ${report.quality}/100${succeeded ? " and met" : " and missed"} the responsibility standard.`
          : `${scoutName}'s assignment closed without a usable report.`,
        live.assignedNpcScoutId,
      );
    }
  }

  const portfolio = fillLeadershipPortfolio(
    nextState,
    createLeadershipPortfolioState(
      nextState.leadershipPortfolio,
      nextState.currentWeek,
      nextState.currentSeason,
    ),
  );
  return {
    ...nextState,
    leadershipPortfolio: {
      ...portfolio,
      responsibilities: boundedResponsibilities(portfolio.responsibilities),
    },
  };
}
