import { describe, expect, it } from "vitest";
import type { InjuryHistory } from "@/engine/core/types";
import { compactInjuryArchive, expandHistoricalInjury } from "@/engine/players/injuryArchive";

describe("lossless injury archive", () => {
  it("preserves every incident, exceptional value and cumulative consequence after JSON restoration", () => {
    const incident = { id: "injury-1", playerId: "player", type: "muscle" as const,
      severity: "moderate" as const, recoveryWeeks: 5, weeksRemaining: 5, reinjuryRisk: 0,
      occurredWeek: 3, occurredSeason: 12 };
    const extended = { ...incident, id: "injury-modded", customMedicalNote: "retain extension" };
    const history: InjuryHistory = {
      playerId: "player", injuries: [incident, { ...incident, id: "injury-2", playerId: "other",
        weeksRemaining: 0, reinjuryRisk: 0.2, occurredInMatch: "fixture", minute: 72 }, extended],
      totalWeeksMissed: 10, injuryProneness: 0.12, reinjuryWindowWeeksLeft: 2,
    };
    const before = structuredClone(history);
    const compacted = compactInjuryArchive(history);
    const restored = JSON.parse(JSON.stringify(compacted)) as InjuryHistory;
    expect({ ...restored, injuries: restored.injuries.map((entry) => expandHistoricalInjury(entry, restored.playerId)) }).toEqual(before);
    expect(JSON.stringify(compacted).length).toBeLessThan(JSON.stringify(history).length);
    expect(history).toEqual(before);
    expect(compactInjuryArchive(compacted)).toBe(compacted);
    expect(compacted.injuries[0]).not.toHaveProperty("playerId");
    expect(Array.isArray(compacted.injuries[0])).toBe(true);
    expect(compacted.injuries[2]).toHaveProperty("customMedicalNote", "retain extension");
    expect(expandHistoricalInjury(compacted.injuries[1], "player").playerId).toBe("other");
    expect(expandHistoricalInjury(compacted.injuries[1], "player").weeksRemaining).toBe(0);
  });
});
