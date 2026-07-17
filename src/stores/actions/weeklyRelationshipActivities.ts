import type { GameState, InboxMessage } from "@/engine/core/types";
import type { WeekProcessingResult } from "@/engine/core/calendar";
import { getSeasonLength } from "@/engine/core/gameLoop";
import { createRNG } from "@/engine/rng";
import { conductBoardMeeting, conductManagerMeeting } from "@/engine/career";
import { isContactAccessSuspended, meetContact } from "@/engine/network/contacts";
import { getActiveToolBonuses } from "@/engine/tools/unlockables";
import {
  getContextualEquipmentBonuses,
  getLifestyleNetworkingBonus,
} from "@/engine/finance";
import { getScoutHomeCountry } from "@/engine/world/travel";
import { processContactFreeAgentTip } from "@/engine/freeAgents/discovery";
import { processContactTournamentTip } from "@/engine/youth";
import { resolvePlayerEntity, resolveUnsignedYouth } from "@/lib/playerResolution";
import { humanizeIdentifier } from "./weeklySimulationSupport";

export interface WeeklyRelationshipActivitiesInput {
  state: GameState;
  sourceState: GameState;
  result: Pick<
    WeekProcessingResult,
    | "npcReportsReviewed"
    | "managerMeetingExecuted"
    | "boardPresentationExecuted"
    | "meetingsHeld"
  >;
  relationshipModifiers: ReadonlyMap<string, number>;
}

/** Resolve administrative and relationship activities in their canonical order. */
export function processWeeklyRelationshipActivities(
  input: WeeklyRelationshipActivitiesInput,
): GameState {
  let state = input.state;

  if (input.result.npcReportsReviewed.length > 0) {
    const reports = { ...state.npcReports };
    for (const reportId of input.result.npcReportsReviewed) {
      const report = reports[reportId];
      if (report) reports[reportId] = { ...report, reviewed: true };
    }
    state = { ...state, npcReports: reports };
  }

  if (input.result.managerMeetingExecuted && state.scout.managerRelationship) {
    state = conductManagerMeeting(state, "listen", { fatigueAlreadyPaid: true }).state;
  }
  if (input.result.boardPresentationExecuted && state.scout.careerTier === 5) {
    state = conductBoardMeeting(state, "accountability", { fatigueAlreadyPaid: true }).state;
  }
  if (input.result.meetingsHeld.length === 0) return state;

  const contacts = { ...state.contacts };
  const messages: InboxMessage[] = [];
  let contactIntel = { ...(state.contactIntel ?? {}) };
  const toolBonuses = getActiveToolBonuses(state.unlockedTools);
  const homeCountry = getScoutHomeCountry(state.scout);

  for (const contactId of input.result.meetingsHeld) {
    const contact = contacts[contactId];
    if (!contact) continue;
    const equipmentBonuses = state.finances?.equipment
      ? getContextualEquipmentBonuses(
          state.finances.equipment.loadout,
          {
            scoutHomeCountry: homeCountry,
            country: contact.country ?? contact.region,
          },
        )
      : undefined;
    const currentDate = {
      season: input.sourceState.currentSeason,
      week: input.sourceState.currentWeek,
    };
    if (isContactAccessSuspended(contact, currentDate)) continue;
    const rng = createRNG(
      `${input.sourceState.seed}-meeting-${contactId}-${input.sourceState.currentWeek}-${input.sourceState.currentSeason}`,
    );
    const result = meetContact(rng, state.scout, contact, {
      consequenceState: state.consequenceState,
      now: { week: state.currentWeek, season: state.currentSeason },
      seasonLength: getSeasonLength(state.fixtures, state.currentSeason),
    });
    const interactionBonus = (input.relationshipModifiers.get("networkMeeting") ?? 0) * 0.05;
    const lifestyleBonus = state.finances
      ? getLifestyleNetworkingBonus(state.finances.lifestyle)
      : 0;
    const relationshipBonus = (toolBonuses.relationshipGainBonus ?? 0)
      + (equipmentBonuses?.relationshipGainBonus ?? 0)
      + interactionBonus
      + lifestyleBonus;
    const adjustedChange = result.relationshipChange >= 0
      ? Math.max(1, Math.round(result.relationshipChange * (1 + relationshipBonus)))
      : result.relationshipChange;
    const relationship = Math.max(0, Math.min(100, contact.relationship + adjustedChange));
    const actualChange = relationship - contact.relationship;
    const trust = Math.max(
      0,
      Math.min(100, (contact.trustLevel ?? contact.relationship) + (result.trustDelta ?? 0)),
    );
    const interaction = result.interaction;
    contacts[contactId] = {
      ...contact,
      relationship,
      trustLevel: trust,
      lastInteractionAt: currentDate,
      interactionHistory: interaction
        ? [...(contact.interactionHistory ?? []), interaction]
        : (contact.interactionHistory ?? []),
    };

    const reliabilityBonus = equipmentBonuses?.intelReliabilityBonus ?? 0;
    for (const hint of result.intel) {
      const adjusted = reliabilityBonus > 0
        ? { ...hint, reliability: Math.min(1, hint.reliability + reliabilityBonus) }
        : hint;
      contactIntel[adjusted.playerId] = [
        ...(contactIntel[adjusted.playerId] ?? []),
        adjusted,
      ];
    }

    const relationshipLine = actualChange > 0
      ? `Relationship improved by ${actualChange} point${actualChange === 1 ? "" : "s"} (now ${relationship}/100).`
      : actualChange < 0
        ? `Relationship declined by ${Math.abs(actualChange)} point${Math.abs(actualChange) === 1 ? "" : "s"} (now ${relationship}/100).`
        : `Relationship held steady at ${relationship}/100.`;
    const parts = [
      `You met with ${contact.name} (${humanizeIdentifier(contact.type)}).`,
      relationshipLine,
    ];
    if (result.stakeholderMemoryReason) {
      parts.push("", `PAST DEALINGS: ${result.stakeholderMemoryReason}`);
    }
    for (const intel of result.intel) {
      const player = resolvePlayerEntity(state, intel.playerId)?.player
        ?? state.players[intel.playerId];
      parts.push(
        "",
        `INTEL on ${player ? `${player.firstName} ${player.lastName}` : "a player"}: ${intel.hint}`,
      );
    }
    for (const tip of result.tips) {
      const player = resolvePlayerEntity(state, tip.playerId)?.player
        ?? state.players[tip.playerId];
      parts.push(
        "",
        `TIP: ${player ? `${player.firstName} ${player.lastName}` : "a player"} ${tip.description}`,
      );
    }

    if (state.scout.primarySpecialization === "youth") {
      for (const tip of result.tips) {
        const youth = resolveUnsignedYouth(state, tip.playerId);
        if (!youth || youth.placed || youth.retired) continue;
        state = {
          ...state,
          unsignedYouth: {
            ...state.unsignedYouth,
            [youth.id]: {
              ...youth,
              visibility: Math.min(100, youth.visibility + 5),
              buzzLevel: Math.min(100, youth.buzzLevel + 5),
              discoveredBy: youth.discoveredBy.includes(state.scout.id)
                ? youth.discoveredBy
                : [...youth.discoveredBy, state.scout.id],
            },
          },
        };
      }
    }
    for (const tip of result.tips) {
      if (tip.tipType === "contractRunningDown" && state.freeAgentPool) {
        state = {
          ...state,
          freeAgentPool: processContactFreeAgentTip(state.freeAgentPool, tip.playerId),
        };
      }
    }
    messages.push({
      id: `meeting-${contactId}-w${input.sourceState.currentWeek}-s${input.sourceState.currentSeason}`,
      week: state.currentWeek,
      season: state.currentSeason,
      type: "event",
      title: `Meeting with ${contact.name}`,
      body: parts.join("\n"),
      read: false,
      actionRequired: false,
    });
  }

  state = {
    ...state,
    contacts,
    contactIntel,
    inbox: [...state.inbox, ...messages],
  };

  const tipMessages: InboxMessage[] = [];
  const tournaments = { ...(state.youthTournaments ?? {}) };
  for (const contactId of input.result.meetingsHeld) {
    const contact = contacts[contactId];
    if (!contact) continue;
    const rng = createRNG(
      `${input.sourceState.seed}-tip-${contactId}-w${input.sourceState.currentWeek}-s${input.sourceState.currentSeason}`,
    );
    const tournament = processContactTournamentTip(
      rng,
      contact,
      tournaments,
      state.subRegions,
      state.currentWeek,
      state.currentSeason,
    );
    if (!tournament) continue;
    tournaments[tournament.id] = tournament;
    tipMessages.push({
      id: `tournament-tip-${tournament.id}`,
      week: state.currentWeek,
      season: state.currentSeason,
      type: "event",
      title: `Tournament Tip: ${tournament.name}`,
      body: `${contact.name} mentioned ${tournament.name} — a ${tournament.prestige} youth tournament in ${tournament.country} (weeks ${tournament.startWeek}–${tournament.endWeek}). Consider scheduling a visit.`,
      read: false,
      actionRequired: false,
    });
  }
  return tipMessages.length > 0
    ? {
        ...state,
        youthTournaments: tournaments,
        inbox: [...state.inbox, ...tipMessages],
      }
    : state;
}
