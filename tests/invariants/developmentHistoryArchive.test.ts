import { expect, it } from "vitest";
import { expandDevelopmentHistoryEntry, packDevelopmentHistoryEntry } from "@/engine/players/developmentHistoryArchive";
import { getPlayerDevelopmentHistoryId, getPlayerDevelopmentHistoryOutcome, getPlayerDevelopmentHistorySummary, type PlayerDevelopmentHistoryEntry } from "@/engine/world/developmentEnvironment";

it("preserves every event and environment combination, dates, club context and public history through JSON", () => {
  for (const event of ["routine-growth", "breakthrough", "decline", "injury-setback"] as const) {
    for (const environmentBand of ["excellent", "supportive", "mixed", "restricted", "adverse"] as const) {
      for (const clubId of [undefined, "club", ""]) {
        const row: PlayerDevelopmentHistoryEntry = { season: 17, week: 46, event, environmentBand,
          ...(clubId !== undefined ? { clubId } : {}) };
        const packed = packDevelopmentHistoryEntry(row), saved = JSON.parse(JSON.stringify(packed));
        expect(expandDevelopmentHistoryEntry(saved)).toEqual(row);
        expect(getPlayerDevelopmentHistoryId(saved, "player")).toBe(getPlayerDevelopmentHistoryId(row, "player"));
        expect(getPlayerDevelopmentHistorySummary(saved)).toBe(getPlayerDevelopmentHistorySummary(row));
        expect(getPlayerDevelopmentHistoryOutcome(saved)).toBe(getPlayerDevelopmentHistoryOutcome(row));
        expect(packDevelopmentHistoryEntry(packed)).toBe(packed);
      }
    }
  }
});

it("leaves custom wording, source IDs and extension fields intact", () => {
  const row: PlayerDevelopmentHistoryEntry = { season: 2, week: 3, event: "breakthrough", environmentBand: "mixed", summary: "A remembered turning point", id: "source-event", outcome: "setback" };
  expect(packDevelopmentHistoryEntry(row)).toBe(row);
  const extended = { season: 2, week: 3, event: "decline" as const, environmentBand: "adverse" as const, modSource: "custom" };
  expect(packDevelopmentHistoryEntry(extended)).toBe(extended);
});
