import { expect, it } from "vitest";
import type { GameState, ScoutReport, ScoutingCase } from "@/engine/core/types";
import { selectReportFollowUpCases } from "@/lib/reportFollowUpPriority";

it("uses the latest private assessment across seasons while preserving distinct obligations and history", () => {
  const reports = Object.fromEntries([
    ["old", 1, 45, "monitor"], ["new", 2, 1, "monitor"], ["club", 1, 40, "inviteForTrial"],
  ].map(([id, season, week, action]) => [id, { id, playerId: "p", scoutId: "s",
    submittedSeason: season, submittedWeek: week, recommendedAction: action }])) as Record<string, ScoutReport>;
  const cases = Object.keys(reports).map((id) => ({ id, playerId: "p", reportIds: [id], activeReportId: id })) as ScoutingCase[];
  const state = { scout: { careerPath: "independent" }, reports, reportDeliveries: {} } as GameState;
  const before = structuredClone({ state, cases });
  expect(selectReportFollowUpCases(state, cases).map((item) => item.id)).toEqual(["new", "club"]);
  expect({ state, cases }).toEqual(before);
  state.reportDeliveries = { sent: { id: "sent", reportId: "old", caseId: "old", clubId: "buyer",
    channel: "directPlacement", status: "awaitingDecision", deliveredWeek: 45, deliveredSeason: 1 } };
  expect(selectReportFollowUpCases(state, cases).map((item) => item.id)).toEqual(["new", "old", "club"]);
  state.scout.careerPath = "club";
  expect(selectReportFollowUpCases(state, cases)).toHaveLength(3);
});
