import { describe, expect, it, vi } from "vitest";
import type { GameState } from "@/engine/core/types";
import { createDashboardActions } from "@/stores/actions/dashboardActions";
import { migrateDashboardState } from "@/engine/dashboard/state";
import type { GameStoreState, SetState } from "@/stores/actions/types";
import { persistentStateDigest } from "../release/portraitRetentionDiagnostics";
import { RNG } from "@/engine/rng";
import { processInjuries } from "@/engine/core/weekly/playerSimulation";
import {
  approvedCheckpointMigration, assertCompleteCheckpoint, replayPresentation,
  type PresentationReceipt,
} from "../../e2e/helpers/retained-storage-boundaries";

function input(): GameState {
  return {
    seed: "retained-boundary", currentSeason: 2, currentWeek: 1, lastSaved: 10,
    players: { player: { id: "player", injured: false,
      injuryHistory: { playerId: "player", injuries: [], totalWeeksMissed: 0,
        injuryProneness: 0, reinjuryWindowWeeksLeft: 0 } } },
    unsignedYouth: {}, clubs: { club: { id: "club", budget: 500 } },
    fixtures: { old: { id: "old" }, abstract: { id: "abstract", simulationDetail: "abstract" } },
    scout: {}, finances: { balance: 90, retainerContracts: [], pendingRetainerOffers: [] },
    scoutingCases: { case: { activeReportId: "latest" } },
    youthRecruitmentBriefs: {}, placementReports: {}, clubDecisions: {}, recommendationReviews: {},
    playerPortraits: { marker: "immutable ownership" },
    dashboardState: migrateDashboardState(undefined),
  } as unknown as GameState;
}

describe("retained native storage boundary contract", () => {
  it("rejects player-map reordering that changes the recipient of identical injury draws", () => {
    const expected = approvedCheckpointMigration(input());
    const first = { ...expected.players.player, attributes: { injuryProneness: 10 } } as GameState["players"][string];
    const second = { ...first, id: "second", injuryHistory: { ...first.injuryHistory!, playerId: "second" } };
    expected.players = { player: first, second };
    const changed = { ...expected, players: { second, player: first } };
    const draws = () => {
      const rng = new RNG("same-boundary-injury-draws");
      vi.spyOn(rng, "chance").mockReturnValueOnce(true).mockReturnValue(false);
      return rng;
    };
    expect(processInjuries(expected, draws()).map((entry) => entry.playerId)).toEqual(["player"]);
    expect(processInjuries(changed, draws()).map((entry) => entry.playerId)).toEqual(["second"]);
    // Retain the existing semantic digest; order gets an additional explicit check.
    expect(persistentStateDigest(changed)).toBe(persistentStateDigest(expected));
    expect(() => assertCompleteCheckpoint(changed, expected, "commit")).toThrow("players iteration order");
  });

  it("rejects unsigned-youth order changes while permitting harmless player-record property order", () => {
    const expected = approvedCheckpointMigration(input());
    const youthFields = { visibility: 20, buzzLevel: 0, discoveredBy: [], regionId: "england", country: "england",
      venueAppearances: [], generatedSeason: 1, placed: false, retired: false };
    expected.unsignedYouth = {
      first: { ...youthFields, id: "first", player: expected.players.player },
      second: { ...youthFields, id: "second", player: { ...expected.players.player, id: "second" } },
    };
    const changed = { ...expected, unsignedYouth: {
      second: expected.unsignedYouth.second, first: expected.unsignedYouth.first,
    } };
    expect(persistentStateDigest(changed)).toBe(persistentStateDigest(expected));
    expect(() => assertCompleteCheckpoint(changed, expected, "restore")).toThrow("unsignedYouth iteration order");
    const reorderedRecord = structuredClone(expected);
    reorderedRecord.players.player = Object.fromEntries(Object.entries(expected.players.player).reverse()) as GameState["players"][string];
    expect(Object.keys(reorderedRecord.players.player)).not.toEqual(Object.keys(expected.players.player));
    expect(() => assertCompleteCheckpoint(reorderedRecord, expected, "record property order")).not.toThrow();
  });

  it("admits only exact reviewed missing metadata while preserving existing values", () => {
    const source = input();
    const original = JSON.stringify(source);
    const migrated = approvedCheckpointMigration(source);
    expect(migrated.fixtures.old.simulationDetail).toBe("full");
    expect(migrated.fixtures.abstract.simulationDetail).toBe("abstract");
    expect(migrated.scout.accuracyHistory).toEqual([]);
    expect(migrated.clubs.club.loanedInPlayerIds).toEqual([]);
    expect(migrated.scoutingCases.case.activeReportId).toBe("latest");
    expect(migrated.players.player.injuryHistory).toEqual(source.players.player.injuryHistory);
    expect(JSON.stringify(source)).toBe(original);
    expect(approvedCheckpointMigration(migrated)).toEqual(migrated);
  });

  it("does not certify a current producer that needs injury tracking or retainer gameplay repairs", () => {
    const missingInjury = input();
    delete missingInjury.players.player.injuryHistory;
    expect(() => approvedCheckpointMigration(missingInjury)).toThrow("omitted injuryHistory");
    const missingRetainer = input();
    missingRetainer.finances!.retainerContracts = [{ id: "broken-live-retainer" }] as never;
    expect(() => approvedCheckpointMigration(missingRetainer)).toThrow("omitted a usable retainer brief");
    const missingActiveInjury = input();
    missingActiveInjury.players.player.injured = true;
    expect(() => approvedCheckpointMigration(missingActiveInjury)).toThrow("omitted active injury");
  });

  it("preserves an existing historical snapshot and links only absent decision/review leaves", () => {
    const source = input();
    const snapshot = { marker: "historical context at signing" };
    source.placementReports = { placement: { id: "placement", targetClubId: "club", reportId: "report",
      caseId: "case", recruitmentSnapshot: snapshot } } as never;
    source.clubDecisions = { decision: { id: "decision", deliveryId: "delivery", clubId: "club",
      placementReportId: "placement", reportId: "report", caseId: "case" } } as never;
    source.recommendationReviews = { review: { id: "review", clubId: "club", reportId: "report", caseId: "case" } } as never;
    const expected = approvedCheckpointMigration(source);
    expect(expected.placementReports.placement.recruitmentSnapshot).toEqual(snapshot);
    expect(expected.clubDecisions.decision.recruitmentSnapshot).toEqual(snapshot);
    expect(expected.recommendationReviews.review.recruitmentSnapshot).toEqual(snapshot);
    expect(source.clubDecisions.decision.recruitmentSnapshot).toBeUndefined();
    expect(expected.scoutingCases.case.activeReportId).toBe("latest");
  });

  it.each(["case pointer", "money", "injury", "portrait"])("still rejects a changed %s in complete state", (field) => {
    const expected = approvedCheckpointMigration(input());
    const changed = structuredClone(expected);
    if (field === "case pointer") changed.scoutingCases.case.activeReportId = "old";
    if (field === "money") changed.finances!.balance += 1;
    if (field === "injury") changed.players.player.injuryHistory!.totalWeeksMissed += 1;
    if (field === "portrait") changed.playerPortraits = undefined;
    expect(() => assertCompleteCheckpoint(changed, expected, "boundary")).toThrow();
  });

  it("replays only recorded real presentation actions and catches an unrelated change", () => {
    const initial = approvedCheckpointMigration(input());
    let actual = { gameState: structuredClone(initial) } as GameStoreState;
    const set: SetState = (update) => {
      actual = { ...actual, ...(typeof update === "function" ? update(actual) : update) };
    };
    const actions = createDashboardActions(() => actual, set);
    const beforeDigest = persistentStateDigest(actual.gameState!);
    actions.syncDashboardVisibleItems(["observed-prospect", "report-awaiting-response"]);
    const trace: PresentationReceipt[] = [{ name: "syncDashboardVisibleItems",
      args: [["observed-prospect", "report-awaiting-response"]], beforeDigest,
      afterDigest: persistentStateDigest(actual.gameState!) }];
    expect(replayPresentation(initial, trace)).toEqual(actual.gameState);
    actual.gameState!.finances!.balance += 1;
    expect(() => replayPresentation(initial, [{ ...trace[0], afterDigest: persistentStateDigest(actual.gameState!) }]))
      .toThrow("changed state beyond the real action");
  });
});
