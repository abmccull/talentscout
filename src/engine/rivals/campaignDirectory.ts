import type {
  Contact,
  GameState,
  Player,
  TournamentEvent,
  UnsignedYouth,
} from "@/engine/core/types";
import { getRecurringRelationshipIdentities } from "@/engine/consequences/relationshipIdentities";
import type {
  RivalCampaignDirectory,
  RivalCampaignTarget,
} from "./campaigns";

function playerName(player: Pick<Player, "firstName" | "lastName">): string {
  return `${player.firstName} ${player.lastName}`.trim();
}

function youthName(youth: Pick<UnsignedYouth, "player">): string {
  return playerName(youth.player);
}

function addTarget(
  map: Map<string, RivalCampaignTarget>,
  target: RivalCampaignTarget,
): void {
  map.set(`${target.entity.kind}:${target.entity.id}`, target);
}

function visibleKnownPlayerIds(state: GameState): Set<string> {
  const known = new Set<string>();
  for (const observation of Object.values(state.observations)) {
    known.add(observation.playerId);
  }
  for (const report of Object.values(state.reports)) {
    known.add(report.playerId);
  }
  for (const intelList of Object.values(state.contactIntel ?? {})) {
    for (const intel of intelList) {
      known.add(intel.playerId);
    }
  }
  for (const youth of Object.values(state.unsignedYouth ?? {})) {
    if (youth.discoveredBy.includes(state.scout.id)) {
      known.add(youth.player.id);
    }
  }
  return known;
}

function buildPlayerTargets(
  state: GameState,
  knownPlayerIds: ReadonlySet<string>,
): RivalCampaignTarget[] {
  const targets = new Map<string, RivalCampaignTarget>();
  for (const playerId of knownPlayerIds) {
    const player = state.players[playerId];
    if (player) {
      const club = state.clubs[player.clubId];
      const league = club ? state.leagues[club.leagueId] : undefined;
      addTarget(targets, {
        entity: { kind: "player", id: player.id },
        label: playerName(player),
        playerId: player.id,
        clubId: player.clubId,
        regionId: league?.country,
      });
      continue;
    }
    const unsignedYouth = Object.values(state.unsignedYouth).find(
      (candidate) => candidate.player.id === playerId && candidate.discoveredBy.includes(state.scout.id),
    );
    if (unsignedYouth) {
      addTarget(targets, {
        entity: { kind: "player", id: unsignedYouth.player.id },
        label: youthName(unsignedYouth),
        playerId: unsignedYouth.player.id,
        regionId: unsignedYouth.country,
      });
    }
  }
  return [...targets.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function buildContactTargets(state: GameState): RivalCampaignTarget[] {
  const targets = new Map<string, RivalCampaignTarget>();
  for (const contact of Object.values(state.contacts)) {
    if (contact.type === "journalist") continue;
    if (
      contact.relationship < 25
      && (contact.knownPlayerIds?.length ?? 0) === 0
      && (contact.referralNetwork?.length ?? 0) === 0
    ) {
      continue;
    }
    addTarget(targets, {
      entity: { kind: "contact", id: contact.id },
      label: contact.name,
      regionId: contact.country ?? contact.region,
      notes: [contact.organization],
    });
  }
  return [...targets.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function buildJournalistTargets(state: GameState): RivalCampaignTarget[] {
  const targets = new Map<string, RivalCampaignTarget>();
  for (const identity of getRecurringRelationshipIdentities(state)) {
    if (identity.role !== "journalist") continue;
    addTarget(targets, {
      entity: { kind: "journalist", id: identity.entity.id },
      label: identity.name,
      notes: identity.affiliation ? [identity.affiliation] : undefined,
    });
  }
  for (const contact of Object.values(state.contacts)) {
    if (contact.type !== "journalist") continue;
    addTarget(targets, {
      entity: { kind: "journalist", id: contact.id },
      label: contact.name,
      regionId: contact.country ?? contact.region,
      notes: [contact.organization],
    });
  }
  return [...targets.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function buildEmployeeTargets(state: GameState): RivalCampaignTarget[] {
  const targets = new Map<string, RivalCampaignTarget>();
  for (const employee of state.finances?.employees ?? []) {
    addTarget(targets, {
      entity: { kind: "employee", id: employee.id },
      label: employee.name,
      regionId: employee.regionSpecialization,
      notes: [employee.role],
    });
  }
  return [...targets.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function buildFamilyTargets(state: GameState): RivalCampaignTarget[] {
  const targets = new Map<string, RivalCampaignTarget>();
  for (const identity of getRecurringRelationshipIdentities(state)) {
    if (identity.role !== "family") continue;
    addTarget(targets, {
      entity: { kind: "family", id: identity.entity.id },
      label: identity.name,
      notes: identity.affiliation ? [identity.affiliation] : undefined,
    });
  }
  return [...targets.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function buildClubTargets(
  state: GameState,
  knownPlayerIds: ReadonlySet<string>,
): RivalCampaignTarget[] {
  const knownClubIds = new Set<string>();
  if (state.scout.currentClubId) knownClubIds.add(state.scout.currentClubId);
  for (const playerId of knownPlayerIds) {
    const player = state.players[playerId];
    if (player?.clubId) knownClubIds.add(player.clubId);
  }
  for (const placement of Object.values(state.placementReports ?? {})) {
    if (placement.targetClubId) knownClubIds.add(placement.targetClubId);
  }
  const targets = new Map<string, RivalCampaignTarget>();
  for (const clubId of [...knownClubIds]) {
    const club = state.clubs[clubId];
    if (!club) continue;
    addTarget(targets, {
      entity: { kind: "club", id: club.id },
      label: club.name,
      clubId: club.id,
      notes: club.leagueId ? [state.leagues[club.leagueId]?.name ?? club.leagueId] : undefined,
    });
  }
  return [...targets.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function buildVenueTargets(state: GameState): RivalCampaignTarget[] {
  const targets = new Map<string, RivalCampaignTarget>();
  for (const tournament of Object.values(state.youthTournaments ?? {})) {
    if (!tournament.discovered) continue;
    addTarget(targets, {
      entity: { kind: "venue", id: tournament.id },
      label: tournament.name,
      regionId: tournament.countryKey ?? tournament.country,
      notes: tournamentNotes(tournament),
    });
  }
  return [...targets.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function tournamentNotes(tournament: TournamentEvent): string[] {
  const notes: string[] = [
    tournament.category,
    tournament.prestige,
  ];
  if (tournament.discoverySource) notes.push(`via ${tournament.discoverySource}`);
  return notes;
}

function buildTerritoryTargets(state: GameState): RivalCampaignTarget[] {
  const targets = new Map<string, RivalCampaignTarget>();
  for (const territory of Object.values(state.territories ?? {})) {
    addTarget(targets, {
      entity: { kind: "territory", id: territory.id },
      label: territory.name,
      regionId: territory.countryKey ?? territory.country,
      notes: [territory.country],
    });
  }
  for (const [countryId, knowledge] of Object.entries(state.regionalKnowledge ?? {})) {
    if (
      knowledge.knowledgeLevel <= 0
      && knowledge.localContacts.length === 0
      && knowledge.culturalInsights.length === 0
    ) {
      continue;
    }
    addTarget(targets, {
      entity: { kind: "territory", id: countryId },
      label: countryId,
      regionId: countryId,
      notes: [`Knowledge ${Math.round(knowledge.knowledgeLevel)}/100`],
    });
  }
  for (const tournament of Object.values(state.youthTournaments ?? {})) {
    if (!tournament.discovered) continue;
    const territoryId = tournament.countryKey ?? tournament.country;
    if (targets.has(`territory:${territoryId}`)) continue;
    addTarget(targets, {
      entity: { kind: "territory", id: territoryId },
      label: territoryId,
      regionId: territoryId,
      notes: ["Tournament circuit"],
    });
  }
  return [...targets.values()].sort((left, right) => left.label.localeCompare(right.label));
}

export function buildRivalCampaignDirectory(
  state: GameState,
): RivalCampaignDirectory {
  const knownPlayerIds = visibleKnownPlayerIds(state);
  return {
    player: buildPlayerTargets(state, knownPlayerIds),
    contact: buildContactTargets(state),
    employee: buildEmployeeTargets(state),
    family: buildFamilyTargets(state),
    journalist: buildJournalistTargets(state),
    club: buildClubTargets(state, knownPlayerIds),
    venue: buildVenueTargets(state),
    territory: buildTerritoryTargets(state),
  };
}
