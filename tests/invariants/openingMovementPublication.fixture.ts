import type { GameState, Player, PlayerMovementEvent } from "@/engine/core/types";

/** Authored fixture derived from existing recruitment + keeper-loan tests. */
export function openingPublicationWorld(withLoan: boolean): GameState {
  const players: Record<string, Player> = {};
  const addSquad = (clubId: string, count: number) => {
    for (let index = 0; index < count; index++) {
      const id = `${clubId}-${index}`;
      players[id] = { id, firstName: "Alex", lastName: id, clubId, contractClubId: clubId,
        age: 25, position: "CM", currentAbility: 100, potentialAbility: 100,
        contractExpiry: 5, wage: 500, morale: 5 } as Player;
    }
  };
  addSquad("vacancy", 10);
  if (withLoan) {
    addSquad("parent", 18); addSquad("host", 10);
    for (const id of ["keeper", "cover1", "cover2"]) players[id] = {
      ...players["parent-0"], id, age: 30, position: "GK", firstName: "Alex", lastName: "Keeper",
      currentAbility: id === "keeper" ? 50 : 150, marketValue: 10_000,
    };
  }
  // Ability/reputation excludes these free agents from host recruitment, so
  // the actual goalkeeper-loan path must interleave with vacancy signings.
  for (let index = 0; index < 16; index++) {
    const id = `available-${index}`;
    players[id] = { id, firstName: "Pat", lastName: id, clubId: "", contractClubId: "",
      age: 25, position: index < 4 ? "GK" : "CM", currentAbility: 150,
      potentialAbility: 160, contractExpiry: 2, wage: 500, morale: 5 } as Player;
  }
  const clubIds = withLoan ? ["vacancy", "parent", "host"] : ["vacancy"];
  const historical = "historical:exact-long-movement-identity:000000000000000000000000000000";
  const playerMovementHistory: PlayerMovementEvent[] = Array.from({ length: 32 }, (_, index) => ({
    id: `move_1_1_${index}_${historical}_contractRenewal`, playerId: historical,
    type: "contractRenewal", week: 1, season: 1, contractClubId: "former-club:exact-long-identity",
    reason: index % 2 ? "Exact repeated retained movement reason with no projection or retention changes" : undefined,
    fee: index % 3 ? 0 : undefined,
    financialSettlements: [{ type: "sellOnClause", amount: 7, creditorClubId: "former-creditor", obligationId: "exact-obligation" },
      { type: "sellOnClause", amount: 7, creditorClubId: "former-creditor", obligationId: "exact-obligation" }],
  }));
  return {
    seed: "publication-fixture", currentWeek: 1, currentSeason: 3, fixtures: {}, players,
    managerProfiles: {}, clubs: Object.fromEntries(clubIds.map(id => [id, {
      id, name: id, shortName: id, leagueId: "league", reputation: id === "vacancy" ? 75 : id === "parent" ? 50 : 30,
      budget: 100_000, weeklyWageBudget: 100_000, scoutingPhilosophy: "marketSmart", youthAcademyRating: 10,
      playerIds: Object.values(players).filter(player => player.clubId === id).map(player => player.id),
    }])), leagues: { league: { country: "England" } },
    activeLoans: [], loanHistory: [], retiredPlayers: {}, retiredPlayerIds: [], playerMovementHistory,
    freeAgentPool: { agents: Array.from({ length: 16 }, (_, index) => ({
      playerId: `available-${index}`, status: "available", weeksInPool: 2, maxWeeksInPool: 100,
      wageExpectation: 500, signingBonusExpectation: 1_000, npcInterest: [], discoveredByScout: true,
    })), totalSignedThisSeason: 0, totalReleasedThisSeason: 0, totalRetiredThisSeason: 0 },
    observations: withLoan ? { known: { playerId: "keeper" } } : {},
    inbox: [{ id: "pre-existing-notice", type: "event", title: "Original notice", body: "Keep exact order", week: 1, season: 3,
      read: true, actionRequired: false }],
    publicationOpaqueFacts: { ownUndefined: undefined, nested: ["duplicate", "duplicate", { retained: null }] },
  } as unknown as GameState;
}
