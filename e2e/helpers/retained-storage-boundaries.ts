import assert from "node:assert/strict";
import type { Page } from "@playwright/test";
import type { GameState } from "@/engine/core/types";
import { migrateSaveState } from "@/lib/db";
import { migrateHistoricalRecruitmentSnapshots } from "@/engine/world/recruitmentIdentity";
import { isValidYouthRetainerBrief } from "@/engine/finance/retainerBriefs";
import { createDashboardActions } from "@/stores/actions/dashboardActions";
import type { GameStoreState, SetState } from "@/stores/actions/types";
import { persistentStateDigest } from "../../tests/release/portraitRetentionDiagnostics";

const jsonCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** This contract is for newly produced, exact-candidate career checkpoints.
 * Existing legacy histories may remain unknown in the product. This new-source
 * producer checkpoint lane must already contain tracking; legacy compatibility
 * requires its own fixtures and cannot substitute for this storage pass.
 * It deliberately does not call the general migration to construct its oracle.
 */
export function approvedCheckpointMigration(input: GameState): GameState {
  const expected = jsonCopy(input);
  for (const player of [
    ...Object.values(expected.players),
    ...Object.values(expected.unsignedYouth ?? {}).map((youth) => youth.player),
  ]) {
    assert.ok(player.injuryHistory, `Current producer omitted injuryHistory: ${player.id}`);
    assert.ok(!player.injured || player.currentInjury,
      `Current producer omitted active injury: ${player.id}`);
  }
  for (const contract of [
    ...(expected.finances?.retainerContracts ?? []),
    ...(expected.finances?.pendingRetainerOffers ?? []),
  ]) {
    assert.ok(isValidYouthRetainerBrief(contract.brief),
      `Current producer omitted a usable retainer brief: ${contract.id}`);
    if (contract.averageDeliveredQuality === undefined) contract.averageDeliveredQuality = 0;
  }
  for (const fixture of Object.values(expected.fixtures)) {
    if (fixture.simulationDetail === undefined) fixture.simulationDetail = "full";
  }
  for (const club of Object.values(expected.clubs)) {
    if (club.loanedInPlayerIds === undefined) club.loanedInPlayerIds = [];
    if (club.loanedOutPlayerIds === undefined) club.loanedOutPlayerIds = [];
  }
  if (expected.scout.accuracyHistory === undefined) expected.scout.accuracyHistory = [];
  if (expected.finances?.bankruptcyRecoveryCooldown === undefined && expected.finances) {
    expected.finances.bankruptcyRecoveryCooldown = 0;
  }
  if (expected.invalidScenarioArchives === undefined) expected.invalidScenarioArchives = [];
  expected.activeObservationSession ??= null;

  // Historical snapshots are the only derived objects admitted here. Use the
  // independently invoked domain reconstruction, then copy ONLY absent leaves.
  // Operational brief snapshots and all authored report/case pointers survive
  // byte-for-byte; changes anywhere else will fail the full-state comparison.
  for (const brief of Object.values(expected.youthRecruitmentBriefs ?? {})) {
    assert.ok(brief.recruitmentSnapshot, `Current producer omitted brief identity: ${brief.id}`);
  }
  const historical = jsonCopy(expected);
  migrateHistoricalRecruitmentSnapshots(historical);
  for (const key of ["placementReports", "clubDecisions", "recommendationReviews"] as const) {
    for (const [id, original] of Object.entries(expected[key] ?? {})) {
      const rebuilt = historical[key]?.[id];
      assert.ok(rebuilt, `Historical migration removed ${key}.${id}`);
      if (original.recruitmentSnapshot !== undefined) {
        assert.deepEqual(rebuilt.recruitmentSnapshot, original.recruitmentSnapshot,
          `Historical snapshot was overwritten: ${key}.${id}`);
      } else if (rebuilt.recruitmentSnapshot) {
        original.recruitmentSnapshot = jsonCopy(rebuilt.recruitmentSnapshot);
      }
    }
  }
  assertCompleteCheckpoint(historical, expected, "historical reconstruction changed an unapproved field");
  return expected;
}

/** Compare all persisted gameplay fields; retain the pre-existing digest rules
 * for root lastSaved delivery metadata and absent/null active session only.
 * Portrait ownership is also compared independently, without migration.
 */
export function assertCompleteCheckpoint(actual: GameState, expected: GameState, boundary: string): void {
  assert.equal(persistentStateDigest(actual), persistentStateDigest(expected), boundary);
  assert.deepEqual(actual.playerPortraits, expected.playerPortraits, `${boundary}: portrait identity`);
  // These collections allocate shared RNG draws through Object.values during
  // development/injuries. This is not a blanket property-order comparison.
  for (const collection of ["players", "unsignedYouth"] as const) {
    assert.deepEqual(Object.keys(actual[collection] ?? {}), Object.keys(expected[collection] ?? {}),
      `${boundary}: ${collection} iteration order`);
  }
}

export function independentlyVettedMigration(input: GameState): GameState {
  const sourceDigest = persistentStateDigest(input);
  const expected = approvedCheckpointMigration(input);
  const migrated = migrateSaveState(input);
  assertCompleteCheckpoint(migrated, expected, "pure migration exceeded the reviewed checkpoint contract");
  assert.equal(persistentStateDigest(input), sourceDigest, "pure migration mutated its input");
  assertCompleteCheckpoint(migrateSaveState(migrated), migrated, "pure migration is not idempotent");
  return expected;
}

export type PresentationAction =
  | { name: "syncDashboardVisibleItems"; args: [string[]] }
  | { name: "syncDashboardInsights"; args: [Array<{ id: string; fingerprint?: string }>] };
export type PresentationReceipt = PresentationAction & { beforeDigest: string; afterDigest: string };

/** Replay the exact two observed production presentation calls on a detached
 * store. Nothing is substituted into the browser and no dashboard field is
 * excluded from the equality check (including dismissals and resolved items).
 */
export function replayPresentation(initial: GameState, trace: PresentationReceipt[]): GameState {
  let detached = { gameState: jsonCopy(initial) } as GameStoreState;
  const set: SetState = (update) => {
    detached = { ...detached, ...(typeof update === "function" ? update(detached) : update) };
  };
  const actions = createDashboardActions(() => detached, set);
  for (const [index, action] of trace.entries()) {
    assert.equal(persistentStateDigest(detached.gameState!), action.beforeDigest,
      `Unrecorded gameplay change before presentation call ${index}`);
    if (action.name === "syncDashboardVisibleItems") actions.syncDashboardVisibleItems(...action.args);
    else if (action.name === "syncDashboardInsights") actions.syncDashboardInsights(...action.args);
    else assert.fail("Unapproved presentation action");
    assert.equal(persistentStateDigest(detached.gameState!), action.afterDigest,
      `Presentation call ${index} changed state beyond the real action`);
  }
  return detached.gameState!;
}

/** Test-local transparent wrappers. Every call still executes the real action.
 * Complete states are serialized synchronously at each boundary; async hashing
 * cannot observe later writes. The recorder restores original actions on stop.
 */
export async function installPresentationRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const testWindow = window as any;
    if (testWindow.__RETAINED_STORAGE_TRACE__) throw new Error("Boundary recorder already installed");
    const store = testWindow.__GAME_STORE__;
    const names = ["syncDashboardVisibleItems", "syncDashboardInsights"] as const;
    const originals = Object.fromEntries(names.map((name) => [name, store.getState()[name]]));
    const trace: Array<{ name: string; args: unknown[]; before: string; after: string }> = [];
    const wrappers = Object.fromEntries(names.map((name) => [name, (...args: unknown[]) => {
      if (trace.length >= 24) throw new Error("Presentation boundary exceeded 24 real calls");
      const before = JSON.stringify(store.getState().gameState);
      const result = originals[name](...args);
      const after = JSON.stringify(store.getState().gameState);
      trace.push({ name, args: structuredClone(args), before, after });
      return result;
    }]));
    const digest = async (serialized: string): Promise<string> => {
      const state = JSON.parse(serialized);
      delete state.lastSaved;
      state.activeObservationSession ??= null;
      const stable = (value: any): any => {
        if (Array.isArray(value)) return value.map(stable);
        if (!value || typeof value !== "object") return value;
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, stable(entry)]));
      };
      const bytes = new TextEncoder().encode(JSON.stringify(stable(state)));
      return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
        .map((byte) => byte.toString(16).padStart(2, "0")).join("");
    };
    let stopped = false;
    testWindow.__RETAINED_STORAGE_TRACE__ = {
      stop: () => {
        if (stopped) return;
        stopped = true;
        store.setState(originals);
      },
      collect: async () => {
        if (!stopped) throw new Error("Stop presentation recording at the exact boundary before collecting");
        const receipts = [];
        for (const entry of trace) {
          receipts.push({ name: entry.name, args: entry.args,
            beforeDigest: await digest(entry.before), afterDigest: await digest(entry.after) });
          entry.before = "";
          entry.after = "";
        }
        return receipts;
      },
    };
    store.setState(wrappers);
  });
}

export async function removePresentationRecorder(page: Page): Promise<void> {
  if (page.isClosed()) return;
  await page.evaluate(() => {
    const testWindow = window as any;
    testWindow.__RETAINED_STORAGE_TRACE__?.stop();
    delete testWindow.__RETAINED_STORAGE_TRACE__;
  });
}
