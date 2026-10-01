import { expect, it } from "vitest";
import { reconcileClubRosters } from "@/engine/core/gameLoop";
import type { Club, Player } from "@/engine/core/types";

function player(id: string, position: Player["position"], age = 22, ability = 40): Player {
  return { id, clubId: "club", position, age, currentAbility: ability, wage: 500, contractExpiry: 3 } as Player;
}
function fixture(count: number) {
  const players = Object.fromEntries(Array.from({ length: count }, (_, i) => [String(i), player(String(i), "CM")]));
  const club = { id: "club", playerIds: Object.keys(players), academyPlayerIds: ["keeper", "child", "loan"] } as Club;
  players.keeper = player("keeper", "GK", 17, 43);
  players.child = player("child", "GK", 15, 70);
  players.loan = { ...player("loan", "GK", 17, 80), onLoan: true };
  return { players, clubs: { club } };
}

it("uses the owned 17-year-old keeper to complete an emergency eleven without changing contracts", () => {
  const { players, clubs } = fixture(10);
  const before = structuredClone({ players, clubs });
  const result = reconcileClubRosters(clubs, players);
  expect(result.club.playerIds).toHaveLength(11);
  expect(result.club.playerIds).toContain("keeper");
  expect(result.club.academyPlayerIds).toEqual(["child", "loan"]);
  expect({ players, clubs }).toEqual(before);
  expect(reconcileClubRosters(result, players)).toEqual(result);
});

it("fills a missing goalkeeper even when eleven outfield players are registered", () => {
  const { players, clubs } = fixture(11);
  expect(reconcileClubRosters(clubs, players).club.playerIds).toContain("keeper");
});

it("leaves young academy players in development when the first team has an eleven and keeper", () => {
  const { players, clubs } = fixture(11);
  players["0"].position = "GK";
  expect(reconcileClubRosters(clubs, players)).toEqual(clubs);
});

it("counts a borrowed goalkeeper who is registered at this club as current cover", () => {
  const { players, clubs } = fixture(11);
  players["0"] = { ...players["0"], position: "GK", onLoan: true, loanParentClubId: "parent" };
  expect(reconcileClubRosters(clubs, players)).toEqual(clubs);
});

it("promotes outfield cover despite an eleven-player roster with four goalkeepers", () => {
  const { players, clubs } = fixture(11);
  for (let i = 0; i < 4; i++) players[String(i)].position = "GK";
  for (let i = 0; i < 4; i++) {
    const id = `youth-${i}`;
    players[id] = player(id, "CB", 17, 40 + i);
    clubs.club.academyPlayerIds!.push(id);
  }
  const result = reconcileClubRosters(clubs, players);
  expect(result.club.playerIds.filter(id => players[id].position !== "GK")).toHaveLength(10);
  expect(result.club.playerIds.filter(id => players[id].position === "GK")).toHaveLength(4);
  expect(result.club.academyPlayerIds).toContain("keeper");
  expect(result.club.academyPlayerIds).toContain("youth-0");
  expect(reconcileClubRosters(result, players)).toEqual(result);
});


it("calls up a fit academy keeper when the registered senior is injured or suspended", () => {
  for (const injury of [true, false]) {
    const { players, clubs } = fixture(11);
    players['0'].position = "GK";
    players['0'].injured = injury;
    const records = injury ? {} : { '0': { suspensionWeeksRemaining: 1 } };
    const original = structuredClone({ players, clubs, records });
    const result = reconcileClubRosters(clubs, players, records as Parameters<typeof reconcileClubRosters>[2]);
    expect(result.club.playerIds).toContain("keeper");
    expect(result.club.playerIds).toContain("0");
    expect(result.club.academyPlayerIds).toEqual(["child", "loan"]);
    expect({ players, clubs, records }).toEqual(original);
    expect(reconcileClubRosters(result, players, records as Parameters<typeof reconcileClubRosters>[2])).toEqual(result);
  }
});

it("does not call up injured or suspended academy cover or anyone below sixteen", () => {
  for (const injury of [true, false]) {
    const { players, clubs } = fixture(10);
    players.keeper.injured = injury;
    const records = injury ? {} : { keeper: { suspensionWeeksRemaining: 1 } };
    expect(reconcileClubRosters(clubs, players, records as Parameters<typeof reconcileClubRosters>[2])).toEqual(clubs);
  }
});

it("uses healthy outfield academy cover when injuries leave fewer than ten outfield seniors", () => {
  const { players, clubs } = fixture(11);
  players['0'].position = "GK"; players['1'].injured = true;
  players.cover = player("cover", "CB", 16); clubs.club.academyPlayerIds!.push("cover");
  const result = reconcileClubRosters(clubs, players);
  expect(result.club.playerIds).toContain("cover");
  expect(result.club.academyPlayerIds).toContain("keeper");
});
