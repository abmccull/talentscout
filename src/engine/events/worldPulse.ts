import type {
  Club,
  GameState,
  InboxMessage,
} from "@/engine/core/types";
import { elapsedGameWeeks } from "@/engine/consequences/decisionLedger";
import type { StoryCandidateV2 } from "@/engine/events/storyDirectorV2";
import { createNamedRNG } from "@/engine/run";
import { deriveScoutingCaseQuestions } from "@/engine/reports/caseQuestions";
import {
  deriveTerritoryIdentityIndex,
  formatWorldConditionCountry,
} from "@/engine/world";

export const WORLD_PULSE_MIN_QUIET_WEEKS = 2;
export const WORLD_PULSE_MIN_GAP_WEEKS = 4;

export interface PreparedWorldPulse {
  candidate: StoryCandidateV2;
  message: InboxMessage;
}

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function playerName(state: GameState, playerId: string): string {
  const player = state.players[playerId] ?? state.retiredPlayers?.[playerId];
  const first = player?.firstName?.trim();
  const last = player?.lastName?.trim();
  if (first || last) return [first, last].filter(Boolean).join(" ");
  const youth = Object.values(state.unsignedYouth ?? {}).find((entry) => entry.player.id === playerId);
  const youthFirst = youth?.player.firstName?.trim();
  const youthLast = youth?.player.lastName?.trim();
  return [youthFirst, youthLast].filter(Boolean).join(" ") || "This prospect";
}

function weeksSinceLastPulse(state: GameState, seasonLength: number): number | undefined {
  const now = { season: state.currentSeason, week: state.currentWeek };
  const ages = (state.storyDirectorV2?.recentOccurrences ?? [])
    .filter((occurrence) => occurrence.kind === "worldPulse")
    .map((occurrence) => elapsedGameWeeks(now, occurrence.occurredAt, seasonLength))
    .filter((age) => age >= 0)
    .sort((left, right) => left - right);
  return ages[0];
}

function clubsInCountry(state: GameState, countryId: string): Club[] {
  return Object.values(state.clubs)
    .filter((club) => state.leagues[club.leagueId]?.country?.toLowerCase() === countryId)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function countOfferedChoices(state: GameState): number {
  return Object.values(state.consequenceState.decisions ?? {})
    .filter((decision) => decision.status === "offered")
    .length;
}

function buildCasePulse(state: GameState): PreparedWorldPulse | undefined {
  const candidate = Object.values(state.scoutingCases ?? {})
    .map((scoutingCase) => {
      const snapshot = deriveScoutingCaseQuestions(state, scoutingCase.id);
      const question = snapshot?.activeQuestions[0];
      const callback = snapshot?.callbacks[0];
      if (!snapshot || (!question && !callback)) return null;
      return { scoutingCase, snapshot, question, callback };
    })
    .filter((entry) => entry !== null)
    .sort((left, right) =>
      (right.snapshot.activeQuestions.length - left.snapshot.activeQuestions.length)
      || (right.snapshot.callbacks.length - left.snapshot.callbacks.length)
      || left.scoutingCase.id.localeCompare(right.scoutingCase.id)
    )[0];
  if (!candidate) return undefined;

  const prospectName = playerName(state, candidate.scoutingCase.playerId);
  const context = candidate.question?.recommendedContexts[0];
  const contextLine = context
    ? `The cleanest next read is ${humanize(context.context)} because ${context.reason.toLowerCase()}.`
    : undefined;
  const lines = [
    candidate.question?.whyNow
      ?? candidate.callback?.summary
      ?? "The file remains open because the story around the player has not settled yet.",
    candidate.question?.evidenceGap,
    contextLine,
    candidate.callback && candidate.callback.summary !== candidate.question?.whyNow
      ? `Latest callback: ${candidate.callback.summary}`
      : undefined,
  ].filter((line): line is string => Boolean(line));

  return {
    candidate: {
      id: `world-pulse:case:${candidate.scoutingCase.id}:s${state.currentSeason}w${state.currentWeek}`,
      templateId: "world-pulse:case",
      kind: "worldPulse",
      category: "world-pulse",
      semanticSignature: `world-pulse:case:${candidate.scoutingCase.id}:${candidate.question?.family ?? "callback"}`,
      baseWeight: 1.35 + Math.min(0.4, candidate.snapshot.activeQuestions.length * 0.12),
      cast: [{ kind: "player", id: candidate.scoutingCase.playerId }],
      topics: [
        { kind: "player", id: candidate.scoutingCase.playerId },
        { kind: "case", id: candidate.scoutingCase.id },
      ],
      templateCooldownWeeks: 4,
      semanticCooldownWeeks: 10,
      castWindowWeeks: 6,
      castMaxUses: 1,
      topicCooldownWeeks: 8,
    },
    message: {
      id: `world-pulse:case:${candidate.scoutingCase.id}:s${state.currentSeason}w${state.currentWeek}`,
      week: state.currentWeek,
      season: state.currentSeason,
      type: "news",
      title: `${prospectName}: the case is still moving`,
      body: lines.join("\n"),
      read: false,
      actionRequired: false,
      relatedId: candidate.scoutingCase.playerId,
      relatedEntityType: "player",
    },
  };
}

function buildTerritoryPulse(state: GameState): PreparedWorldPulse | undefined {
  const identity = Object.values(deriveTerritoryIdentityIndex(state))
    .filter((entry) =>
      entry.opportunityWindow !== "quiet"
      || entry.presence.accessScore >= 30
      || entry.presence.worldConditionNames.length > 0
    )
    .sort((left, right) =>
      right.presence.accessScore - left.presence.accessScore
      || right.presence.worldConditionNames.length - left.presence.worldConditionNames.length
      || left.countryId.localeCompare(right.countryId)
    )[0];
  if (!identity) return undefined;

  const clubs = clubsInCountry(state, identity.countryId);
  const leadClub = clubs[0];
  const focus = humanize(identity.clubDemandMix.dominantFocus ?? identity.regionIdentity.seasonalFocus);
  const philosophy = identity.clubDemandMix.dominantPhilosophy
    ? humanize(identity.clubDemandMix.dominantPhilosophy)
    : undefined;
  const conditionLine = identity.presence.worldConditionNames.length > 0
    ? `World conditions in play: ${identity.presence.worldConditionNames.join(", ")}.`
    : undefined;
  const clubLine = leadClub
    ? `${leadClub.name} and nearby clubs are reading the market through a ${focus.toLowerCase()} lens${philosophy ? `, with ${philosophy.toLowerCase()} instincts shaping demand` : ""}.`
    : `${formatWorldConditionCountry(identity.countryId)} is leaning toward ${focus.toLowerCase()} profiles right now.`;

  return {
    candidate: {
      id: `world-pulse:territory:${identity.countryId}:s${state.currentSeason}w${state.currentWeek}`,
      templateId: "world-pulse:territory",
      kind: "worldPulse",
      category: "world-pulse",
      semanticSignature: `world-pulse:territory:${identity.countryId}:${identity.opportunityWindow}:${identity.archetype}`,
      baseWeight: identity.opportunityWindow === "urgent"
        ? 1.45
        : identity.opportunityWindow === "active"
          ? 1.25
          : 1,
      cast: leadClub ? [{ kind: "club", id: leadClub.id }] : [],
      topics: [{ kind: "territory", id: identity.countryId }],
      templateCooldownWeeks: 4,
      semanticCooldownWeeks: 12,
      castWindowWeeks: 6,
      castMaxUses: 1,
      topicCooldownWeeks: 10,
    },
    message: {
      id: `world-pulse:territory:${identity.countryId}:s${state.currentSeason}w${state.currentWeek}`,
      week: state.currentWeek,
      season: state.currentSeason,
      type: "news",
      title: `${formatWorldConditionCountry(identity.countryId)}: local market pulse`,
      body: [
        `${formatWorldConditionCountry(identity.countryId)} is ${identity.opportunityWindow} rather than neutral.`,
        identity.presence.summary,
        clubLine,
        conditionLine,
      ].filter((line): line is string => Boolean(line)).join("\n"),
      read: false,
      actionRequired: false,
      relatedId: leadClub?.id,
      relatedEntityType: leadClub ? "narrative" : undefined,
    },
  };
}

function buildRivalPulse(state: GameState): PreparedWorldPulse | undefined {
  const organization = Object.values(state.rivalOrganizationState.organizations ?? {})
    .filter((entry) => entry.heat >= 45 || Math.abs(entry.momentum) >= 2)
    .sort((left, right) =>
      right.heat - left.heat
      || Math.abs(right.momentum) - Math.abs(left.momentum)
      || left.id.localeCompare(right.id)
    )[0];
  if (!organization) return undefined;
  const rivalNames = organization.memberRivalIds
    .map((rivalId) => state.rivalScouts[rivalId]?.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, 2);
  const rivalryLine = rivalNames.length > 0
    ? `Known faces in that lane include ${rivalNames.join(" and ")}.`
    : "The same network keeps showing up around the live names in that lane.";

  return {
    candidate: {
      id: `world-pulse:rival:${organization.id}:s${state.currentSeason}w${state.currentWeek}`,
      templateId: "world-pulse:rival",
      kind: "worldPulse",
      category: "world-pulse",
      semanticSignature: `world-pulse:rival:${organization.id}:${organization.agendaId}`,
      baseWeight: 1.1 + Math.min(0.35, organization.heat / 200),
      cast: [{ kind: "rivalOrganization", id: organization.id }],
      topics: organization.memberRivalIds.map((rivalId) => ({ kind: "rival", id: rivalId })),
      templateCooldownWeeks: 4,
      semanticCooldownWeeks: 10,
      castWindowWeeks: 6,
      castMaxUses: 1,
      topicCooldownWeeks: 8,
    },
    message: {
      id: `world-pulse:rival:${organization.id}:s${state.currentSeason}w${state.currentWeek}`,
      week: state.currentWeek,
      season: state.currentSeason,
      type: "news",
      title: `${organization.name}: rival pressure persists`,
      body: [
        `${organization.name} are still pushing ${humanize(organization.agendaId).toLowerCase()} rather than changing lanes.`,
        rivalryLine,
        organization.momentum >= 2
          ? "Recent weeks have leaned their way, so the same introductions will feel more contested until something breaks."
          : organization.momentum <= -2
            ? "Their recent setbacks have slowed them, but the network has not disappeared."
            : "They have not won the lane, but they have kept enough heat on it that doors will not stay open automatically.",
      ].join("\n"),
      read: false,
      actionRequired: false,
      relatedId: organization.id,
      relatedEntityType: "narrative",
    },
  };
}

function selectPulse(
  state: GameState,
  pulses: readonly PreparedWorldPulse[],
): PreparedWorldPulse | undefined {
  if (pulses.length === 0) return undefined;
  if (pulses.length === 1) return pulses[0];
  const fingerprint = pulses.map((pulse) => pulse.candidate.id).join("|");
  const rng = createNamedRNG(
    state.runManifest.rootSeed,
    "world-pulse-selection",
    state.currentSeason,
    state.currentWeek,
    fingerprint,
  );
  const total = pulses.reduce((sum, pulse) => sum + pulse.candidate.baseWeight, 0);
  let threshold = rng.next() * total;
  for (const pulse of pulses) {
    threshold -= pulse.candidate.baseWeight;
    if (threshold <= 0) return pulse;
  }
  return pulses.at(-1);
}

/**
 * Prepare one low-intensity world pulse only when the weekly surface would
 * otherwise stay quiet. This never creates a choice or a competing event lane.
 */
export function prepareWeeklyWorldPulse(input: {
  state: GameState;
  seasonLength?: number;
  blockedByActivity?: boolean;
}): PreparedWorldPulse | undefined {
  const seasonLength = Math.max(1, Math.floor(input.seasonLength ?? 38));
  if (input.blockedByActivity) return undefined;
  if ((input.state.eventDirector?.quietWeeks ?? 0) < WORLD_PULSE_MIN_QUIET_WEEKS) return undefined;
  if (countOfferedChoices(input.state) > 0) return undefined;
  const weeksSincePulse = weeksSinceLastPulse(input.state, seasonLength);
  if (weeksSincePulse !== undefined && weeksSincePulse < WORLD_PULSE_MIN_GAP_WEEKS) {
    return undefined;
  }
  return selectPulse(input.state, [
    buildCasePulse(input.state),
    buildTerritoryPulse(input.state),
    buildRivalPulse(input.state),
  ].filter((pulse): pulse is PreparedWorldPulse => pulse !== undefined));
}

export function applyDirectedWorldPulse(input: {
  state: GameState;
  prepared?: PreparedWorldPulse;
  acceptedCandidateIds: ReadonlySet<string>;
}): GameState {
  const prepared = input.prepared;
  if (!prepared || !input.acceptedCandidateIds.has(prepared.candidate.id)) return input.state;
  if (input.state.inbox.some((message) => message.id === prepared.message.id)) return input.state;
  return {
    ...input.state,
    inbox: [...input.state.inbox, prepared.message],
  };
}
