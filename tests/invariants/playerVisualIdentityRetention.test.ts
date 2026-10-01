// Proposed target: tests/invariants/playerVisualIdentityRetention.test.ts
// Prepared outside source. Not executed; root owns integration and red/green runs.
import { describe, expect, it } from "vitest";
import type { GameState, Player, UnsignedYouth } from "@/engine/core/types";
import { ALL_ATTRIBUTES } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { generatePlayer } from "@/engine/players/generation";
import {
  createVisualIdentity,
  pendingVisualDNA,
  validateVisualIdentity,
  withVisualIdentity,
} from "@/engine/players/portraits/identity";
import { revealPortraits, resolvePortrait } from "@/engine/players/portraits/allocation";
import { migrateVisualIdentities } from "@/engine/players/portraits/state";
import { AGE_CHECKPOINTS, type CatalogEntry } from "@/engine/players/portraits/types";
import { compactLongCareerHistory, measureSaveRetentionFootprint } from "@/engine/world/saveRetention";

function player(id: string, age = 18): Player {
  return {
    id, firstName: "Ari", lastName: "Reed", age,
    dateOfBirth: { day: 1, month: 1, year: 2024 - age },
    nationality: "English", position: "CM", secondaryPositions: [], preferredFoot: "right",
    clubId: "eng_home", contractClubId: "eng_home", contractExpiry: 32,
    wage: 500, marketValue: 100_000,
    attributes: Object.fromEntries(ALL_ATTRIBUTES.map((key) => [key, 10])) as Player["attributes"],
    currentAbility: 90, potentialAbility: 120, developmentProfile: "steadyGrower",
    wonderkidTier: "journeyman", form: 0, morale: 7, injured: false, injuryWeeksRemaining: 0,
    personalityTraits: [], personalityRevealed: [], playerTraits: [], playerTraitsRevealed: [],
    recentMatchRatings: [["fixture_england_s29_w38", 38, 29, 7.3]],
    seasonRatings: [[28, 7.2, 21, 3, 4, 0]], visualIdentity: createVisualIdentity(id),
    // Deliberately no developmentHistory: fresh unsigned prospects need packing too.
  };
}

function state(overrides: Partial<GameState> = {}): GameState {
  const unsignedPlayer = { ...player("unsigned", 16), clubId: "", contractClubId: undefined,
    contractExpiry: 0, wage: 0, recentMatchRatings: [], seasonRatings: [] };
  return {
    currentSeason: 30, currentWeek: 1,
    players: { live: player("live", 26) },
    retiredPlayers: { retired: player("retired", 37) }, retiredPlayerIds: ["retired"],
    unsignedYouth: {
      opportunity: {
        id: "opportunity", player: unsignedPlayer, visibility: 0, buzzLevel: 0,
        discoveredBy: [], regionId: "england_south", country: "england",
        venueAppearances: [], generatedSeason: 30, placed: false, retired: false,
      } as UnsignedYouth,
    },
    // Keep the retired entity for earned scout history without relying on a recent exit.
    watchlist: ["live", "retired"], observations: {}, reports: {},
    fixtures: {}, playedFixtures: [], matchRatings: {}, disciplinaryRecords: {},
    rivalScouts: {}, rivalActivities: [],
    schedule: { week: 1, season: 30, activities: Array(7).fill(null), completed: false },
    ...overrides,
  } as unknown as GameState;
}

function withoutIdentity(value: Player): Omit<Player, "visualIdentity"> {
  const { visualIdentity: _storedIdentity, ...footballAndHistory } = value;
  return footballAndHistory;
}

describe("version-pinned player identity retention", () => {
  it("keeps generated identities public and full, while decoding the exact stored version marker", () => {
    const generated = generatePlayer(createRNG("visual-identity-retention"), {
      position: "CM", ageRange: [18, 18], abilityRange: [90, 90], nationality: "English",
      clubId: "eng_home", currentSeason: 30, idNamespace: "academy_eng_home_s30",
      firstName: "Ari", lastName: "Reed",
    });
    expect(generated.visualIdentity).toEqual(createVisualIdentity(generated.id));
    expect(Object.keys(generated.visualIdentity!).sort()).toEqual(["identityId", "seed", "version"]);

    const stored = JSON.parse('{"version":1}') as unknown;
    expect(validateVisualIdentity(stored, generated.id)).toEqual(generated.visualIdentity);
    expect(withVisualIdentity({ id: generated.id, age: generated.age,
      visualIdentity: stored as Player["visualIdentity"] }).visualIdentity).toEqual(generated.visualIdentity);
  });

  it("packs live, causally retained retired, and fresh unsigned records without changing football data", () => {
    const source = state();
    const compacted = compactLongCareerHistory(source);
    const pairs = [
      [source.players.live, compacted.players.live],
      [source.retiredPlayers.retired, compacted.retiredPlayers.retired],
      [source.unsignedYouth.opportunity.player, compacted.unsignedYouth.opportunity.player],
    ] as const;
    for (const [before, after] of pairs) {
      expect(after.visualIdentity).toEqual({ version: 1 });
      expect(withVisualIdentity(after).visualIdentity).toEqual(before.visualIdentity);
      expect(withoutIdentity(after)).toEqual(withoutIdentity(before));
      expect(before.visualIdentity).toEqual(createVisualIdentity(before.id));
    }
    const restored = migrateVisualIdentities(JSON.parse(JSON.stringify(compacted)) as GameState);
    expect(restored.players.live.visualIdentity).toEqual(source.players.live.visualIdentity);
    expect(restored.retiredPlayers.retired.visualIdentity).toEqual(source.retiredPlayers.retired.visualIdentity);
    expect(restored.unsignedYouth.opportunity.player.visualIdentity).toEqual(source.unsignedYouth.opportunity.player.visualIdentity);
    expect(compactLongCareerHistory(JSON.parse(JSON.stringify(compacted)) as GameState)).toEqual(compacted);
  });

  it("preserves a reserved face, history tombstone, age selection and future allocation through raw JSON", () => {
    const source = state();
    const identity = createVisualIdentity("live");
    const faceHash = "a".repeat(64);
    const historicalHash = "b".repeat(64);
    const entry: CatalogEntry = {
      lineageId: "fixture-face", packId: "fixture-pack", revision: 1,
      canonicalFaceSha256: faceHash, anchors: pendingVisualDNA(identity), provenance: "authored-catalog",
      assets: AGE_CHECKPOINTS.map((age) => ({ age, path: `/fixture-portraits/${age}.webp`, width: 1024, height: 1024 })),
    };
    // A unit fixture for the actual resolver; no filesystem or photographic-delivery claim.
    const catalog = new Map([[entry.lineageId, entry]]);
    const seen = revealPortraits(source, ["live"], { season: 20, week: 3 }, "observed", catalog);
    seen.playerPortraits.faceOwners[historicalHash] = "person:v1:pruned-person";
    const expectedPortrait = resolvePortrait(withVisualIdentity(seen.players.live).visualIdentity,
      seen.players.live.age, seen.playerPortraits, catalog);
    expect(expectedPortrait.status).toBe("available");

    const compacted = compactLongCareerHistory(seen);
    const saved = JSON.parse(JSON.stringify(compacted)) as GameState;
    expect(saved.players.live.visualIdentity).toEqual({ version: 1 });
    // Actual domain resolution directly from stored data must work before load migration.
    const decoded = withVisualIdentity(saved.players.live).visualIdentity;
    expect(pendingVisualDNA(decoded)).toEqual(pendingVisualDNA(identity));
    expect(resolvePortrait(decoded, saved.players.live.age, saved.playerPortraits, catalog)).toEqual(expectedPortrait);
    expect(saved.playerPortraits).toEqual(seen.playerPortraits);

    const restored = migrateVisualIdentities(saved);
    expect(restored.playerPortraits).toEqual(seen.playerPortraits);
    expect(resolvePortrait(withVisualIdentity(restored.players.live).visualIdentity,
      restored.players.live.age, restored.playerPortraits, catalog)).toEqual(expectedPortrait);
    const newcomer = player("newcomer", 26);
    const next = revealPortraits({ ...restored, players: { ...restored.players, newcomer } },
      ["newcomer"], { season: 30, week: 2 }, "selected", catalog);
    expect(next.playerPortraits.reservations["person:v1:live"]).toEqual(seen.playerPortraits.reservations["person:v1:live"]);
    expect(next.playerPortraits.faceOwners[historicalHash]).toBe("person:v1:pruned-person");
    expect(next.playerPortraits.faceOwners[faceHash]).toBe("person:v1:live");
    expect(next.playerPortraits.reservations["person:v1:newcomer"].binding).toBeUndefined();
  });

  it("preserves unknown fields on valid full identities across each player store", () => {
    const source = state();
    const records = [source.players.live, source.retiredPlayers.retired, source.unsignedYouth.opportunity.player];
    for (const record of records) {
      record.visualIdentity = { ...createVisualIdentity(record.id),
        modAuthored: { label: "Keep this authored metadata", revision: 7 } } as Player["visualIdentity"];
    }
    const compacted = compactLongCareerHistory(source);
    const saved = JSON.parse(JSON.stringify(compacted)) as GameState;
    const after = [saved.players.live, saved.retiredPlayers.retired, saved.unsignedYouth.opportunity.player];
    after.forEach((record, index) => {
      expect(record.visualIdentity).toEqual(records[index].visualIdentity);
      expect(validateVisualIdentity(record.visualIdentity, record.id)).toEqual(records[index].visualIdentity);
    });
  });

  it.each([
    { version: 2 },
    { version: 1, identityId: "person:v1:live" },
    { version: 1, seed: "face:v1:live" },
    { version: 1, modAuthored: "A version marker cannot silently discard extension fields" },
    { version: 1, identityId: "person:v1:other", seed: "face:v1:live" },
    { version: 1, identityId: "person:v1:live", seed: "face:v1:other" },
    null,
    [],
  ].map((raw) => [raw]))("rejects malformed or unsupported stored identity %j", (raw) => {
    expect(() => validateVisualIdentity(JSON.parse(JSON.stringify(raw)), "live")).toThrow();
  });

  it("rejects a version marker without a valid owning canonical player ID", () => {
    expect(() => validateVisualIdentity({ version: 1 }, "")).toThrow();
  });

  it("saves at least 128 KiB on 1024 realistic academy IDs without removing a player or history", () => {
    // Match generation.ts's namespace + UUID-shaped suffix, not artificially huge IDs.
    const cohort = Object.fromEntries(Array.from({ length: 1024 }, (_, index) => {
      const tail = index.toString(16).padStart(12, "0");
      const id = `academy_eng_home_s30_00000000-0000-4000-8000-${tail}`;
      return [id, player(id, 18)];
    }));
    const source = state({ players: cohort, retiredPlayers: {}, retiredPlayerIds: [], unsignedYouth: {}, watchlist: [] });
    const before = measureSaveRetentionFootprint(source);
    const compacted = compactLongCareerHistory(source);
    const after = measureSaveRetentionFootprint(compacted);
    expect(before.collections.players - after.collections.players).toBeGreaterThanOrEqual(128 * 1024);
    expect(before.totalBytes - after.totalBytes).toBeGreaterThanOrEqual(128 * 1024);
    expect(Object.keys(compacted.players)).toEqual(Object.keys(source.players));
    for (const [id, value] of Object.entries(source.players)) {
      expect(withoutIdentity(compacted.players[id])).toEqual(withoutIdentity(value));
      expect(withVisualIdentity(compacted.players[id]).visualIdentity).toEqual(value.visualIdentity);
    }
    expect(compactLongCareerHistory(JSON.parse(JSON.stringify(compacted)) as GameState)).toEqual(compacted);
  });
});
