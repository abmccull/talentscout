import { expect, it } from "vitest";
import type { Club, GameState, Player } from "@/engine/core/types";
import { buildAcademyPromotionNews } from "@/engine/youth/academyPromotionNews";

function fixture() {
  const state = { watchlist: ["youth"], observations: {}, reports: {}, inbox: [] } as unknown as GameState;
  const before = { club: { id: "club", name: "Town FC", playerIds: [], academyPlayerIds: ["youth"] } } as unknown as Record<string, Club>;
  const after = { club: { ...before.club, playerIds: ["youth"], academyPlayerIds: [] } };
  const players = { youth: { id: "youth", firstName: "Alex", lastName: "Walker", clubId: "club", age: 17 } } as unknown as Record<string, Player>;
  return { state, before, after, players };
}

it("announces a real known-player promotion with a dossier link and the receiving week's date", () => {
  const { state, before, after, players } = fixture();
  const original = structuredClone({ state, before, after, players });
  const news = buildAcademyPromotionNews(state, before, after, players, 1, 4);
  expect(news).toHaveLength(1);
  expect(news[0]).toMatchObject({ week: 1, season: 4, type: "news", relatedId: "youth", relatedEntityType: "player", actionRequired: false, read: false });
  expect(news[0].title).toBe("Alex Walker: first-team opportunity");
  expect({ state, before, after, players }).toEqual(original);
  expect(buildAcademyPromotionNews({ ...state, inbox: news }, before, after, players, 1, 4)).toEqual([]);
  expect(buildAcademyPromotionNews(state, after, after, players, 2, 4)).toEqual([]);
});

it("requires scout knowledge from a watchlist, observation or authored report", () => {
  for (const knowledge of ["unknown", "observation", "report"] as const) {
    const { state, before, after, players } = fixture(); state.watchlist = [];
    if (knowledge === "observation") state.observations = { look: { playerId: "youth" } } as unknown as GameState["observations"];
    if (knowledge === "report") state.reports = { report: { playerId: "youth" } } as unknown as GameState["reports"];
    expect(buildAcademyPromotionNews(state, before, after, players, 8, 3)).toHaveLength(knowledge === "unknown" ? 0 : 1);
  }
});

it("does not announce transfers, duplicate registrations or a foreign player's roster entry", () => {
  const { state, before, after, players } = fixture();
  expect(buildAcademyPromotionNews(state, { club: { ...before.club, academyPlayerIds: [] } }, after, players, 8, 3)).toEqual([]);
  expect(buildAcademyPromotionNews(state, { club: { ...before.club, playerIds: ["youth"] } }, after, players, 8, 3)).toEqual([]);
  expect(buildAcademyPromotionNews(state, before, { club: { ...after.club, playerIds: ["youth", "youth"] } }, players, 8, 3)).toHaveLength(1);
  expect(buildAcademyPromotionNews(state, before, after, { youth: { ...players.youth, clubId: "other" } }, 8, 3)).toEqual([]);
});
