import { describe, expect, it } from "vitest";
import type { GameState, InjuryHistory, PersonalityProfile } from "@/engine/core/types";
import {
  InvalidPlayerStateArchiveError,
  assertPlayerStateArchives,
  compactPlayerInjuryHistory,
  compactPlayerPersonalityProfile,
  expandPlayerInjuryHistory,
  expandPlayerPersonalityProfile,
  type StoredInjuryHistory,
  type StoredPersonalityProfile,
} from "@/engine/players/playerStateArchive";

function history(owner = "player-a"): InjuryHistory {
  return {
    playerId: owner,
    injuries: [
      ["old", "hamstring", "minor", 2, 4, 1],
      {
        id: "recent", playerId: "incident-owner", type: "ankle",
        severity: "moderate", recoveryWeeks: 5, occurredWeek: 8,
        occurredSeason: 3, weeksRemaining: 3, matchId: "custom-match",
        customMedicalFact: { notes: ["keep", "keep"], explicitNil: null },
      },
    ] as unknown as InjuryHistory["injuries"],
    totalWeeksMissed: 17,
    injuryProneness: 0.123456789012345,
    reinjuryWindowWeeksLeft: 4,
  };
}

function profile(): PersonalityProfile {
  return {
    archetype: "loyal",
    traits: ["loyal", "leader", "loyal"],
    transferWillingness: -0.123456789012345,
    dressingRoomImpact: 0.234567890123456,
    formVolatility: 1.345678901234567,
    bigMatchModifier: -0.456789012345678,
    hiddenUntilRevealed: false,
    revealedTraits: ["leader", "loyal"],
  };
}

function rawHistory(value: unknown): StoredInjuryHistory {
  return value as StoredInjuryHistory;
}
function rawProfile(value: unknown): StoredPersonalityProfile {
  return value as StoredPersonalityProfile;
}
function rawState(players: unknown, retiredPlayers: unknown = {}, unsignedYouth: unknown = []): GameState {
  return { players, retiredPlayers, unsignedYouth } as unknown as GameState;
}

describe("lossless player-state archive leaf contracts", () => {
  it("uses the fully screened owner-inherited layout and preserves every incident payload", () => {
    const ordinary = history();
    const before = JSON.stringify(ordinary);
    const packed = compactPlayerInjuryHistory(ordinary, "player-a");
    expect(packed).toEqual([
      "ih-own", 1, ordinary.injuries, 17, ordinary.injuryProneness, 4,
    ]);
    expect(expandPlayerInjuryHistory(packed, "player-a")).toEqual(ordinary);
    expect(compactPlayerInjuryHistory(packed, "player-a")).toEqual(packed);
    expect(JSON.stringify(ordinary)).toBe(before);
  });

  it("keeps exceptional and empty injury owners explicitly instead of relabeling facts", () => {
    for (const owner of ["incident-owner", ""]) {
      const ordinary = history(owner);
      const packed = compactPlayerInjuryHistory(ordinary, "player-a");
      expect(packed).toEqual([
        "ih", 1, owner, ordinary.injuries, 17, ordinary.injuryProneness, 4,
      ]);
      expect(expandPlayerInjuryHistory(packed, "different-container")).toEqual(ordinary);
    }
  });

  it("returns valid ordinary records by identity and does not mutate frozen inputs", () => {
    const ordinaryHistory = Object.freeze(history());
    const ordinaryProfile = Object.freeze(profile());
    expect(expandPlayerInjuryHistory(ordinaryHistory, "player-a")).toBe(ordinaryHistory);
    expect(expandPlayerPersonalityProfile(ordinaryProfile)).toBe(ordinaryProfile);
    expect(() => compactPlayerInjuryHistory(ordinaryHistory, "player-a")).not.toThrow();
    expect(() => compactPlayerPersonalityProfile(ordinaryProfile)).not.toThrow();
  });

  it("preserves the complete profile, independent trait arrays and exact numeric jitter", () => {
    const ordinary = profile();
    const before = JSON.stringify(ordinary);
    const packed = compactPlayerPersonalityProfile(ordinary);
    expect(packed).toEqual([
      "pp", 1, ordinary.archetype, ordinary.traits, ordinary.transferWillingness,
      ordinary.dressingRoomImpact, ordinary.formVolatility, ordinary.bigMatchModifier,
      ordinary.hiddenUntilRevealed, ordinary.revealedTraits,
    ]);
    const expanded = expandPlayerPersonalityProfile(packed);
    expect(expanded).toEqual(ordinary);
    expect(expanded.traits).not.toBe(expanded.revealedTraits);
    expect(compactPlayerPersonalityProfile(packed)).toEqual(packed);
    expect(JSON.stringify(ordinary)).toBe(before);
  });

  it("leaves unknown wrapper/profile extensions and incomplete/custom values untouched", () => {
    const extendedHistory = { ...history(), importedFact: { absent: null } };
    const extendedProfile = { ...profile(), importedFact: ["custom", null] };
    const missingHistory = { playerId: "player-a", injuries: [] };
    const missingProfile = { archetype: "loyal", traits: ["loyal"] };
    const customHistory = { ...history(), totalWeeksMissed: "legacy" };
    const customProfile = { ...profile(), archetype: "custom-archetype" };
    for (const value of [extendedHistory, missingHistory, customHistory]) {
      expect(compactPlayerInjuryHistory(rawHistory(value), "player-a")).toBe(value);
      expect(expandPlayerInjuryHistory(rawHistory(value), "player-a")).toBe(value);
    }
    for (const value of [extendedProfile, missingProfile, customProfile]) {
      expect(compactPlayerPersonalityProfile(rawProfile(value))).toBe(value);
      expect(expandPlayerPersonalityProfile(rawProfile(value))).toBe(value);
    }
  });

  it("does not replace explicit null, absent fields, custom traits or non-finite ordinary values", () => {
    const valuesH = [
      { ...history(), injuries: null },
      { ...history(), injuryProneness: null },
      { ...history(), totalWeeksMissed: Number.NaN },
      { ...history(), playerId: null },
    ];
    const valuesP = [
      { ...profile(), traits: ["custom-trait"] },
      { ...profile(), revealedTraits: null },
      { ...profile(), hiddenUntilRevealed: null },
      { ...profile(), bigMatchModifier: Number.POSITIVE_INFINITY },
    ];
    for (const value of valuesH) {
      expect(compactPlayerInjuryHistory(rawHistory(value), "player-a")).toBe(value);
      expect(expandPlayerInjuryHistory(rawHistory(value), "player-a")).toBe(value);
    }
    for (const value of valuesP) {
      expect(compactPlayerPersonalityProfile(rawProfile(value))).toBe(value);
      expect(expandPlayerPersonalityProfile(rawProfile(value))).toBe(value);
    }
    for (const nil of [undefined, null]) {
      // Raw legacy boundaries are exercised here; caller typing must preserve nil honestly.
      expect(compactPlayerInjuryHistory(rawHistory(nil), "player-a")).toBe(nil);
      expect(expandPlayerInjuryHistory(rawHistory(nil), "player-a")).toBe(nil);
      expect(compactPlayerPersonalityProfile(rawProfile(nil))).toBe(nil);
      expect(expandPlayerPersonalityProfile(rawProfile(nil))).toBe(nil);
    }
  });

  it.each(["traits", "revealedTraits"] as const)(
    "keeps an ordinary sparse %s array as the same unsupported profile",
    (field) => {
      const values: PersonalityProfile["traits"] = ["loyal", "leader", "loyal"];
      delete values[1];
      const ordinary = { ...profile(), [field]: values };
      const before = structuredClone(ordinary);

      expect(compactPlayerPersonalityProfile(ordinary)).toBe(ordinary);
      expect(expandPlayerPersonalityProfile(ordinary)).toBe(ordinary);
      expect(ordinary).toStrictEqual(before);
      expect(ordinary[field]).toBe(values);
      expect(Object.prototype.hasOwnProperty.call(values, "1")).toBe(false);
      expect(values.length).toBe(3);
    },
  );

  it.each(["traits", "revealedTraits"] as const)(
    "keeps an ordinary %s array's own custom data without packing",
    (field) => {
      const customTraitSource = { explicitNil: null, references: ["same", "same"] };
      const values = Object.assign(
        ["loyal", "leader"] as PersonalityProfile["traits"],
        { customTraitSource },
      );
      const ordinary = { ...profile(), [field]: values };
      const before = structuredClone(ordinary);

      expect(compactPlayerPersonalityProfile(ordinary)).toBe(ordinary);
      expect(expandPlayerPersonalityProfile(ordinary)).toBe(ordinary);
      expect(ordinary).toStrictEqual(before);
      expect(ordinary[field]).toBe(values);
      expect(values.customTraitSource).toBe(customTraitSource);
      expect(Object.prototype.hasOwnProperty.call(values, "customTraitSource")).toBe(true);
    },
  );

  it.each([
    ["traits", "sparse"], ["revealedTraits", "sparse"],
    ["traits", "custom"], ["revealedTraits", "custom"],
  ] as const)("refuses a recognized profile with %s %s payload without mutation", (field, shape) => {
    const values: PersonalityProfile["traits"] = ["loyal", "leader", "loyal"];
    if (shape === "sparse") delete values[1];
    else Object.assign(values, { customTraitSource: { explicitNil: null } });
    const ordinary = { ...profile(), [field]: values };
    const row = rawProfile([
      "pp", 1, ordinary.archetype, ordinary.traits, ordinary.transferWillingness,
      ordinary.dressingRoomImpact, ordinary.formVolatility, ordinary.bigMatchModifier,
      ordinary.hiddenUntilRevealed, ordinary.revealedTraits,
    ]);
    const state = rawState({ bad: { id: "bad", personalityProfile: row } });
    const before = structuredClone(state);

    expect(() => expandPlayerPersonalityProfile(row)).toThrow(InvalidPlayerStateArchiveError);
    expect(() => compactPlayerPersonalityProfile(row)).toThrow(InvalidPlayerStateArchiveError);
    expect(() => assertPlayerStateArchives(state)).toThrow(InvalidPlayerStateArchiveError);
    expect(state).toStrictEqual(before);
  });

  it("does not confuse an ordinary object's tag-looking extension with an archive", () => {
    const ordinary = { ...history(), ih: ["ih-own", 99] };
    expect(compactPlayerInjuryHistory(rawHistory(ordinary), "player-a")).toBe(ordinary);
    expect(expandPlayerInjuryHistory(rawHistory(ordinary), "player-a")).toBe(ordinary);
  });

  it.each([
    ["ih-own", 2, [], 0, 0, 0],
    ["ih-own", 1, [], 0, 0],
    ["ih-own", 1, null, 0, 0, 0],
    ["ih-own", 1, [], "0", 0, 0],
    ["ih-own", 1, [], 0, Number.NaN, 0],
    ["ih", 2, "player-a", [], 0, 0, 0],
    ["ih", 1, null, [], 0, 0, 0],
    ["ih", 1, "player-a", [], 0, 0, 0, "extra"],
  ])("refuses malformed or future recognized injury row %#", (...row) => {
    const before = structuredClone(row);
    expect(() => expandPlayerInjuryHistory(rawHistory(row), "player-a"))
      .toThrow(InvalidPlayerStateArchiveError);
    expect(() => compactPlayerInjuryHistory(rawHistory(row), "player-a"))
      .toThrow(InvalidPlayerStateArchiveError);
    expect(row).toEqual(before);
  });

  it.each([
    ["pp", 2, "loyal", [], 0, 0, 1, 0, true, []],
    ["pp", 1, "loyal", [], 0, 0, 1, 0, true],
    ["pp", 1, "loyal", null, 0, 0, 1, 0, true, []],
    ["pp", 1, "loyal", [], 0, 0, 1, "0", true, []],
    ["pp", 1, "loyal", [], 0, 0, 1, 0, null, []],
    ["pp", 1, "loyal", [], 0, 0, 1, 0, true, ["custom-trait"]],
    ["pp", 1, "custom-archetype", [], 0, 0, 1, 0, true, []],
    ["pp", 1, "loyal", [], 0, 0, Number.POSITIVE_INFINITY, 0, true, []],
  ])("refuses malformed or future recognized profile row %#", (...row) => {
    const before = structuredClone(row);
    expect(() => expandPlayerPersonalityProfile(rawProfile(row)))
      .toThrow(InvalidPlayerStateArchiveError);
    expect(() => compactPlayerPersonalityProfile(rawProfile(row)))
      .toThrow(InvalidPlayerStateArchiveError);
    expect(row).toEqual(before);
  });

  it("validates mixed live, retired and unsigned ownership without changing the source", () => {
    const state = rawState(
      { live: { id: "live", injuryHistory: ["ih-own", 1, [], 3, 0.03, 2], personalityProfile: profile() } },
      { retired: { id: "retired", injuryHistory: history("exception"), personalityProfile: ["pp", 1, "loyal", ["loyal"], 0.2, 0.1, 1, 0.05, true, []] } },
      [{ player: { id: "unsigned", injuryHistory: history("unsigned"), personalityProfile: profile() } }],
    );
    const before = JSON.stringify(state);
    expect(() => assertPlayerStateArchives(state)).not.toThrow();
    expect(JSON.stringify(state)).toBe(before);
  });

  it.each(["live", "retired", "unsigned"] as const)(
    "refuses invalid %s player archives before source repair",
    (location) => {
      for (const field of ["injuryHistory", "personalityProfile"] as const) {
        const value = field === "injuryHistory" ? ["ih-own", 9, [], 0, 0, 0] : ["pp", 9];
        const player = { id: "bad", [field]: value };
        const state = rawState(
          location === "live" ? { bad: player } : {},
          location === "retired" ? { bad: player } : {},
          location === "unsigned" ? [{ player }] : [],
        );
        const before = JSON.stringify(state);
        expect(() => assertPlayerStateArchives(state)).toThrow(InvalidPlayerStateArchiveError);
        expect(JSON.stringify(state)).toBe(before);
      }
    },
  );
});
