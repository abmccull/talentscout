// Prepared after the nullish-collection failure note, before its product correction.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Club, GameState } from "@/engine/core/types";
import { compactLongCareerHistory } from "@/engine/world/saveRetention";
import { migrateSaveState } from "@/lib/db";

function career(): GameState {
  const fixture = JSON.parse(readFileSync(new URL("../fixtures/saves/v0-save-record.json", import.meta.url), "utf8")) as { state: unknown };
  const state = migrateSaveState(fixture.state);
  state.clubs = { host: { id: "host", name: "host", shortName: "host", leagueId: "league",
    reputation: 55, budget: 5_000, scoutingPhilosophy: "academyFirst", managerId: "manager",
    playerIds: [], academyPlayerIds: [], youthAcademyRating: 13,
    loanedInPlayerIds: [], loanedOutPlayerIds: [] } as Club };
  state.loanHistory = [];
  return state;
}

describe("terminal retention preserves existing nullish collection compatibility", () => {
  it("preserves an owned null loan history through direct compaction", () => {
    const source = career();
    Object.assign(source, { loanHistory: null });
    const before = JSON.stringify(source);
    const actual = compactLongCareerHistory(source);
    expect(Object.hasOwn(actual, "loanHistory")).toBe(true);
    expect(actual.loanHistory).toBeNull();
    expect(JSON.stringify(source)).toBe(before);
  });

  it("preserves an owned null obligation collection through direct compaction", () => {
    const source = career();
    Object.assign(source.clubs.host, { financialObligations: null });
    const before = JSON.stringify(source);
    const actual = compactLongCareerHistory(source);
    expect(Object.hasOwn(actual.clubs.host, "financialObligations")).toBe(true);
    expect(actual.clubs.host.financialObligations).toBeNull();
    expect(JSON.stringify(source)).toBe(before);
  });

  it("lets the common loader perform the existing null-to-empty economics normalization", () => {
    const source = career();
    Object.assign(source.clubs.host, { financialObligations: null });
    const before = JSON.stringify(source);
    const actual = migrateSaveState(source);
    expect(actual.clubs.host.financialObligations).toEqual([]);
    expect(source.clubs.host.financialObligations).toBeNull();
    expect(JSON.stringify(source)).toBe(before);
    expect(migrateSaveState(actual)).toEqual(actual);
  });
});
