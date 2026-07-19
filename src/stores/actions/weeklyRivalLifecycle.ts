import type {
  GameState,
  InboxMessage,
  NarrativeEvent,
} from "@/engine/core/types";
import { getSeasonLength } from "@/engine/core/gameLoop";
import { resolveClubDecision } from "@/engine/reports/scoutingCases";
import {
  advanceYouthRivalPressure,
  generateRivalIntelligence,
  getPoachCounterBidEligibility,
  migrateRivalOrganizationState,
  processRivalOrganizationWeek,
  processRivalScoutWeek,
  resolveRivalSigningAttempt,
  resolveRivalYouthClaim,
  selectYouthRivalTarget,
  type ProcessRivalOrganizationWeekResult,
  type RivalOrganizationOpportunity,
  type RivalScoutWeekResult,
} from "@/engine/rivals";
import { createRNG } from "@/engine/rng";
import { getRunSimulationModifiers } from "@/engine/run";
import {
  getLifecycleWorld,
  resolvePlayerMovements,
  withLifecycleWorld,
} from "@/engine/world/playerLifecycle";
import {
  getPlayerScoutingCountry,
  getWorldConditionModifiers,
} from "@/engine/world";
import { registerNarrativeDecisions } from "./weeklyNarrativeConsequences";
import {
  prepareWeeklyRivalCampaigns,
  type PreparedWeeklyRivalCampaigns,
} from "./weeklyRivalCampaigns";

export interface WeeklyRivalLifecycleResult {
  state: GameState;
  rivalOpportunity?: RivalOrganizationOpportunity;
  rivalCampaignWeek: PreparedWeeklyRivalCampaigns;
  rivalAlertCount: number;
}

function applyYouthRivalClaims(
  state: GameState,
  organizationResult: ProcessRivalOrganizationWeekResult,
): GameState {
  let lifecycle = getLifecycleWorld(state);
  const rivalScouts = { ...state.rivalScouts };
  const unsignedYouth = { ...state.unsignedYouth };
  let rivalActivities = [...(state.rivalActivities ?? [])];
  let inbox = [...state.inbox];
  const placementReports = { ...state.placementReports };
  let scoutingCases = { ...state.scoutingCases };
  let reportDeliveries = { ...state.reportDeliveries };
  let clubDecisions = { ...state.clubDecisions };
  const youthRecruitmentBriefs = { ...state.youthRecruitmentBriefs };

  for (const rival of Object.values(rivalScouts).filter(
    (candidate) => candidate.specialization === "youth",
  )) {
    const target = selectYouthRivalTarget(
      createRNG(
        `${state.seed}-youth-rival-target-${rival.id}-s${state.currentSeason}w${state.currentWeek}`,
      ),
      rival,
      unsignedYouth,
    );
    if (!target) continue;
    const youth = unsignedYouth[target.youthId];
    if (!youth) continue;
    const scoutHasInterest = youth.discoveredBy.includes(state.scout.id)
      || Object.values(state.observations).some(
        (observation) => observation.playerId === youth.player.id,
      )
      || Object.values(state.reports).some(
        (report) => report.playerId === youth.player.id,
      );
    const pressureResult = advanceYouthRivalPressure({
      rival,
      youth,
      week: state.currentWeek,
      season: state.currentSeason,
      scoutHasInterest,
      organizationProgressBonus:
        organizationResult.pressure.sourceOrganizationId
        && organizationResult.state.organizations[
          organizationResult.pressure.sourceOrganizationId
        ]?.memberRivalIds.includes(rival.id)
          ? organizationResult.pressure.youthProgressBonus
          : 0,
      existingActivities: rivalActivities,
      existingMessages: inbox,
    });
    rivalScouts[rival.id] = pressureResult.updatedRival;
    unsignedYouth[youth.id] = pressureResult.updatedYouth;
    rivalActivities = pressureResult.activities;
    inbox = pressureResult.messages;

    for (const brief of Object.values(youthRecruitmentBriefs)) {
      if (
        brief.status === "open"
        && (
          brief.requiredPositions.includes(youth.player.position)
          || youth.player.secondaryPositions.some(
            (position) => brief.requiredPositions.includes(position),
          )
        )
        && pressureResult.pressure > brief.competitionPressure
      ) {
        youthRecruitmentBriefs[brief.id] = {
          ...brief,
          competitionPressure: pressureResult.pressure,
        };
      }
    }

    const claim = resolveRivalYouthClaim(
      createRNG(
        `${state.seed}-youth-rival-claim-${rival.id}-${youth.id}-s${state.currentSeason}w${state.currentWeek}`,
      ),
      {
        rival: pressureResult.updatedRival,
        youth: pressureResult.updatedYouth,
        week: state.currentWeek,
        season: state.currentSeason,
        scoutHasInterest,
        placementReports,
        existingActivities: rivalActivities,
        existingMessages: inbox,
      },
    );
    if (!claim.success || !claim.signedPlayer) continue;

    const detachedPlayer = {
      ...youth.player,
      clubId: "",
      contractClubId: undefined,
      contractExpiry: 0,
      wage: 0,
    };
    const movement = resolvePlayerMovements(
      {
        ...lifecycle,
        players: {
          ...lifecycle.players,
          [detachedPlayer.id]: detachedPlayer,
        },
      },
      [{
        type: "youthSigning",
        playerId: detachedPlayer.id,
        toClubId: rival.clubId,
        contractLength: 3,
        wage: Math.max(100, rival.quality * 150),
        reason: `Rival youth recommendation by ${rival.name}`,
      }],
      state.currentWeek,
      state.currentSeason,
      getSeasonLength(state.fixtures, state.currentSeason),
    );
    if (movement.applied.length === 0) continue;
    lifecycle = movement.state;
    const movedPlayer = lifecycle.players[detachedPlayer.id];
    unsignedYouth[youth.id] = {
      ...claim.updatedYouth,
      ...(movedPlayer ? { player: movedPlayer } : {}),
    };
    rivalScouts[rival.id] = claim.updatedRival;
    rivalActivities = claim.activities;
    inbox = claim.messages;

    for (const placementReportId of claim.displacedPlacementReportIds) {
      const placementReport = placementReports[placementReportId];
      if (!placementReport) continue;
      placementReports[placementReportId] = {
        ...placementReport,
        clubResponse: "rejected",
      };
      if (
        placementReport.deliveryId
        && !reportDeliveries[placementReport.deliveryId]?.decisionId
      ) {
        const resolved = resolveClubDecision({
          scoutingCases,
          reportDeliveries,
          clubDecisions,
          deliveryId: placementReport.deliveryId,
          outcome: "rejected",
          week: state.currentWeek,
          season: state.currentSeason,
          reason: `${rival.name} moved first and the prospect is no longer available.`,
          reasons: [
            "A rival recruitment team completed the youth signing first.",
            "Additional certainty came at the cost of the opportunity.",
          ],
        });
        scoutingCases = resolved.scoutingCases;
        reportDeliveries = resolved.reportDeliveries;
        clubDecisions = resolved.clubDecisions;
        placementReports[placementReportId] = {
          ...placementReports[placementReportId],
          decisionId: resolved.decision?.id,
        };
      } else if (placementReport.caseId && scoutingCases[placementReport.caseId]) {
        scoutingCases[placementReport.caseId] = {
          ...scoutingCases[placementReport.caseId],
          status: "closed",
          lastUpdatedWeek: state.currentWeek,
          lastUpdatedSeason: state.currentSeason,
        };
      }
    }
  }

  return {
    ...withLifecycleWorld(state, lifecycle),
    rivalScouts,
    unsignedYouth,
    rivalActivities: rivalActivities.slice(-50),
    inbox,
    placementReports,
    scoutingCases,
    reportDeliveries,
    clubDecisions,
    youthRecruitmentBriefs,
  };
}

function applyAdultPoachSignings(
  source: GameState,
  signings: RivalScoutWeekResult["poachSignings"],
): GameState {
  let state = source;
  if (signings.length === 0) return state;
  const narrativeEvents: NarrativeEvent[] = [];
  const inboxMessages: InboxMessage[] = [];

  for (const signing of signings) {
    const rivalScout = state.rivalScouts[signing.rivalId];
    const player = state.players[signing.playerId];
    if (!rivalScout || !player) continue;

    const resolvedSigning = resolveRivalSigningAttempt(
      getLifecycleWorld(state),
      rivalScout,
      player.id,
      state.currentWeek,
      state.currentSeason,
    );
    if (!resolvedSigning.success) continue;

    state = withLifecycleWorld(state, resolvedSigning.lifecycle);
    const signedPlayer = state.players[player.id];
    if (!signedPlayer) continue;

    const rivalName = rivalScout.name;
    const playerName = `${signedPlayer.firstName} ${signedPlayer.lastName}`;
    const rivalClub = state.clubs[rivalScout.clubId];
    const eligibility = getPoachCounterBidEligibility(
      getLifecycleWorld(state),
      rivalScout,
      signedPlayer,
      state.scout,
    );
    const cleanedRival = {
      ...rivalScout,
      targetPlayerIds: rivalScout.targetPlayerIds.filter((id) => id !== player.id),
      competingForPlayers: rivalScout.competingForPlayers.filter((id) => id !== player.id),
      currentTarget: rivalScout.currentTarget === player.id
        ? undefined
        : rivalScout.currentTarget,
    };
    state = {
      ...state,
      rivalScouts: {
        ...state.rivalScouts,
        [rivalScout.id]: cleanedRival,
      },
      rivalActivities: [
        ...(state.rivalActivities ?? []),
        {
          rivalId: rivalScout.id,
          type: "playerSigned" as const,
          playerId: player.id,
          week: state.currentWeek,
          season: state.currentSeason,
        },
      ].slice(-50),
    };

    const eventId = `poach-bid-${signing.rivalId}-${signing.playerId}-w${state.currentWeek}`;
    if (!eligibility.eligible) {
      state = {
        ...state,
        rivalScouts: {
          ...state.rivalScouts,
          [rivalScout.id]: {
            ...cleanedRival,
            winsAgainstPlayer: (cleanedRival.winsAgainstPlayer ?? 0) + 1,
          },
        },
      };
      inboxMessages.push({
        id: `rival-signing-${eventId}`,
        week: state.currentWeek,
        season: state.currentSeason,
        type: "event" as const,
        title: `Player Signed by ${rivalClub?.name ?? "Rival Club"}`,
        body: `${rivalClub?.name ?? "The rival club"} completed the signing of ${playerName} following ${rivalName}'s recommendation. ${eligibility.reason ?? "Your club cannot submit a valid counter-bid."}`,
        read: false,
        actionRequired: false,
        relatedId: player.id,
        relatedEntityType: "player" as const,
      });
      continue;
    }

    const narrativeEvent: NarrativeEvent = {
      id: eventId,
      type: "rivalPoachBid",
      week: state.currentWeek,
      season: state.currentSeason,
      title: `Rival Signing: ${playerName}`,
      description:
        `${rivalName} has signed ${playerName} — a player you previously reported on. `
        + `Your club can attempt a ${eligibility.cost.toLocaleString()} transfer or concede the player.`,
      relatedIds: [signing.playerId, signing.rivalId],
      acknowledged: false,
      choices: [
        { label: `Counter-Bid (${eligibility.cost.toLocaleString()})`, effect: "counterBid" },
        { label: "Concede", effect: "concede" },
      ],
      selectedChoice: undefined,
    };
    narrativeEvents.push(narrativeEvent);
    inboxMessages.push({
      id: `narrative-${eventId}`,
      week: state.currentWeek,
      season: state.currentSeason,
      type: "event" as const,
      title: narrativeEvent.title,
      body: narrativeEvent.description,
      read: false,
      actionRequired: true,
      relatedId: narrativeEvent.id,
    });
  }

  return registerNarrativeDecisions({
    ...state,
    narrativeEvents: [...state.narrativeEvents, ...narrativeEvents],
    inbox: [...state.inbox, ...inboxMessages],
  }, narrativeEvents);
}

/** Run every rival authority in its canonical organization/adult/youth/signing order. */
export function runWeeklyRivalLifecycle(input: {
  state: GameState;
  seedSource: Pick<GameState, "seed" | "currentWeek" | "currentSeason">;
}): WeeklyRivalLifecycleResult {
  let state = input.state;
  const organizationBase = migrateRivalOrganizationState(
    state.seed,
    state.rivalScouts,
    state.rivalOrganizationState,
    Math.max(1, state.currentSeason),
  );
  const organizationResult = processRivalOrganizationWeek(
    organizationBase,
    {
      rootSeed: state.seed,
      season: state.currentSeason,
      week: state.currentWeek,
      seasonLength: getSeasonLength(state.fixtures, state.currentSeason),
      rivalScouts: state.rivalScouts,
    },
  );
  const organizationFacts = Object.fromEntries(
    organizationResult.facts.map((fact) => [fact.id, fact]),
  );
  state = {
    ...state,
    rivalOrganizationState: organizationResult.state,
    consequenceState: {
      ...state.consequenceState,
      facts: {
        ...state.consequenceState.facts,
        ...organizationFacts,
      },
    },
  };
  const rivalCampaignWeek = prepareWeeklyRivalCampaigns({
    state,
    seasonLength: getSeasonLength(state.fixtures, state.currentSeason),
  });
  state = rivalCampaignWeek.state;

  const rivalRng = createRNG(
    `${input.seedSource.seed}-rivals-${input.seedSource.currentWeek}-${input.seedSource.currentSeason}`,
  );
  const rivalModifiers = getRunSimulationModifiers(state.runManifest);
  const rivalResult = processRivalScoutWeek(rivalRng, state, {
    discoveryChanceMultiplier:
      rivalModifiers.rivalDiscoveryChanceMultiplier
      * organizationResult.pressure.discoveryChanceMultiplier,
    poachChanceMultiplier:
      rivalModifiers.rivalPoachChanceMultiplier
      * organizationResult.pressure.poachChanceMultiplier,
    signingChanceMultiplier:
      rivalModifiers.rivalSigningChanceMultiplier
      * organizationResult.pressure.signingChanceMultiplier,
    contextualPressureMultiplier: (rival, playerId) => {
      const playerCountry = playerId
        ? getPlayerScoutingCountry(state, playerId)
        : undefined;
      const rivalClub = rival.clubId ? state.clubs[rival.clubId] : undefined;
      const rivalCountry = rivalClub
        ? state.leagues[rivalClub.leagueId]?.country
        : undefined;
      return getWorldConditionModifiers(
        state,
        playerCountry ?? rivalCountry,
      ).rivalPressureMultiplier;
    },
  });
  let rivalInboxMessages: InboxMessage[] = [...rivalResult.newMessages];
  if (rivalResult.poachWarnings.length > 0) {
    rivalInboxMessages = [
      ...rivalInboxMessages,
      ...rivalResult.poachWarnings.map((warning): InboxMessage => {
        const rivalScout = rivalResult.updatedRivals[warning.rivalId];
        const player = state.players[warning.playerId];
        const rivalName = rivalScout?.name ?? "A rival scout";
        const playerName = player
          ? `${player.firstName} ${player.lastName}`
          : "a player you have reported on";
        return {
          id: `rival-poach-${warning.rivalId}-${warning.playerId}-w${state.currentWeek}`,
          week: state.currentWeek,
          season: state.currentSeason,
          type: "event",
          title: "Rival Scout Alert",
          body: `${rivalName} is now tracking ${playerName} — a player you have already reported on. Consider submitting a stronger recommendation before they act.`,
          read: false,
          actionRequired: false,
          relatedId: warning.playerId,
          relatedEntityType: "player",
        };
      }),
    ];
  }
  rivalInboxMessages = [
    ...rivalInboxMessages,
    ...generateRivalIntelligence(rivalRng, state, state.contacts),
  ];
  state = {
    ...state,
    rivalScouts: rivalResult.updatedRivals,
    rivalActivities: [
      ...(state.rivalActivities ?? []),
      ...rivalResult.newActivities,
    ].slice(-50),
    inbox: [...state.inbox, ...rivalInboxMessages],
  };

  state = applyYouthRivalClaims(state, organizationResult);
  state = applyAdultPoachSignings(state, rivalResult.poachSignings);

  return {
    state,
    rivalOpportunity: organizationResult.opportunity,
    rivalCampaignWeek,
    rivalAlertCount: rivalInboxMessages.length,
  };
}
