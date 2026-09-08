import { describe, expect, it } from "vitest";
import type { Player, ScoutReport, UnsignedYouth } from "@/engine/core/types";
import { buildReportComparisonViewModel, resolveReportComparisonPlayers } from "@/components/game/reportComparisonModel";

function report(
  id: string,
  overrides: Partial<ScoutReport> = {},
): ScoutReport {
  return {
    id,
    playerId: `player-${id}`,
    scoutId: "scout-1",
    submittedWeek: 4,
    submittedSeason: 1,
    attributeAssessments: [],
    strengths: ["Carries the ball through pressure."],
    weaknesses: ["Away adaptation remains untested."],
    conviction: "recommend",
    summary: "A bounded professional case.",
    estimatedValue: 500_000,
    qualityScore: 72,
    ...overrides,
  } as ScoutReport;
}

function structuredReport(id: string): ScoutReport {
  return report(id, {
    intendedClubId: "club-1",
    intendedAudience: "academyDirector",
    projectedRole: "poacher",
    recommendedAction: "inviteForTrial",
    riskAssessments: [{
      id: "adaptationMobility",
      label: "Adaptation and mobility",
      status: "untested",
      evidenceIds: [],
    }],
    evidenceAssessment: {
      evidenceIds: ["cue-1", "cue-2"],
    } as ScoutReport["evidenceAssessment"],
    evidenceObservationIds: ["observation-1"],
    categoryVerdicts: {
      potential: {
        verdict: "The development ceiling warrants another controlled look.",
        confidence: "medium",
        hypothesisIds: ["hypothesis-1"],
        acknowledgedUncertainty: "Physical maturation remains unknown.",
        status: "assessed",
        evidenceIds: ["cue-1"],
      },
      roleFit: {
        verdict: "Movement currently fits a poacher pathway.",
        confidence: "high",
        hypothesisIds: ["hypothesis-2"],
        acknowledgedUncertainty: "Link play against a deep block is untested.",
        status: "assessed",
        evidenceIds: ["cue-2"],
      },
      characterRisk: {
        verdict: "No safe character claim yet.",
        confidence: "low",
        hypothesisIds: [],
        acknowledgedUncertainty: "Response to relocation is unknown.",
        status: "notAssessed",
        evidenceIds: [],
      },
    },
  });
}

describe("report comparison authority", () => {
  it("uses structured judgments and canonical evidence for modern reports", () => {
    const model = buildReportComparisonViewModel({
      reports: [structuredReport("one"), structuredReport("two")],
      players: [undefined, undefined],
      clubs: {
        "club-1": { id: "club-1", name: "Northbridge Academy" } as never,
      },
    });

    expect(model.mode).toBe("structured");
    expect(model.legacyComparison).toBeNull();
    expect(model.cards[0]).toMatchObject({
      reportStyleLabel: "Structured evidence",
      targetClubName: "Northbridge Academy",
      evidenceCount: 2,
      unknownCount: 3,
    });
    expect(model.structuredRows.find((row) => row.category === "roleFit")?.cells[0]).toMatchObject({
      available: true,
      confidenceLabel: "High",
      evidenceCount: 1,
    });
    expect(JSON.stringify(model)).not.toContain("actualAttributes");
  });

  it("does not manufacture a numeric equivalence for mixed report formats", () => {
    const legacy = report("legacy", {
      attributeAssessments: [{
        attribute: "passing",
        estimatedValue: 14,
        confidenceRange: [12, 16],
        domain: "technical",
      }],
    });
    const model = buildReportComparisonViewModel({
      reports: [structuredReport("modern"), legacy],
      players: [undefined, undefined],
      clubs: undefined,
    });

    expect(model.mode).toBe("mixed");
    expect(model.legacyComparison).toBeNull();
    expect(model.explanation).toMatch(/fair numeric comparison/i);
    expect(model.structuredRows[0].cells[1].available).toBe(false);
  });

  it("preserves the attribute lens only when every report is legacy", () => {
    const assessment = {
      attribute: "passing" as const,
      estimatedValue: 14,
      confidenceRange: [12, 16] as [number, number],
      domain: "technical" as const,
    };
    const model = buildReportComparisonViewModel({
      reports: [
        report("one", { attributeAssessments: [assessment] }),
        report("two", { attributeAssessments: [{ ...assessment, estimatedValue: 12 }] }),
      ],
      players: [undefined, undefined],
      clubs: undefined,
    });

    expect(model.mode).toBe("legacy");
    expect(model.legacyComparison?.attributes).toHaveLength(1);
    expect(model.structuredRows.every((row) => row.cells.every((cell) => !cell.available))).toBe(true);
  });
});

describe("report comparison player continuity", () => {
  it("keeps an unsigned prospect and a retired player named in the same comparison", () => {
    const youth = { id: "young-player", firstName: "Ari", lastName: "Prospect" } as Player;
    const retired = { id: "retired-player", firstName: "Jonas", lastName: "Veteran" } as Player;
    const reports = [report("young", { playerId: youth.id }), report("retired", { playerId: retired.id })];
    const players = resolveReportComparisonPlayers(reports, {
      players: {},
      unsignedYouth: { "youth-record": { id: "youth-record", player: youth } as UnsignedYouth },
      retiredPlayers: { [retired.id]: retired },
    });
    const comparison = buildReportComparisonViewModel({ reports, players, clubs: undefined });
    expect(comparison.cards.map((card) => card.playerName)).toEqual(["Ari Prospect", "Jonas Veteran"]);
  });

  it("accepts an unsigned-youth record alias and leaves a missing identity unresolved", () => {
    const youth = { id: "young-player", firstName: "Ari", lastName: "Prospect" } as Player;
    const players = resolveReportComparisonPlayers([
      { playerId: "youth-record" }, { playerId: "missing" },
    ], {
      players: {},
      unsignedYouth: { "youth-record": { id: "youth-record", player: youth } as UnsignedYouth },
    });
    expect(players).toEqual([youth, undefined]);
  });
});
