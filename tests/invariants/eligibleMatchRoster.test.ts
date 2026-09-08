import { describe, expect, it } from "vitest";
import type { Club, DisciplinaryRecord, League, Player } from "@/engine/core/types";
import { generatePlayer } from "@/engine/players/generation";
import { RNG } from "@/engine/rng";
import { getEligibleMatchRoster } from "@/engine/match/eligibleRoster";
import { selectStartingXI } from "@/engine/core/gameLoop";
import { simulateAbstractCompetitionWeek } from "@/engine/world/abstractCompetition";

function squad(seniorCount: number, academyCount: number) {
  const players: Record<string, Player> = {};
  const club = { id: "club", leagueId: "league", playerIds: [], academyPlayerIds: [], reputation: 40 } as unknown as Club;
  for (let index = 0; index < seniorCount + academyCount; index++) {
    const player = generatePlayer(new RNG(`eligible-${index}`), {
      clubId: club.id, nationality: "English", ageRange: index < seniorCount ? [24, 24] : [16, 16],
      abilityRange: [80, 80], position: index === 0 || index === seniorCount ? "GK" : "CM",
    });
    players[player.id] = player;
    (index < seniorCount ? club.playerIds : club.academyPlayerIds!).push(player.id);
  }
  return { club, players };
}

describe("registered match cover", () => {
  it("fields eleven from a thin senior squad with healthy academy cover in both simulation paths", () => {
    const { club, players } = squad(9, 6);
    const before = structuredClone({ club, players });
    expect(selectStartingXI(club, players)).toHaveLength(11);
    const rival = { ...club, id: "rival", playerIds: [], academyPlayerIds: [] };
    const league = { id: "league", clubIds: [club.id, rival.id], coverageTier: "abstract" } as unknown as League;
    const result = simulateAbstractCompetitionWeek({ worldSeed: "cover", season: 1, week: 1,
      clubs: { club, rival }, players, leagues: { league } });
    const ratings = Object.values(result.fixturesPlayed[0].playerRatings).filter((rating) => players[rating.playerId]?.clubId === club.id);
    expect(ratings.filter((rating) => rating.started)).toHaveLength(11);
    expect(ratings.some((rating) => club.academyPlayerIds!.includes(rating.playerId))).toBe(true);
    expect({ club, players }).toEqual(before);
  });

  it("uses academy cover for injuries and suspensions without reinstating unavailable seniors", () => {
    const { club, players } = squad(12, 6);
    for (const id of club.playerIds.slice(0, 3)) players[id].injured = true;
    const suspended = club.playerIds[3];
    const discipline = { [suspended]: { playerId: suspended, season: 1, yellowCards: 0, redCards: 1,
      suspensionWeeksRemaining: 1, cardHistory: [] } } satisfies Record<string, DisciplinaryRecord>;
    const xi = selectStartingXI(club, players, discipline);
    expect(xi).toHaveLength(11);
    expect(xi.every((player) => !player.injured && player.id !== suspended)).toBe(true);
    const rival = { ...club, id: "rival", playerIds: [], academyPlayerIds: [] };
    const league = { id: "league", clubIds: [club.id, rival.id], coverageTier: "abstract" } as unknown as League;
    const result = simulateAbstractCompetitionWeek({ worldSeed: "cover", season: 1, week: 1,
      clubs: { club, rival }, players, leagues: { league }, disciplinaryRecords: discipline });
    const ratings = Object.values(result.fixturesPlayed[0].playerRatings).filter((rating) => players[rating.playerId]?.clubId === club.id);
    expect(ratings.filter((rating) => rating.started)).toHaveLength(11);
    expect(ratings.every((rating) => !players[rating.playerId].injured && rating.playerId !== suspended)).toBe(true);
  });

  it("excludes moved players and stale loan registrations and deduplicates real loan cover", () => {
    const { club, players } = squad(9, 3);
    const moved = club.playerIds[1];
    players[moved].clubId = "elsewhere";
    club.loanedInPlayerIds = [moved, club.playerIds[0], club.academyPlayerIds![0], "missing"];
    const pool = getEligibleMatchRoster(club, players);
    expect(pool.map((player) => player.id)).not.toContain(moved);
    expect(new Set(pool.map((player) => player.id)).size).toBe(pool.length);
    expect(pool).toHaveLength(11);
  });

  it("keeps a healthy senior squad unchanged and only calls an academy keeper when needed", () => {
    const { club, players } = squad(14, 4);
    expect(getEligibleMatchRoster(club, players).map((player) => player.id)).toEqual(club.playerIds);
    players[club.playerIds[0]].position = "CM";
    const cover = getEligibleMatchRoster(club, players).filter((player) => club.academyPlayerIds!.includes(player.id));
    expect(cover).toHaveLength(1);
    expect(cover[0].position).toBe("GK");
    expect(selectStartingXI(club, players).some((player) => player.id === cover[0].id)).toBe(true);
  });

  it("reports a genuine shortage instead of allowing an injured player to participate", () => {
    const { club, players } = squad(9, 1);
    players[club.academyPlayerIds![0]].injured = true;
    expect(selectStartingXI(club, players)).toHaveLength(9);
    expect(getEligibleMatchRoster(club, players).every((player) => !player.injured)).toBe(true);
  });
});
