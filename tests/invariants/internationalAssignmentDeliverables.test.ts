import { describe, expect, it } from "vitest";
import type {
  GameState,
  InternationalAssignment,
  Observation,
  ScoutReport,
} from "@/engine/core/types";
import {
  activateInternationalAssignment,
  ensureInternationalAssignmentLiaison,
  migrateInternationalAssignment,
  recordInternationalAssignmentProgress,
  resolveInternationalAssignment,
  synchronizeInternationalAssignmentProgress,
} from "@/engine/world/internationalDeliverables";
import { processInternationalTravelLifecycle } from "@/stores/actions/weeklySimulationSupport";

function assignment(
  type: InternationalAssignment["type"] = "scoutingMission",
): InternationalAssignment {
  return {
    id: `assignment-${type}`,
    country: "brazil",
    region: "South America",
    description: "Visible assignment",
    weekAvailable: 1,
    duration: 2,
    reputationReward: type === "scoutingMission" ? 4 : 3,
    type,
  };
}

function observation(id: string, playerId: string, context: Observation["context"] = "liveMatch"): Observation {
  return {
    id,
    playerId,
    scoutId: "scout",
    week: 2,
    season: 1,
    context,
    attributeReadings: [],
    notes: [],
    flaggedMoments: [],
  };
}

function report(id: string, playerId: string): ScoutReport {
  return {
    id,
    playerId,
    scoutId: "scout",
    submittedWeek: 2,
    submittedSeason: 1,
    attributeAssessments: [],
    strengths: [],
    weaknesses: [],
    conviction: "recommend",
    summary: "Observable judgment",
    estimatedValue: 100_000,
    qualityScore: 70,
  };
}

function stateFor(source = assignment()): GameState {
  const active = activateInternationalAssignment(source, 1, 1);
  return {
    currentWeek: 2,
    currentSeason: 1,
    scout: {
      id: "scout",
      reputation: 40,
      travelBooking: {
        destinationCountry: "brazil",
        departureWeek: 2,
        returnWeek: 4,
        cost: 2_000,
        isAbroad: true,
      },
      countryReputations: {
        england: {
          country: "england",
          familiarity: 50,
          reportsSubmitted: 0,
          successfulFinds: 0,
          contactCount: 0,
        },
        brazil: {
          country: "brazil",
          familiarity: 10,
          reportsSubmitted: 0,
          successfulFinds: 0,
          contactCount: 0,
        },
      },
    },
    activeInternationalAssignment: active,
    internationalAssignmentHistory: [],
    observations: {},
    reports: {},
    fixtures: {},
    leagues: {
      brazilLeague: { id: "brazilLeague", country: "brazil" },
      englandLeague: { id: "englandLeague", country: "england" },
    },
    clubs: {
      brazilClub: { id: "brazilClub", leagueId: "brazilLeague" },
      englandClub: { id: "englandClub", leagueId: "englandLeague" },
    },
    players: {
      brazilPlayer: { id: "brazilPlayer", clubId: "brazilClub" },
      englandPlayer: { id: "englandPlayer", clubId: "englandClub" },
    },
    unsignedYouth: {},
    retiredPlayers: {},
    freeAgentPool: { agents: [] },
    contacts: {
      local: { id: "local", country: "brazil" },
      remote: { id: "remote", country: "england" },
    },
    inbox: [],
  } as unknown as GameState;
}

function progress(state: GameState, kind: string): number {
  return state.activeInternationalAssignment?.deliverables?.find(
    (deliverable) => deliverable.kind === kind,
  )?.progress ?? -1;
}

describe("international assignment deliverables", () => {
  it("declares distinct visible objectives and resets them at acceptance", () => {
    const youth = migrateInternationalAssignment(assignment("youthTournament"));
    const senior = migrateInternationalAssignment(assignment("seniorFriendly"));
    const mission = activateInternationalAssignment(assignment("scoutingMission"), 8, 2);

    expect(youth.deliverables?.map((item) => [item.kind, item.target])).toEqual([
      ["liveObservation", 3],
      ["submittedReport", 1],
    ]);
    expect(senior.deliverables?.map((item) => [item.kind, item.target])).toEqual([
      ["liveObservation", 2],
      ["submittedReport", 1],
    ]);
    expect(mission.deliverables?.map((item) => [item.kind, item.target])).toEqual([
      ["liveObservation", 2],
      ["submittedReport", 1],
      ["networkOutcome", 1],
    ]);
    expect(mission.acceptedWeek).toBe(8);
    expect(mission.acceptedSeason).toBe(2);
    expect(mission.creditedEventIds).toEqual([]);
  });

  it("credits only fieldwork tied to the destination during the abroad window", () => {
    const original = stateFor();
    original.observations = {
      valid: observation("valid", "brazilPlayer"),
      wrongCountry: observation("wrong-country", "englandPlayer"),
      remoteVideo: observation("video", "brazilPlayer", "videoAnalysis"),
    };
    original.reports = {
      valid: report("valid-report", "brazilPlayer"),
      wrongCountry: report("wrong-report", "englandPlayer"),
    };
    original.inbox = [
      {
        id: "meeting-local-w2-s1",
        week: 2,
        season: 1,
      },
      {
        id: "meeting-remote-w2-s1",
        week: 2,
        season: 1,
      },
    ] as GameState["inbox"];

    const synchronized = synchronizeInternationalAssignmentProgress(original);
    expect(progress(synchronized, "liveObservation")).toBe(1);
    expect(progress(synchronized, "submittedReport")).toBe(1);
    expect(progress(synchronized, "networkOutcome")).toBe(1);
    expect(synchronized.activeInternationalAssignment?.creditedEventIds).toEqual([
      "observation:valid",
      "report:scout:brazilPlayer:general",
      "network:local:s1:w2",
    ]);

    const atHome = {
      ...original,
      currentWeek: 4,
      observations: { later: { ...observation("later", "brazilPlayer"), week: 4 } },
      reports: {},
      inbox: [],
    };
    expect(progress(synchronizeInternationalAssignmentProgress(atHome), "liveObservation")).toBe(0);
  });

  it("credits distinct scouting cases rather than repeated report revisions", () => {
    const original = stateFor();
    original.activeInternationalAssignment = {
      ...original.activeInternationalAssignment!,
      deliverables: original.activeInternationalAssignment!.deliverables!.map((deliverable) =>
        deliverable.kind === "submittedReport"
          ? { ...deliverable, target: 2 }
          : deliverable,
      ),
    };
    original.reports = {
      first: { ...report("report-r1", "brazilPlayer"), caseId: "case-brazil", revision: 1 },
      revision: {
        ...report("report-r2", "brazilPlayer"),
        caseId: "case-brazil",
        revision: 2,
        supersedesReportId: "report-r1",
      },
    };

    const synchronized = synchronizeInternationalAssignmentProgress(original);
    expect(progress(synchronized, "submittedReport")).toBe(1);
    expect(synchronized.activeInternationalAssignment?.creditedEventIds).toEqual([
      "report-case:case-brazil",
    ]);
  });

  it("is exactly-once across retries and JSON save/reload", () => {
    const initial = stateFor(assignment("seniorFriendly"));
    initial.observations = { one: observation("one", "brazilPlayer") };

    const once = synchronizeInternationalAssignmentProgress(initial);
    const retried = synchronizeInternationalAssignmentProgress(once);
    const reloaded = JSON.parse(JSON.stringify(retried)) as GameState;
    const afterReload = synchronizeInternationalAssignmentProgress(reloaded);

    expect(progress(once, "liveObservation")).toBe(1);
    expect(progress(retried, "liveObservation")).toBe(1);
    expect(progress(afterReload, "liveObservation")).toBe(1);
    expect(afterReload.activeInternationalAssignment?.creditedEventIds).toEqual([
      "observation:one",
    ]);
  });

  it("makes event application order-neutral for manual and batch reconciliation", () => {
    const base = activateInternationalAssignment(assignment("seniorFriendly"), 1, 1);
    const events = [
      { id: "observation:a", kind: "liveObservation" as const },
      { id: "report:b", kind: "submittedReport" as const },
      { id: "observation:c", kind: "liveObservation" as const },
    ];
    const manual = events.reduce(recordInternationalAssignmentProgress, base);
    const batch = [...events].reverse().reduce(recordInternationalAssignmentProgress, base);

    expect(manual.deliverables).toEqual(batch.deliverables);
    expect(new Set(manual.creditedEventIds)).toEqual(new Set(batch.creditedEventIds));
  });

  it("grades full, partial, and waiting-only attempts with bounded explained consequences", () => {
    const fullState = stateFor(assignment("seniorFriendly"));
    let fullAssignment = fullState.activeInternationalAssignment!;
    for (const event of [
      { id: "o1", kind: "liveObservation" as const },
      { id: "o2", kind: "liveObservation" as const },
      { id: "r1", kind: "submittedReport" as const },
    ]) {
      fullAssignment = recordInternationalAssignmentProgress(fullAssignment, event);
    }
    const full = resolveInternationalAssignment(
      { ...fullState, activeInternationalAssignment: fullAssignment, currentWeek: 4 },
      fullAssignment,
    );
    expect(full.internationalAssignmentHistory?.at(-1)?.outcome).toMatchObject({
      grade: "full",
      completionPercent: 100,
      reputationDelta: 3,
      familiarityDelta: 3,
    });
    expect(full.scout.reputation).toBe(43);

    const partialState = stateFor(assignment("seniorFriendly"));
    const partialAssignment = recordInternationalAssignmentProgress(
      partialState.activeInternationalAssignment!,
      { id: "o1", kind: "liveObservation" },
    );
    const partial = resolveInternationalAssignment(
      { ...partialState, activeInternationalAssignment: partialAssignment, currentWeek: 4 },
      partialAssignment,
    );
    expect(partial.internationalAssignmentHistory?.at(-1)?.outcome?.grade).toBe("partial");
    expect(partial.internationalAssignmentHistory?.at(-1)?.outcome?.explanation)
      .toContain("Travel alone earns no assignment credit");
    expect(partial.scout.reputation).toBeGreaterThan(40);
    expect(partial.scout.reputation).toBeLessThan(43);

    const waitingState = stateFor(assignment("seniorFriendly"));
    const failed = resolveInternationalAssignment(
      { ...waitingState, currentWeek: 4 },
      waitingState.activeInternationalAssignment!,
    );
    expect(failed.internationalAssignmentHistory?.at(-1)?.outcome).toMatchObject({
      grade: "failed",
      completionPercent: 0,
      reputationDelta: -1,
      familiarityDelta: 0,
    });
    expect(failed.scout.reputation).toBe(39);
    expect(failed.activeInternationalAssignment).toBeNull();
    expect(failed.inbox[0].body).toContain("Travel alone earns no assignment credit");
  });

  it("applies a failed assignment penalty when the canonical travel lifecycle returns home", () => {
    const returning = {
      ...stateFor(assignment("seniorFriendly")),
      currentWeek: 4,
    };

    const resolved = processInternationalTravelLifecycle(returning);

    expect(resolved.activeInternationalAssignment).toBeNull();
    expect(resolved.scout.travelBooking).toBeUndefined();
    expect(resolved.scout.reputation).toBe(39);
    expect(resolved.internationalAssignmentHistory?.at(-1)?.outcome).toMatchObject({
      grade: "failed",
      reputationDelta: -1,
    });
  });

  it("migrates duplicate legacy event IDs and provides a local mission liaison without auto-credit", () => {
    const legacy = {
      ...assignment("scoutingMission"),
      creditedEventIds: ["observation:a", "observation:a"],
      deliverables: [{ kind: "liveObservation", label: "old", target: 99, progress: 80 }],
    } as InternationalAssignment;
    const migrated = migrateInternationalAssignment(legacy);
    expect(migrated.creditedEventIds).toEqual(["observation:a"]);
    expect(migrated.deliverables?.find((item) => item.kind === "liveObservation")?.progress).toBe(2);

    const contacts = ensureInternationalAssignmentLiaison({}, migrated);
    const liaison = contacts[`assignment-liaison-${migrated.id}`];
    expect(liaison).toMatchObject({ country: "brazil", type: "localScout" });
    expect(migrated.deliverables?.find((item) => item.kind === "networkOutcome")?.progress).toBe(0);
  });
});
