import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { ObservationSession, PlayerMoment, SessionPhase } from "@/engine/observation/types";
import { createSession } from "@/engine/observation/session";
import { createRNG } from "@/engine/rng";
import { migrateStructuredScoutingEvidence } from "@/engine/scout/evidenceMigration";
import type { ScoutReport } from "@/engine/core/types";
import { migrateSaveRecord } from "@/lib/db";

const goldenV0Path = fileURLToPath(
  new URL("../fixtures/saves/v0-save-record.json", import.meta.url),
);

function legacyActiveSession(): ObservationSession {
  const base = createSession({
    activityType: "schoolMatch",
    specialization: "youth",
    playerPool: [{ playerId: "legacy-player", name: "Legacy Prospect", position: "CM" }],
    targetPlayerId: "legacy-player",
    countryId: "england",
    seed: "legacy-structured-evidence",
    week: 3,
    season: 1,
  }, createRNG("legacy-structured-evidence"));
  const moment: PlayerMoment = {
    id: "legacy-moment",
    playerId: "legacy-player",
    momentType: "technicalAction",
    quality: 7,
    attributesHinted: ["firstTouch"],
    description: "The player receives on the half-turn and escapes pressure.",
    vagueDescription: "The player finds a way through pressure.",
    pressureContext: true,
    isStandout: true,
  };
  const phase: SessionPhase = {
    ...base.phases[0],
    index: 0,
    minute: 31,
    description: "Legacy live phase",
    moments: [moment],
  };
  const session = {
    ...base,
    state: "active" as const,
    phases: [phase],
    players: [{
      playerId: "legacy-player",
      name: "Legacy Prospect",
      position: "CM",
      isFocused: true,
      focusedPhases: [0],
      focusHistory: [{ phaseIndex: 0, lens: "general" as const }],
      currentLens: "general" as const,
    }],
    scoutingQuestionId: undefined,
    cueReadings: undefined,
    evidenceDecisions: undefined,
  };
  return session;
}

function legacyReport(scoutId: string): ScoutReport {
  return {
    id: "legacy-report",
    playerId: "legacy-player",
    scoutId,
    submittedWeek: 2,
    submittedSeason: 1,
    attributeAssessments: [],
    strengths: ["Kept the ball under pressure"],
    weaknesses: [],
    conviction: "note",
    summary: "Legacy prose remains an archival record, not reconstructed evidence.",
    estimatedValue: 0,
    qualityScore: 35,
  };
}

describe("structured evidence save migration", () => {
  it("reconstructs only deterministic in-progress cues and is idempotent", () => {
    const legacyRecord = JSON.parse(readFileSync(goldenV0Path, "utf8")) as unknown;
    const baseline = migrateSaveRecord(legacyRecord).state;
    const source = {
      ...baseline,
      scout: { ...baseline.scout, primarySpecialization: "youth" as const },
      activeObservationSession: legacyActiveSession(),
      reports: {
        ...baseline.reports,
        "legacy-report": legacyReport(baseline.scout.id),
      },
    };
    const sourceSnapshot = structuredClone(source);

    const first = migrateStructuredScoutingEvidence(source);
    const second = migrateStructuredScoutingEvidence(first);

    expect(source).toEqual(sourceSnapshot);
    expect(first.activeObservationSession?.scoutingQuestionId).toBe("projection");
    expect(first.activeObservationSession?.cueReadings).toHaveLength(1);
    expect(first.activeObservationSession?.cueReadings?.[0]).not.toHaveProperty("trueValue");
    expect(first.activeObservationSession?.evidenceDecisions).toEqual({});
    expect(first.reports["legacy-report"].summary).toBe(source.reports["legacy-report"].summary);
    expect(first.reports["legacy-report"].evidenceAssessment).toBeUndefined();
    expect(second).toEqual(first);
  });
});
