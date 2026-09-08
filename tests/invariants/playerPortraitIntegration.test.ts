import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Club, GameState, Player, UnsignedYouth } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { generatePlayer } from "@/engine/players/generation";
import { processPlacementOutcome } from "@/engine/youth/placement";
import { resolvePlayerMovements, type LifecycleWorldState } from "@/engine/world/playerLifecycle";
import { migrateSaveState } from "@/lib/db";
import { createPortraitCatalog } from "@/engine/players/portraits/catalog";
import { createVisualIdentity } from "@/engine/players/portraits/identity";
import { revealGamePortraits, revealKnownGamePortraits, isPortraitOnlyStateChange, preparePortraitWeekCommit } from "@/engine/players/portraits/gameIntegration";
import { snapshotPersistedGameState } from "@/stores/actions/persistGameplayAutosave";
import * as portraitAllocation from "@/engine/players/portraits/allocation";

function player(id = "prospect"): Player {
  return { ...generatePlayer(createRNG("portrait-integration"), {
    position: "CM", ageRange: [17,17], abilityRange: [45,45], nationality: "England",
    clubId: "", firstName: "Ari", lastName: "Prospect",
  }), id, visualIdentity: createVisualIdentity(id) };
}
function youth(p: Player): UnsignedYouth {
  return { id: p.id, player: p, visibility: 1, buzzLevel: 1, discoveredBy: ["scout"],
    regionId: "north", country: "england", venueAppearances: [], generatedSeason: 1, placed: false, retired: false };
}
function club(id: string): Club {
  return { id, name: "Test Club", shortName: "TC", leagueId: "league", reputation: 50, budget: 100000,
    scoutingPhilosophy: "academyFirst", managerId: "manager", playerIds: [], youthAcademyRating: 12,
    loanedOutPlayerIds: [], loanedInPlayerIds: [], academyPlayerIds: [] };
}
const emptyCatalog = createPortraitCatalog([]);

describe("persistent portraits integrated with football domains", () => {
  it("does not revisit allocation for an already bound, nameless, pruned legacy person", () => {
    const p = player();
    const source = { currentSeason: 1, currentWeek: 1, players: { [p.id]: p }, unsignedYouth: {} } as unknown as GameState;
    const seen = revealGamePortraits(source, [p.id], "selected");
    const pruned = { ...seen, players: {}, playerPortraits: structuredClone(seen.playerPortraits!) };
    const reservation = pruned.playerPortraits.reservations["person:v1:" + p.id]!;
    expect(reservation.binding).toBeDefined();
    delete reservation.displayName;
    const allocator = vi.spyOn(portraitAllocation, "revealPortraits");
    try {
      expect(revealGamePortraits(pruned, [p.id], "selected")).toBe(pruned);
      expect(allocator).not.toHaveBeenCalled();
    } finally { allocator.mockRestore(); }
  });
  it("the canonical player builder assigns a persistent identity to every new player", () => {
    const generated = generatePlayer(createRNG("new-portrait"), {
      position: "GK", ageRange: [15,15], abilityRange: [20,20], nationality: "Japan", clubId: "",
    });
    expect(generated.visualIdentity).toEqual(createVisualIdentity(generated.id));
  });

  it("actual youth placement and retirement preserve the same player identity", () => {
    const p = player();
    const target = club("club");
    const result = processPlacementOutcome(createRNG("placement"), {
      id: "report", unsignedYouthId: p.id, targetClubId: target.id, scoutId: "scout",
      conviction: "recommend", clubResponse: "pending", qualityScore: 80, week: 1, season: 1,
    }, 1, youth(p), target);
    expect(result.success).toBe(true);
    expect(result.newPlayer!.visualIdentity).toEqual(p.visualIdentity);
    target.playerIds = [p.id];
    const input: LifecycleWorldState = {
      players: { [p.id]: result.newPlayer! }, clubs: { [target.id]: target }, activeLoans: [], loanHistory: [],
      retiredPlayers: {}, retiredPlayerIds: [], playerMovementHistory: [],
      freeAgentPool: { agents: [], lastRefreshSeason: 1, totalReleasedThisSeason: 0, totalSignedThisSeason: 0, totalRetiredThisSeason: 0 },
    };
    const retirement = resolvePlayerMovements(input, [{ type: "retirement", playerId: p.id, reason: "Test career endpoint" }], 4, 20);
    expect(retirement.rejected).toEqual([]);
    expect(retirement.state.retiredPlayers[p.id]!.visualIdentity).toEqual(p.visualIdentity);
  });

  it("the real portable save migration restores identities and serializes reservations", () => {
    const fixture = JSON.parse(readFileSync(new URL("../fixtures/saves/v0-save-record.json", import.meta.url), "utf8"));
    const legacyPlayer = player(); delete legacyPlayer.visualIdentity;
    const legacy = { ...fixture.state, players: { [legacyPlayer.id]: legacyPlayer },
      unsignedYouth: { [legacyPlayer.id]: youth(legacyPlayer) }, watchlist: [legacyPlayer.id] };
    const original = structuredClone(legacy);
    const migrated = migrateSaveState(legacy);
    expect(legacy).toEqual(original);
    expect(migrated.players[legacyPlayer.id]!.visualIdentity).toEqual(createVisualIdentity(legacyPlayer.id));
    expect(migrated.playerPortraits!.reservations["person:v1:" + legacyPlayer.id]).toBeUndefined();
    const live = revealKnownGamePortraits(migrated);
    expect(live.playerPortraits!.reservations["person:v1:" + legacyPlayer.id]).toBeDefined();
    const imported = migrateSaveState(JSON.parse(JSON.stringify(snapshotPersistedGameState(live))));
    expect(imported.playerPortraits).toEqual(live.playerPortraits);
    expect(imported.players[legacyPlayer.id]!.visualIdentity).toEqual(migrated.players[legacyPlayer.id]!.visualIdentity);
  });

  it("an older simulated week preserves current visibility reservations without admitting unrelated changes", () => {
    const p = player();
    const source = { seed: "career", currentSeason: 1, currentWeek: 1, players: { [p.id]: p },
      unsignedYouth: {}, retiredPlayers: {}, reports: {}, observations: {}, discoveryRecords: [], alumniRecords: [],
      scoutingCases: {}, watchlist: [], scout: { id: "scout" } } as unknown as GameState;
    const latest = revealGamePortraits(source, [p.id], "selected", [], emptyCatalog);
    expect(isPortraitOnlyStateChange(source, latest)).toBe(true);
    expect(isPortraitOnlyStateChange(source, { ...latest, currentWeek: 7 })).toBe(false);
    expect(isPortraitOnlyStateChange(source, { ...latest, players: { ...latest.players } })).toBe(false);
    const result = preparePortraitWeekCommit({ ...source, currentWeek: 2 }, latest, emptyCatalog);
    expect(result.currentWeek).toBe(2);
    expect(result.playerPortraits).toEqual(latest.playerPortraits);
    expect(revealGamePortraits(latest, [p.id], "selected", [], emptyCatalog)).toBe(latest);
  });
});

