import { describe, expect, it } from "vitest";
import type { NewGameConfig, Observation, ScoutReport, UnsignedYouth } from "@/engine/core/types";
import { getAvailableActivities } from "@/engine/core/calendar";
import { createRNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";
import { generatePlayer } from "@/engine/players/generation";
import { observePlayerLight } from "@/engine/scout/perception";
import { indexLatestPlayerReports } from "@/engine/reports/reportAccountability";

function fixture() {
  const config: NewGameConfig = { scoutFirstName: "Search", scoutLastName: "Scout", scoutAge: 30,
    specialization: "youth", difficulty: "normal", worldSeed: "youth-planner-reachability",
    startingCountry: "england", selectedCountries: ["england"],
    skillAllocations: { technicalEye: 2, physicalAssessment: 1, psychologicalRead: 1,
      tacticalUnderstanding: 1, dataLiteracy: 1, playerJudgment: 1, potentialAssessment: 1 } };
  const scout = createScout(config, createRNG("search-scout"));
  const youth: Record<string, UnsignedYouth> = {};
  const observations: Record<string, Observation> = {};
  for (let index = 0; index < 7; index++) {
    const player = generatePlayer(createRNG(`search-player-${index}`), { position: "CM",
      ageRange: [16, 16], abilityRange: [50, 50], nationality: "English", clubId: "" });
    youth[player.id] = { id: `unsigned-${index}`, player, visibility: 10, buzzLevel: 0,
      discoveredBy: [scout.id], regionId: "region", country: "england", venueAppearances: ["schoolMatch"],
      generatedSeason: 1, placed: false, retired: false };
    for (let visit = 0; visit < 7 - index; visit++) {
      const observation = { ...observePlayerLight(createRNG(`visit-${index}-${visit}`), player, scout, "schoolMatch", []),
        week: visit + 1, season: 1 };
      observations[observation.id] = observation;
    }
  }
  const ids = Object.keys(youth);
  const report = (playerId: string, overrides: Partial<ScoutReport> = {}): ScoutReport => ({
    id: `report-${playerId}`, playerId, scoutId: scout.id, submittedWeek: 8, submittedSeason: 1,
    attributeAssessments: [], strengths: [], weaknesses: [], conviction: "note", summary: "A tentative case",
    estimatedValue: 200, qualityScore: 50, recommendedAction: "monitor", ...overrides,
  });
  const activities = (reports: ScoutReport[] = []) => getAvailableActivities(scout, 9, [], [], undefined,
    observations, youth, {}, undefined, undefined, Object.fromEntries(reports.map((item) => [item.id, item])));
  return { scout, youth, observations, ids, report, activities };
}

describe("searchable youth planner reachability", () => {
  it("keeps the sixth and seventh known youth reachable for follow-up and a filed pitch", () => {
    const f = fixture();
    const activities = f.activities([f.report(f.ids[5]), f.report(f.ids[6])]);
    for (const type of ["followUpSession", "parentCoachMeeting"]) {
      expect(activities.find((item) => item.type === type)?.targetPool?.map((item) => item.id)).toEqual(f.ids);
    }
    expect(activities.find((item) => item.type === "writePlacementReport")?.targetPool?.map((item) => item.id))
      .toEqual([f.ids[5], f.ids[6]]);
  });

  it("does not offer a pitch that the latest private pass will reject after consuming a day", () => {
    const f = fixture();
    const positive = f.report(f.ids[0], { id: "older", submittedWeek: 7 });
    const pass = f.report(f.ids[0], { id: "latest", recommendedAction: "pass" });
    const stranger = f.report(f.ids[1], { scoutId: "another-scout" });
    const activities = f.activities([positive, pass, stranger]);
    expect(activities.some((item) => item.type === "writePlacementReport")).toBe(false);
    // Re-evaluation through fresh scouting remains a valid player decision.
    expect(activities.find((item) => item.type === "followUpSession")?.targetPool?.some((item) => item.id === f.ids[0])).toBe(true);
  });

  it("shares immutable revision precedence with weekly delivery and excludes inactive or unseen youth", () => {
    const f = fixture();
    const older = f.report(f.ids[0], { id: "z-older", revision: 1 });
    const newer = f.report(f.ids[0], { id: "a-newer", revision: 2, recommendedAction: "pass" });
    expect(indexLatestPlayerReports([older, newer], f.scout.id).get(f.ids[0])).toBe(newer);
    const separateBrief = f.report(f.ids[0], { id: "z-separate-brief", briefId: "other-brief", revision: 1 });
    expect(indexLatestPlayerReports([older, newer, separateBrief], f.scout.id).get(f.ids[0])).toBe(separateBrief);
    f.youth[f.ids[1]].placed = true;
    f.youth[f.ids[2]].retired = true;
    for (const [id, observation] of Object.entries(f.observations)) {
      if (observation.playerId === f.ids[3]) delete f.observations[id];
    }
    const activities = f.activities([older, newer, ...f.ids.slice(1).map((id) => f.report(id))]);
    expect(activities.find((item) => item.type === "writePlacementReport")?.targetPool?.map((item) => item.id))
      .toEqual(f.ids.slice(4));
    const reconsidered = { ...newer, revision: 3, recommendedAction: "monitor" as const };
    expect(f.activities([older, reconsidered]).find((item) => item.type === "writePlacementReport")?.targetPool?.[0].id).toBe(f.ids[0]);
  });
});
