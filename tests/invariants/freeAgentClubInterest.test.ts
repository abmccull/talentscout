import { describe, expect, it } from "vitest";
import type { Club, FreeAgent, GameState, Player } from "@/engine/core/types";
import {
  scoreFreeAgentClubInterest,
  tickFreeAgentPool,
} from "@/engine/freeAgents/pool";
import { getMaxWeeksInPool } from "@/engine/freeAgents/expiry";
import { RNG } from "@/engine/rng";

function club(id: string, playerIds: string[]): Club {
  return {
    id,
    name: id,
    shortName: id,
    leagueId: "league",
    reputation: 55,
    budget: 10_000_000,
    scoutingPhilosophy: "marketSmart",
    managerId: `${id}-manager`,
    playerIds,
    youthAcademyRating: 12,
  };
}

describe("NPC free-agent club interest", () => {
  it("keeps the last wage allowance for a first goalkeeper even when cheap outfield offers arrived earlier", () => {
    const players = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`p-${i}`, {
      id: `p-${i}`, clubId: "a", position: "CM", age: 24, wage: 650,
    }])) as GameState["players"];
    const roster = Object.keys(players);
    players.depth = { id: "depth", clubId: "", position: "ST", age: 24, currentAbility: 100 } as Player;
    players.keeper = { ...players.depth, id: "keeper", position: "GK" };
    const state = { currentWeek: 4, currentSeason: 1, seed: "keeper-reserve", players,
      managerProfiles: {}, leagues: {}, clubs: { a: { ...club("a", roster), weeklyWageBudget: 11_000 } },
      freeAgentPool: { agents: ["depth", "keeper"].map(playerId => ({ playerId, status: "available",
        weeksInPool: 0, maxWeeksInPool: 104, wageExpectation: playerId === "keeper" ? 900 : 500,
        signingBonusExpectation: 0, npcInterest: [{ clubId: "a", offerWeek: 1, accepted: false }],
      })), totalSignedThisSeason: 0, totalRetiredThisSeason: 0 },
    } as unknown as GameState;
    const rng = new RNG("keeper-reserve");
    rng.chance = () => true;
    const result = tickFreeAgentPool(state, rng, { allowMidSeasonReleases: false });
    expect(result.npcSignedPlayerIds.map(deal => deal.playerId)).toEqual(["keeper"]);
    expect(state.clubs.a.playerIds).toEqual(roster);
  });
  it("keeps wages for a complete squad before accepting a costly player, including an old offer", () => {
    for (const existingOffer of [false, true]) {
      const players = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`p-${i}`, {
        id: `p-${i}`, clubId: "a", position: i === 0 ? "GK" : "CM", age: 24, wage: 500,
      }])) as GameState["players"];
      players.expensive = { id: "expensive", clubId: "", position: "ST", age: 24, currentAbility: 100 } as Player;
      players.depth = { ...players.expensive, id: "depth" };
      const destination = { ...club("a", Object.keys(players).filter((id) => id.startsWith("p-"))), weeklyWageBudget: 11_000 };
      const state = { currentWeek: 4, currentSeason: 1, seed: "squad-envelope", players,
        managerProfiles: {}, leagues: {}, clubs: { a: destination },
        freeAgentPool: { agents: ["expensive", "depth"].map((playerId) => ({
          playerId, status: "available", weeksInPool: 0, maxWeeksInPool: 104,
          wageExpectation: playerId === "expensive" ? 7000 : 500, signingBonusExpectation: 0,
          npcInterest: existingOffer ? [{ clubId: "a", offerWeek: 1, accepted: false }] : [],
        })), totalSignedThisSeason: 0, totalRetiredThisSeason: 0 },
      } as unknown as GameState;
      const rng = new RNG("squad-envelope");
      rng.chance = () => true;
      expect(tickFreeAgentPool(state, rng, { allowMidSeasonReleases: false }).npcSignedPlayerIds
        .map((deal) => deal.playerId)).toEqual(["depth"]);
      expect(destination.weeklyWageBudget).toBe(11_000);
      expect(destination.playerIds).toHaveLength(5);
    }
  });
  it("gives each club one pending offer and one acceptance attempt after restoring duplicate interests", () => {
    const agent = { playerId: "candidate", status: "available", weeksInPool: 1, maxWeeksInPool: 104,
      wageExpectation: 500, signingBonusExpectation: 0,
      npcInterest: [1, 2, 3].map((offerWeek) => ({ clubId: "a", offerWeek, accepted: false })),
    } as FreeAgent;
    const state = JSON.parse(JSON.stringify({ currentWeek: 4, currentSeason: 1, seed: "distinct-offers",
      managerProfiles: {}, leagues: {}, clubs: { a: club("a", []), b: club("b", []) },
      players: { candidate: { id: "candidate", clubId: "", position: "CM", age: 24, currentAbility: 100 } },
      freeAgentPool: { agents: [agent], totalSignedThisSeason: 0, totalRetiredThisSeason: 0 },
    })) as GameState;
    const rng = new RNG("distinct-offers");
    const chances: number[] = [];
    rng.chance = (probability) => { chances.push(probability); return chances.length === 1; };
    const result = tickFreeAgentPool(state, rng, { allowMidSeasonReleases: false });
    expect(result.updatedPool.agents[0].npcInterest).toEqual([
      { clubId: "a", offerWeek: 1, accepted: false },
      { clubId: "b", offerWeek: 4, accepted: false },
    ]);
    expect(chances.filter((probability) => probability === 0.4)).toHaveLength(2);
    expect(state.freeAgentPool.agents[0].npcInterest).toHaveLength(3);
    expect(result.npcSignedPlayerIds).toEqual([]);
  });

  it("raises recruitment urgency for depleted squads and reduces it as arrivals fill places", () => {
    const players = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`p-${i}`, {
      id: `p-${i}`, clubId: "club", position: i === 0 ? "CM" : "LW", age: 24,
    }])) as GameState["players"];
    const state = { players, managerProfiles: {}, leagues: {}, seed: "depth", currentSeason: 2 } as GameState;
    const candidate = { position: "CM", age: 24, currentAbility: 100 } as Player;
    const interest = (size: number) => scoreFreeAgentClubInterest(candidate,
      club("club", Object.keys(players).slice(0, size)), state);
    expect(interest(8)).toBeGreaterThan(interest(11));
    expect(interest(11)).toBeGreaterThan(interest(17));
    expect(interest(17)).toBeGreaterThan(interest(18));
    // The same positional cover, finances and doctrine isolate depth urgency.
    expect(interest(11) / interest(18)).toBeCloseTo(2);
    const stableInterest = interest(18);
    for (const risk of [{ age: 32 }, { age: 35 }, { onLoan: true }, { contractExpiry: 2 }]) {
      const vulnerablePlayers = Object.fromEntries(Object.entries(players).map(([id, member], index) =>
        [id, index < 6 ? { ...member, ...risk } : member]));
      const futureNeed = scoreFreeAgentClubInterest(candidate, club("club", Object.keys(players)),
        { ...state, players: vulnerablePlayers });
      expect(futureNeed).toBeGreaterThan(stableInterest);
      expect(futureNeed).toBeLessThan(interest(11));
    }
  });

  it("recognizes an accepted successor contract before allocating the next keeper", () => {
    const players = Object.fromEntries(["old-a", "old-b", "new-a", "new-b"].map((id) => [id, {
      id, clubId: id === "old-a" ? "a" : id === "old-b" ? "b" : "",
      position: "GK", age: id.startsWith("old") ? 35 : 24,
      contractExpiry: 1, currentAbility: 100, wage: 500,
    }])) as GameState["players"];
    const state = {
      currentWeek: 10, currentSeason: 2, seed: "successor-batch", managerProfiles: {}, leagues: {}, players,
      clubs: { a: club("a", ["old-a"]), b: club("b", ["old-b"]) },
      freeAgentPool: { agents: ["new-a", "new-b"].map((playerId) => ({
        playerId, status: "available", weeksInPool: 0, maxWeeksInPool: 104,
        wageExpectation: 500, signingBonusExpectation: 0, npcInterest: [],
      })), totalSignedThisSeason: 0, totalRetiredThisSeason: 0 },
    } as unknown as GameState;
    for (let seed = 0; seed < 12; seed++) {
      const rng = new RNG(`successor-batch-${seed}`);
      rng.chance = () => true;
      const result = tickFreeAgentPool(state, rng, { allowMidSeasonReleases: false });
      expect(result.npcSignedPlayerIds).toHaveLength(2);
      expect(new Set(result.npcSignedPlayerIds.map((deal) => deal.clubId)).size).toBe(2);
      expect(players["new-a"].contractExpiry).toBe(1);
      expect(players["new-a"].clubId).toBe("");
    }
  });

  it("recruits younger goalkeeper successors before aging, loan-only or expiring cover disappears", () => {
    for (const risk of [{ age: 32 }, { age: 35 }, { onLoan: true }, { contractExpiry: 2 }]) {
      const candidate = { id: "candidate", clubId: "", position: "GK", age: 24, currentAbility: 100, wage: 500 };
      const stable = { id: "stable", clubId: "stable-club", position: "GK", age: 24, contractExpiry: 5, wage: 500 };
      const vulnerable = { ...stable, id: "vulnerable", clubId: "needs-successor", ...risk };
      const state = {
        currentWeek: 10, currentSeason: 2, seed: "succession", managerProfiles: {}, leagues: {},
        players: { candidate, stable, vulnerable },
        clubs: {
          "stable-club": club("stable-club", ["stable"]),
          "needs-successor": club("needs-successor", ["vulnerable"]),
        },
        freeAgentPool: { agents: [{ playerId: "candidate", status: "available", weeksInPool: 0,
          maxWeeksInPool: 104, wageExpectation: 500, signingBonusExpectation: 0, npcInterest: [] }],
          totalSignedThisSeason: 0, totalRetiredThisSeason: 0 },
      } as unknown as GameState;
      for (let seed = 0; seed < 8; seed++) {
        const rng = new RNG(`successor-${seed}`);
        rng.chance = () => true;
        expect(tickFreeAgentPool(state, rng, { allowMidSeasonReleases: false })
          .npcSignedPlayerIds[0]?.clubId).toBe("needs-successor");
      }
    }
  });

  it("prioritizes affordable backup cover over a third goalkeeper at another club", () => {
    const candidate = { id: "candidate", clubId: "", position: "GK", age: 24, currentAbility: 100, wage: 500 };
    const keepers = ["one", "two", "three"].map((id, index) => ({
      ...candidate, id, clubId: index === 0 ? "thin" : "covered", contractExpiry: 5,
    }));
    const state = {
      currentWeek: 10, currentSeason: 2, seed: "backup", managerProfiles: {}, leagues: {},
      players: { candidate, ...Object.fromEntries(keepers.map(p => [p.id, p])) },
      clubs: { covered: club("covered", ["two", "three"]), thin: club("thin", ["one"]) },
      freeAgentPool: { agents: [{ playerId: "candidate", status: "available", weeksInPool: 0,
        maxWeeksInPool: 104, wageExpectation: 500, signingBonusExpectation: 0, npcInterest: [] }],
        totalSignedThisSeason: 0, totalRetiredThisSeason: 0 },
    } as unknown as GameState;
    for (let seed = 0; seed < 8; seed++) {
      const rng = new RNG(`backup-${seed}`);
      rng.chance = () => true;
      expect(tickFreeAgentPool(state, rng, { allowMidSeasonReleases: false })
        .npcSignedPlayerIds[0]?.clubId).toBe("thin");
    }
    expect(state.clubs.thin.playerIds).toEqual(["one"]);
  });

  it("voluntary releases preserve senior depth and available goalkeeper cover across the batch", () => {
    const roster = Array.from({ length: 20 }, (_, i) => ({
      id: `p-${i}`, clubId: "club", contractClubId: "club", position: i < 2 ? "GK" : "CM",
      age: 28, wage: 500, currentAbility: 25, nationality: "English",
    } as Player));
    const state = {
      currentWeek: 5, currentSeason: 1, seed: "release-cover", managerProfiles: {}, leagues: {},
      clubs: { club: club("club", roster.map((player) => player.id)) },
      players: Object.fromEntries(roster.map((player) => [player.id, player])),
      freeAgentPool: { agents: [], totalSignedThisSeason: 0, totalRetiredThisSeason: 0, totalReleasedThisSeason: 0 },
    } as unknown as GameState;
    const rng = new RNG("release-cover");
    rng.chance = () => true;
    const result = tickFreeAgentPool(state, rng);
    const released = new Set(result.midSeasonReleases.map((agent) => agent.playerId));
    expect(released.size).toBe(2);
    expect(roster.filter((player) => player.position === "GK" && !released.has(player.id))).toHaveLength(1);
    expect(state.clubs.club.playerIds).toHaveLength(20);

    const injuredCover = { ...state, players: { ...state.players,
      "p-1": { ...state.players["p-1"], injured: true, currentAbility: 150 },
    } };
    expect(tickFreeAgentPool(injuredCover, rng).midSeasonReleases.map((agent) => agent.playerId)).not.toContain("p-0");
  });

  it("prioritizes a keeperless club without bypassing affordability", () => {
    const need = { ...club("need", []), weeklyWageBudget: 100_000 };
    const covered = { ...club("covered", ["existing"]), weeklyWageBudget: 100_000 };
    const agent = { playerId: "keeper", status: "available", weeksInPool: 1, maxWeeksInPool: 104,
      wageExpectation: 1000, signingBonusExpectation: 1000, npcInterest: [],
    } as unknown as FreeAgent;
    const state = { currentWeek: 2, currentSeason: 1, seed: "keeper-priority",
      clubs: { need, covered }, leagues: {}, managerProfiles: {},
      players: {
        keeper: { id: "keeper", clubId: "", position: "GK", wage: 1000, age: 25, currentAbility: 110 },
        existing: { id: "existing", clubId: "covered", position: "GK", wage: 1000 },
      }, freeAgentPool: { agents: [agent], totalSignedThisSeason: 0, totalRetiredThisSeason: 0 },
    } as unknown as GameState;
    for (let seed = 0; seed < 12; seed++) {
      const rng = new RNG(`keeper-${seed}`);
      rng.chance = () => true;
      expect(tickFreeAgentPool(state, rng, { allowMidSeasonReleases: false }).npcSignedPlayerIds[0]?.clubId).toBe("need");
    }
    const rng = new RNG("keeper-unaffordable");
    rng.chance = () => true;
    const result = tickFreeAgentPool({ ...state, clubs: { ...state.clubs,
      need: { ...need, budget: 0 },
    } }, rng, { allowMidSeasonReleases: false });
    expect(result.npcSignedPlayerIds[0]?.clubId).toBe("covered");
  });

  it("rechecks old offers and reserves the final squad place during a signing batch", () => {
    const ids = Array.from({ length: 29 }, (_, i) => `squad-${i}`);
    const destination = { ...club("destination", ids), weeklyWageBudget: 100_000 };
    const agents = ["first", "second"].map((playerId) => ({
      playerId, status: "available", weeksInPool: 1, maxWeeksInPool: 104,
      wageExpectation: 1000, signingBonusExpectation: 1000,
      npcInterest: [{ clubId: destination.id, offerWeek: 1, accepted: false }],
    })) as FreeAgent[];
    const players = Object.fromEntries([...ids, "first", "second"].map((id) => [id, {
      id, clubId: ids.includes(id) ? destination.id : "", wage: 1000,
      age: 24, currentAbility: 110, position: id === ids[0] ? "GK" : "CM",
    }])) as GameState["players"];
    const state = { currentWeek: 2, currentSeason: 1, clubs: { destination }, players,
      leagues: {}, managerProfiles: {}, seed: "capacity",
      freeAgentPool: { agents, totalSignedThisSeason: 0, totalRetiredThisSeason: 0 },
    } as unknown as GameState;
    const rng = new RNG("accept-existing");
    // Both weekly offer creation and acceptance succeed: resource checks must decide.
    rng.chance = () => true;
    const result = tickFreeAgentPool(state, rng, { allowMidSeasonReleases: false });
    expect(result.npcSignedPlayerIds).toHaveLength(1);
    expect(result.updatedPool.agents.find((agent) => agent.playerId === "second")?.npcInterest).toEqual([]);
    expect(destination.playerIds).toHaveLength(29);
    expect(destination.budget).toBe(10_000_000);
    const noKeeper = { ...state, players: { ...players,
      [ids[0]]: { ...players[ids[0]], position: "CM" as const },
    } };
    expect(tickFreeAgentPool(noKeeper, rng, { allowMidSeasonReleases: false }).npcSignedPlayerIds).toEqual([]);

    const fullState = { ...state, clubs: { destination: { ...destination, playerIds: [...ids, "extra"] } } };
    expect(tickFreeAgentPool(fullState, rng, { allowMidSeasonReleases: false }).npcSignedPlayerIds).toEqual([]);
  });

  it("does not spend the same signing budget twice on pending offers", () => {
    const destination = { ...club("destination", []), budget: 1500, weeklyWageBudget: 100_000 };
    const agents = ["first", "second"].map((playerId) => ({
      playerId, status: "available", weeksInPool: 1, maxWeeksInPool: 104,
      wageExpectation: 1000, signingBonusExpectation: 1000,
      npcInterest: [{ clubId: destination.id, offerWeek: 1, accepted: false }],
    })) as FreeAgent[];
    const state = { currentWeek: 2, currentSeason: 1, clubs: { destination },
      players: Object.fromEntries(agents.map((agent) => [agent.playerId, {
        id: agent.playerId, clubId: "", wage: 1000, age: 24, currentAbility: 110, position: "CM",
      }])), leagues: {}, managerProfiles: {}, seed: "budget",
      freeAgentPool: { agents, totalSignedThisSeason: 0, totalRetiredThisSeason: 0 },
    } as unknown as GameState;
    const rng = new RNG("accept-budget");
    rng.chance = () => true;
    const result = tickFreeAgentPool(state, rng, { allowMidSeasonReleases: false });
    expect(result.npcSignedPlayerIds).toHaveLength(1);
    expect(result.npcSignedPlayerIds.reduce((sum, signed) => sum + signed.signingBonus, 0)).toBeLessThanOrEqual(1500);
    const wageLimited = { ...state, clubs: { destination: {
      // Fund the remaining playing places before accepting a second offer.
      ...destination, budget: 1_000_000, weeklyWageBudget: 6000,
    } } };
    const wageResult = tickFreeAgentPool(wageLimited, rng, { allowMidSeasonReleases: false });
    expect(wageResult.npcSignedPlayerIds).toHaveLength(1);
    expect(wageResult.npcSignedPlayerIds.reduce((sum, signed) => sum + signed.wage, 0)).toBeLessThanOrEqual(1500);
  });

  it("keeps a released prime-age player available beyond an old four-week deadline", () => {
    const agent = {
      playerId: "prime", status: "available", weeksInPool: 3, maxWeeksInPool: 4,
      wageExpectation: 1000, signingBonusExpectation: 2000, npcInterest: [],
    } as unknown as FreeAgent;
    const state = {
      currentWeek: 4, currentSeason: 2, clubs: {}, leagues: {},
      players: { prime: { id: "prime", age: 26, currentAbility: 155 } },
      freeAgentPool: { agents: [agent], totalRetiredThisSeason: 0, totalSignedThisSeason: 0 },
    } as unknown as GameState;
    const result = tickFreeAgentPool(state, { chance: () => false } as never, { allowMidSeasonReleases: false });
    expect(result.removedPlayerIds).toEqual([]);
    expect(result.updatedPool.agents[0]).toMatchObject({ status: "available", weeksInPool: 4, maxWeeksInPool: 104 });
    expect(agent.maxWeeksInPool).toBe(4);
    expect([40, 90, 120, 155].map(getMaxWeeksInPool)).toEqual([52, 52, 78, 104]);
    const expired = tickFreeAgentPool({ ...state, freeAgentPool: {
      ...state.freeAgentPool, agents: [{ ...agent, weeksInPool: 104, maxWeeksInPool: 104 }],
    } }, { chance: () => false } as never, { allowMidSeasonReleases: false });
    expect(expired.removedPlayerIds).toEqual(["prime"]);
  });

  it("prioritizes a genuine positional need over an already crowded squad lane", () => {
    const striker = { age: 25, position: "ST", currentAbility: 110 } as Player;
    const players = {
      s1: { id: "s1", position: "ST" },
      s2: { id: "s2", position: "ST" },
      s3: { id: "s3", position: "ST" },
    } as unknown as GameState["players"];
    const state = {
      players,
      managerProfiles: {},
      leagues: {},
      seed: "free-agent-interest",
      currentSeason: 2,
    };

    const needy = scoreFreeAgentClubInterest(striker, club("need", []), state);
    const crowded = scoreFreeAgentClubInterest(
      striker,
      club("crowded", ["s1", "s2", "s3"]),
      state,
    );

    expect(needy).toBeGreaterThan(crowded * 3);
  });

  it("keeps doctrine and geography in the club-interest weighting", () => {
    const striker = { age: 24, position: "ST", currentAbility: 112 } as Player;
    const state = {
      players: {},
      managerProfiles: {
        academy: { clubId: "academy", preferredFormation: "4-4-2" },
      },
      leagues: {
        "league-academy": { id: "league-academy", country: "England" },
      },
      seed: "free-agent-geo",
      currentSeason: 4,
    } as unknown as GameState;
    const academyClub: Club = {
      ...club("academy", []),
      leagueId: "league-academy",
      scoutingPhilosophy: "academyFirst",
    };

    const domestic = scoreFreeAgentClubInterest(
      striker,
      academyClub,
      state,
      { country: "england", nationality: "English" },
    );
    const foreign = scoreFreeAgentClubInterest(
      striker,
      academyClub,
      state,
      { country: "brazil", nationality: "Brazilian" },
    );

    expect(domestic).toBeGreaterThan(foreign);
  });

  it("drops terminal free-agent entries on the next pool tick instead of accumulating them", () => {
    const agent = (playerId: string, status: FreeAgent["status"]): FreeAgent => ({
      playerId,
      country: "england",
      nationality: "English",
      releasedFrom: "club",
      releasedSeason: 2,
      weeksInPool: 1,
      maxWeeksInPool: 20,
      wageExpectation: 1_000,
      signingBonusExpectation: 2_000,
      discoverySource: null,
      discoveredByScout: false,
      npcInterest: [],
      status,
    });
    const state = {
      currentWeek: 10,
      currentSeason: 2,
      players: {},
      clubs: {},
      leagues: {},
      freeAgentPool: {
        agents: [
          agent("signed", "signed"),
          agent("retired", "retired"),
          agent("dropped", "droppedOut"),
          agent("live", "available"),
          agent("negotiating", "inNegotiation"),
        ],
        lastRefreshSeason: 2,
        totalReleasedThisSeason: 0,
        totalSignedThisSeason: 0,
        totalRetiredThisSeason: 0,
      },
    } as unknown as GameState;
    const rng = {
      chance: () => false,
      nextInt: (min: number) => min,
      pickWeighted: <T,>(items: Array<{ item: T }>) => items[0].item,
    };

    const result = tickFreeAgentPool(state, rng as never, { allowMidSeasonReleases: false });

    expect(result.updatedPool.agents.map((entry) => entry.playerId).sort()).toEqual([
      "live",
      "negotiating",
    ]);
  });
});
