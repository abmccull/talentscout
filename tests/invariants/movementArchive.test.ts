import { expect, it } from "vitest";
import { compactPlayerMovementSummary, expandPlayerMovementSummary, type PlayerMovementArchiveSummary } from "@/engine/world/worldHistoryTypes";

it("round-trips every optional movement fact through JSON, including zero fees and missing fields", () => {
  const optional = { fromClubId: "old", toClubId: "new", contractClubId: "owner", fee: 0 };
  for (let mask = 0; mask < 16; mask++) {
    const summary: PlayerMovementArchiveSummary = { id: "movement", playerId: "player", type: "permanentTransfer", week: 46 };
    Object.entries(optional).forEach(([key, value], bit) => {
      if (mask & (1 << bit)) Object.assign(summary, { [key]: value });
    });
    const source = structuredClone(summary);
    const compacted = compactPlayerMovementSummary(summary);
    expect(Array.isArray(compacted)).toBe(true);
    expect(expandPlayerMovementSummary(JSON.parse(JSON.stringify(compacted)))).toEqual(source);
    expect(compactPlayerMovementSummary(compacted)).toBe(compacted);
    expect(summary).toEqual(source);
    expect(JSON.stringify(compacted).length).toBeLessThan(JSON.stringify(summary).length);
  }
});

it("preserves legacy objects and unknown extension fields without stripping data", () => {
  const extended = { id: "movement", playerId: "player", type: "permanentTransfer" as const, week: 3, futureData: { source: "mod" } };
  expect(compactPlayerMovementSummary(extended)).toBe(extended);
  expect(expandPlayerMovementSummary(extended)).toBe(extended);
});

it("reconstructs source IDs with embedded player IDs while keeping arbitrary IDs", () => {
  for (const id of ["move_25_46_player-long-identity_release", "arbitrary-id", "player-long-identity_player-long-identity"]) {
    const row: PlayerMovementArchiveSummary = { id, playerId: "player-long-identity", type: "release", week: 46 };
    expect(expandPlayerMovementSummary(JSON.parse(JSON.stringify(compactPlayerMovementSummary(row))))).toEqual(row);
  }
});
