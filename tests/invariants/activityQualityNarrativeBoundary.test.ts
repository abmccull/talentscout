import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ActivityType, Scout } from "@/engine/core/types";
import { createRNG, type RNG } from "@/engine/rng";
import { rollActivityQuality, type ActivityQualityTier } from "@/engine/core/activityQuality";

const ACTIVITIES = [
  "attendMatch", "watchVideo", "writeReport", "networkMeeting", "trainingVisit",
  "travel", "study", "rest", "academyVisit", "youthTournament", "reviewNPCReport",
  "managerMeeting", "boardPresentation", "assignTerritory", "internationalTravel",
  "schoolMatch", "grassrootsTournament", "streetFootball", "academyTrialDay",
  "youthFestival", "followUpSession", "parentCoachMeeting", "writePlacementReport",
  "agencyShowcase", "reserveMatch", "scoutingMission", "oppositionAnalysis",
  "agentShowcase", "trialMatch", "contractNegotiation", "databaseQuery",
  "deepVideoAnalysis", "statsBriefing", "dataConference", "algorithmCalibration",
  "marketInefficiency", "analyticsTeamMeeting", "freeAgentOutreach",
  "loanMonitoring", "loanRecommendation",
] as const satisfies readonly ActivityType[];

function scoutFor(profile: number): Scout {
  return {
    fatigue: [0, 45, 100][profile],
    skills: {
      technicalEye: [2, 11, 20][profile],
      tacticalUnderstanding: [20, 4, 12][profile],
      dataLiteracy: [8, 20, 2][profile],
      psychologicalRead: [14, 3, 18][profile],
      playerJudgment: [5, 16, 10][profile],
      physicalAssessment: [19, 8, 1][profile],
      potentialAssessment: 10,
    },
  } as Scout;
}

describe("activity quality narrative boundary", () => {
  it("preserves seeded mechanics and subsequent RNG across every activity and varied scouts", () => {
    const samples = ACTIVITIES.flatMap((activity) => [0, 1, 2].flatMap((profile) =>
      Array.from({ length: 20 }, (_, seed) => {
        const rng = createRNG(`quality-compatibility-${activity}-${profile}-${seed}`);
        const { narrative: _narrative, ...effects } = rollActivityQuality(rng, activity, scoutFor(profile));
        return [effects, rng.next()];
      }),
    ));
    // Captured before the narrative-only refactor: 2,400 rolls, including travel's
    // legacy single draw. Excludes prose so wording can evolve independently.
    expect(createHash("sha256").update(JSON.stringify(samples)).digest("hex")).toBe("930134b57da7c1e34dc6478a6511cddf8d058e82e75844de509171496eb98ebb");
  });

  it.each([
    ["schoolMatch", "School Match"],
    ["academyVisit", "Academy Visit"],
    ["followUpSession", "Follow-Up Session"],
    ["parentCoachMeeting", "Parent/Coach Meeting"],
    ["attendMatch", "Match Attendance"],
    ["networkMeeting", "Network Meeting"],
    ["writeReport", "Report Writing"],
    ["databaseQuery", "Database Query"],
  ] as const)("keeps %s quality about the work and opportunity rather than invented outcomes", (activity, label) => {
    const tiers: ActivityQualityTier[] = ["poor", "average", "good", "excellent", "exceptional"];
    for (const tier of tiers) {
      for (const templateIndex of [0, 1]) {
        let draws = 0;
        const rng = {
          pickWeighted: () => { draws += 1; return tier; },
          pick: (templates: string[]) => {
            draws += 1;
            expect(templates).toHaveLength(2);
            return templates[templateIndex];
          },
        } as unknown as RNG;
        const result = rollActivityQuality(rng, activity, scoutFor(0), "independent");
        expect(result.narrative).toContain(label);
        expect(result.narrative).toMatch(/work|opportunit|session/i);
        expect(result.narrative).not.toMatch(/wonderkid|dominat|international duty|stable home|work ethic|true ability|player performed|signed|transfer|weather|rain|relationship|impressed|confirmed|reveal/i);
        expect(draws).toBe(2);
      }
    }
  });
});
