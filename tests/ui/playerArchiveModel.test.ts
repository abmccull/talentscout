import { describe, expect, it } from "vitest";
import type { GameState } from "@/engine/core/types";
import { createVisualIdentity } from "@/engine/players/portraits/identity";
import { buildPlayerArchive } from "@/components/game/player-profile/playerArchiveModel";
import { buildReportWorkspaceViewModel } from "@/components/game/reports/reportWorkspaceModel";

function state(): GameState {
  return {
    currentSeason: 20, currentWeek: 4, scout: { id: "scout", careerPath: "independent" },
    players: {}, retiredPlayers: {}, unsignedYouth: {}, scoutingCases: {}, clubs: {},
    playerPortraits: { version: 1, faceOwners: {}, reservations: {
      "person:v1:alumnus": { playerId: "alumnus", identity: createVisualIdentity("alumnus"),
        firstSeen: { season: 2, week: 5 }, firstSeenAge: 16, reason: "observed", displayName: "Theo Jackson" },
    } },
    reports: Object.fromEntries([
      ["early", 2, 6, "scout"], ["recent", 19, 30, "scout"],
      ["future", 20, 5, "scout"], ["foreign", 19, 31, "another-scout"],
    ].map(([id, season, week, scoutId]) => [id, {
      id, playerId: "alumnus", scoutId, submittedSeason: season, submittedWeek: week,
      summary: `Recorded ${id} assessment`, attributeAssessments: [], strengths: [], weaknesses: [],
      conviction: "note", recommendedAction: "monitor", qualityScore: 60,
    }])),
  } as unknown as GameState;
}

describe("retained player dossier", () => {
  it("keeps a pruned player's recorded name and own reached reports without recreating a player", () => {
    const source = state();
    const before = JSON.stringify(source);
    const archived = buildPlayerArchive(source, "alumnus");
    expect(archived?.name).toBe("Theo Jackson");
    expect(archived?.reports.map(report => report.id)).toEqual(["recent", "early"]);
    expect(archived).not.toHaveProperty("age");
    expect(archived).not.toHaveProperty("retired");
    expect(JSON.stringify(source)).toBe(before);
    const note = source.reports.early!;
    const workspace = buildReportWorkspaceViewModel({
      gameState: source, reports: [note], casesNeedingDelivery: [], awaitingDecisionDeliveries: [],
      placedCases: [], listingByReportId: {}, comparisonReportIds: [], pendingListingReportId: null,
      staffWorkQueueCount: 0, journalEntryCount: 0, activeListingsCount: 0, pendingBidsCount: 0,
    });
    expect(workspace.featuredArtifact?.playerName).toBe("Theo Jackson");
  });

  it("does not expose future reservations or replace a retained live dossier", () => {
    const source = state();
    source.reports = {};
    source.playerPortraits!.reservations["person:v1:alumnus"]!.firstSeen = { season: 21, week: 1 };
    expect(buildPlayerArchive(source, "alumnus")).toBeNull();
    expect(buildPlayerArchive(source, "missing")).toBeNull();
    source.players.alumnus = { id: "alumnus" } as GameState["players"][string];
    expect(buildPlayerArchive(source, "alumnus")).toBeNull();
  });
});
