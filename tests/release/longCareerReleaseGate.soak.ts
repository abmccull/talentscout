import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { describe, expect, it, vi } from "vitest";
import type { GameState } from "@/engine/core/types";
import { getSeasonLength } from "@/engine/core/gameDate";
import {
  observeWeeklySimulationTelemetry,
  type WeeklySimulationTelemetry,
} from "@/engine/core/weeklySimulationPipeline";
import {
  findSaveRetentionReferenceViolations,
  measureSaveRetentionFootprint,
  observeSaveRetentionCompaction,
  resolvePlacementPlayerId,
  SAVE_RETENTION_COLLECTION_KEYS,
} from "@/engine/world/saveRetention";
import type {
  SaveRetentionCollectionKey,
  SaveRetentionCompactionSample,
  SaveRetentionFootprint,
} from "@/engine/world/saveRetention";
import { WORLD_HISTORY_MAX_SEASONS } from "@/engine/world/worldHistory";
import {
  collectAutonomousWorldHealth,
  createAutonomousCareerTelemetry,
  driveAutonomousYouthCareerWeek,
  stabilizeAutonomousCareerState,
} from "./autonomousYouthCareerDriver";
import type {
  AutonomousCareerTelemetry,
  AutonomousWorldHealthSnapshot,
} from "./autonomousYouthCareerDriver";

vi.mock("@/lib/activeSaveProvider", () => ({
  getActiveSaveProvider: async () => ({
    save: async () => undefined,
  }),
  isSupabaseCloudSaveActive: async () => false,
}));

vi.mock("@/lib/db", () => ({
  AUTOSAVE_SLOT: 0,
  migrateSaveState: (state: unknown) => state,
  migrateFreeAgentGeography: () => undefined,
  db: {
    mods: {
      toArray: async () => [],
    },
    leaderboard: {
      put: async () => undefined,
      clear: async () => undefined,
    },
  },
}));

const RELEASE_SEED_COUNT = Number.parseInt(process.env.SOAK_SEEDS ?? "20", 10);
const RELEASE_SEED_START = Number.parseInt(process.env.SOAK_SEED_START ?? "1", 10);
const RELEASE_SEASON_COUNT = Number.parseInt(process.env.SOAK_SEASONS ?? "30", 10);
const OUTPUT_PATH = resolve(
  process.env.SOAK_OUTPUT
    ?? "artifacts/release/generated/long-career-release-summary.json",
);
const MAX_SERIALIZED_BYTES = Number.parseInt(
  process.env.SOAK_MAX_SERIALIZED_BYTES ?? String(80 * 1024 * 1024),
  10,
);
const MAX_GROWTH_MULTIPLIER = 64;
const MAX_SINGLE_BATCH_MS = 30_000;
const DIAGNOSTIC_ONLY = process.env.SOAK_DIAGNOSTIC_ONLY === "true";
const WORKER_MODE = process.env.SOAK_WORKER_MODE === "true";
const MAX_HEAP_USED_BYTES = 1536 * 1024 * 1024;
const MAX_RSS_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_POST_GC_HEAP_GROWTH_BYTES = 1024 * 1024 * 1024;
const COLLECTION_BYTE_BUDGETS: Record<SaveRetentionCollectionKey, number> = {
  players: 32 * 1024 * 1024,
  // Five recent seasons keep broad 500-player comparison detail; older
  // seasons keep an elite public archive plus every scout-causal career.
  worldHistory: 24 * 1024 * 1024,
  fixtures: 8 * 1024 * 1024,
  matchRatings: 8 * 1024 * 1024,
  playerMovementHistory: 8 * 1024 * 1024,
  retiredPlayers: 6 * 1024 * 1024,
  retiredPlayerIds: 512 * 1024,
  unsignedYouth: 12 * 1024 * 1024,
};

interface MemorySample {
  season: number;
  heapUsedBytes: number;
  rssBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
}

interface RunEvidence {
  seed: string;
  reachedSeason: number;
  canonicalTicks: number;
  calendarWeeksSpanned: number;
  initialBytes: number;
  finalBytes: number;
  peakBytes: number;
  finalToInitialRatio: number;
  worldHistorySeasons: number;
  worldHistoryBytes: number;
  largestCollections: Array<{ key: string; bytes: number }>;
  seasonGrowth: Array<{
    season: number;
    serializedBytes: number;
    growthBytes: number;
    compactionRemovedBytes: number;
    compactionEvents: number;
    collectionBytes: Record<SaveRetentionCollectionKey, number>;
    collectionCompactionDeltas: Record<SaveRetentionCollectionKey, number>;
  }>;
  compaction: {
    events: number;
    seasonsWithReduction: number;
    totalRemovedBytes: number;
    collectionDeltas: Record<SaveRetentionCollectionKey, number>;
  };
  memory: {
    initial: MemorySample;
    final: MemorySample;
    peakHeapUsedBytes: number;
    peakRssBytes: number;
    samples: MemorySample[];
  };
  weeklyLatencyMs: {
    p50: number;
    p95: number;
    max: number;
    mean: number;
  };
  worldHealth: AutonomousWorldHealthSnapshot[];
  careerTelemetry: AutonomousCareerTelemetry;
  digest: string;
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function round(value: number, precision = 2): number {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function collectMemorySample(season: number): MemorySample {
  const usage = process.memoryUsage();
  return {
    season,
    heapUsedBytes: usage.heapUsed,
    rssBytes: usage.rss,
    externalBytes: usage.external,
    arrayBuffersBytes: usage.arrayBuffers,
  };
}

function requestGarbageCollection(): void {
  (globalThis as typeof globalThis & { gc?: () => void }).gc?.();
}

async function flushAsyncPersistenceQueue(): Promise<void> {
  await new Promise<void>((resolveFlush) => setImmediate(resolveFlush));
}

function deterministicDigest(state: GameState): string {
  const nondeterministicKeys = new Set(["createdAt", "lastSaved", "unlockedAt", "completedAt"]);
  return createHash("sha256")
    .update(JSON.stringify(state, (key, value) => nondeterministicKeys.has(key) ? undefined : value))
    .digest("hex");
}

function serializedRoundTripDigest(state: GameState): string {
  return deterministicDigest(JSON.parse(JSON.stringify(state)) as GameState);
}

function serializedBytes(state: GameState): number {
  return Buffer.byteLength(JSON.stringify(state), "utf8");
}

function valueBytes(value: unknown): number {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? 0 : Buffer.byteLength(serialized, "utf8");
}

function playerRetentionDiagnostic(state: GameState): Record<string, unknown> {
  const players = Object.values(state.players);
  const fieldBytes = {
    seasonRatings: 0,
    injuryHistory: 0,
    developmentHistory: 0,
    recentMatchRatings: 0,
    attributes: 0,
    personalityProfile: 0,
    remainingPlayerFields: 0,
  };
  for (const player of players) {
    const {
      seasonRatings,
      injuryHistory,
      developmentHistory,
      recentMatchRatings,
      attributes,
      personalityProfile,
      ...remainingPlayerFields
    } = player;
    fieldBytes.seasonRatings += valueBytes(seasonRatings);
    fieldBytes.injuryHistory += valueBytes(injuryHistory);
    fieldBytes.developmentHistory += valueBytes(developmentHistory);
    fieldBytes.recentMatchRatings += valueBytes(recentMatchRatings);
    fieldBytes.attributes += valueBytes(attributes);
    fieldBytes.personalityProfile += valueBytes(personalityProfile);
    fieldBytes.remainingPlayerFields += valueBytes(remainingPlayerFields);
  }
  const rosterSizes = Object.values(state.clubs).map((club) => ({
    senior: club.playerIds.length,
    academy: club.academyPlayerIds?.length ?? 0,
  }));
  return {
    season: state.currentSeason,
    activePlayers: players.length,
    averagePlayerBytes: players.length > 0
      ? Math.round(valueBytes(state.players) / players.length)
      : 0,
    fieldBytes,
    roster: {
      maxSenior: Math.max(0, ...rosterSizes.map((size) => size.senior)),
      maxAcademy: Math.max(0, ...rosterSizes.map((size) => size.academy)),
      averageSenior: round(
        rosterSizes.reduce((sum, size) => sum + size.senior, 0) / Math.max(1, rosterSizes.length),
      ),
      averageAcademy: round(
        rosterSizes.reduce((sum, size) => sum + size.academy, 0) / Math.max(1, rosterSizes.length),
      ),
    },
  };
}

function largestCollections(state: GameState): Array<{ key: string; bytes: number }> {
  return Object.entries(state)
    .map(([key, value]) => {
      const serialized = JSON.stringify(value);
      return {
        key,
        bytes: serialized === undefined ? 0 : Buffer.byteLength(serialized, "utf8"),
      };
    })
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 12);
}

function emptyCollectionBytes(): Record<SaveRetentionCollectionKey, number> {
  return Object.fromEntries(
    SAVE_RETENTION_COLLECTION_KEYS.map((key) => [key, 0]),
  ) as Record<SaveRetentionCollectionKey, number>;
}

function sumCompactionDeltas(
  samples: readonly SaveRetentionCompactionSample[],
): Record<SaveRetentionCollectionKey, number> {
  const totals = emptyCollectionBytes();
  for (const sample of samples) {
    for (const key of SAVE_RETENTION_COLLECTION_KEYS) {
      totals[key] += sample.collectionDeltas[key];
    }
  }
  return totals;
}

function collectNonFiniteNumbers(value: unknown): string[] {
  const failures: string[] = [];
  const visit = (candidate: unknown, path: string): void => {
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) failures.push(path);
      return;
    }
    if (!candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      candidate.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, entry] of Object.entries(candidate as Record<string, unknown>)) {
      visit(entry, path ? `${path}.${key}` : key);
    }
  };
  visit(value, "");
  return failures;
}

function validateReferences(state: GameState): string[] {
  const failures: string[] = [];
  const activePlayerIds = new Set(Object.keys(state.players));
  const retiredPlayerIds = new Set(Object.keys(state.retiredPlayers ?? {}));
  const youthPlayerIds = new Set(
    Object.values(state.unsignedYouth ?? {}).map((youth) => youth.player.id),
  );
  const youthOwnerByPlayerId = new Map<string, string>();
  for (const [youthId, youth] of Object.entries(state.unsignedYouth ?? {})) {
    const priorYouthId = youthOwnerByPlayerId.get(youth.player.id);
    if (priorYouthId && priorYouthId !== youthId) {
      failures.push(`duplicate-youth-player-id:${youth.player.id}:${priorYouthId}:${youthId}`);
    }
    youthOwnerByPlayerId.set(youth.player.id, youthId);
    if (
      !youth.placed
      && !youth.retired
      && (activePlayerIds.has(youth.player.id) || retiredPlayerIds.has(youth.player.id))
    ) {
      failures.push(`youth-identity-collision:${youthId}:${youth.player.id}`);
    }
  }
  const resolvablePlayerIds = new Set([
    ...activePlayerIds,
    ...retiredPlayerIds,
    ...youthPlayerIds,
  ]);

  for (const club of Object.values(state.clubs)) {
    const seniorIds = club.playerIds ?? [];
    const academyIds = club.academyPlayerIds ?? [];
    if (new Set(seniorIds).size !== seniorIds.length) failures.push(`${club.id}:duplicate-senior`);
    if (new Set(academyIds).size !== academyIds.length) failures.push(`${club.id}:duplicate-academy`);
    for (const playerId of seniorIds) {
      const player = state.players[playerId];
      if (!player) failures.push(`${club.id}:missing-senior:${playerId}`);
      else if (player.clubId !== club.id) failures.push(`${club.id}:wrong-senior:${playerId}`);
      if (academyIds.includes(playerId)) failures.push(`${club.id}:dual-roster:${playerId}`);
    }
    for (const playerId of academyIds) {
      const player = state.players[playerId];
      if (!player) failures.push(`${club.id}:missing-academy:${playerId}`);
      else if (player.clubId !== club.id) failures.push(`${club.id}:wrong-academy:${playerId}`);
    }
  }

  for (const [playerId, player] of Object.entries(state.players)) {
    for (const [label, clubId] of [
      ["registration", player.clubId],
      ["contract", player.contractClubId],
      ["loan-parent", player.loanParentClubId],
    ] as const) {
      if (clubId && !state.clubs[clubId]) failures.push(`${playerId}:missing-${label}-club:${clubId}`);
    }
  }

  const activeLoanPlayers = new Set<string>();
  for (const loan of state.activeLoans ?? []) {
    if (activeLoanPlayers.has(loan.playerId)) failures.push(`duplicate-active-loan:${loan.playerId}`);
    activeLoanPlayers.add(loan.playerId);
    if (!state.players[loan.playerId]) failures.push(`loan:${loan.id}:missing-player`);
    if (!state.clubs[loan.parentClubId]) failures.push(`loan:${loan.id}:missing-parent`);
    if (!state.clubs[loan.loanClubId]) failures.push(`loan:${loan.id}:missing-host`);
  }

  const freeAgentPlayerIds = new Set<string>();
  for (const agent of state.freeAgentPool?.agents ?? []) {
    if (freeAgentPlayerIds.has(agent.playerId)) failures.push(`duplicate-free-agent:${agent.playerId}`);
    freeAgentPlayerIds.add(agent.playerId);
    const player = state.players[agent.playerId];
    if (!player) failures.push(`free-agent:${agent.playerId}:missing-player`);
    else if (player.clubId || player.contractClubId) failures.push(`free-agent:${agent.playerId}:dual-owner`);
  }

  for (const report of Object.values(state.reports)) {
    if (!resolvablePlayerIds.has(report.playerId)) failures.push(`report:${report.id}:missing-player`);
  }
  for (const observation of Object.values(state.observations)) {
    if (!resolvablePlayerIds.has(observation.playerId)) {
      failures.push(`observation:${observation.id}:missing-player`);
    }
  }
  for (const scoutingCase of Object.values(state.scoutingCases ?? {})) {
    if (!resolvablePlayerIds.has(scoutingCase.playerId)) {
      failures.push(`case:${scoutingCase.id}:missing-player`);
    }
    for (const reportId of scoutingCase.reportIds) {
      if (!state.reports[reportId]) failures.push(`case:${scoutingCase.id}:missing-report:${reportId}`);
    }
  }
  for (const delivery of Object.values(state.reportDeliveries ?? {})) {
    if (delivery.reportId && !state.reports[delivery.reportId]) {
      failures.push(`delivery:${delivery.id}:missing-report`);
    }
    if (!state.scoutingCases[delivery.caseId]) failures.push(`delivery:${delivery.id}:missing-case`);
  }
  for (const decision of Object.values(state.clubDecisions ?? {})) {
    if (!state.reportDeliveries[decision.deliveryId]) {
      failures.push(`decision:${decision.id}:missing-delivery`);
    }
    if (!state.scoutingCases[decision.caseId]) failures.push(`decision:${decision.id}:missing-case`);
  }

  const youthSigningPlayerIds = new Set(
    (state.playerMovementHistory ?? [])
      .filter((movement) => movement.type === "youthSigning")
      .map((movement) => movement.playerId),
  );
  for (const youth of Object.values(state.unsignedYouth ?? {})) {
    if (youth.placed || youth.retired) {
      failures.push(`resolved-youth-in-active-pool:${youth.id}`);
    }
    const completedSeasons = Math.max(0, state.currentSeason - youth.generatedSeason);
    if (completedSeasons >= 4) {
      failures.push(
        `expired-youth-in-active-pool:${youth.id}:completed-seasons:${completedSeasons}`,
      );
    }
    if (youth.placed && !youthSigningPlayerIds.has(youth.player.id)) {
      failures.push(`placed-youth-without-movement:${youth.id}`);
    }
  }
  for (const placement of Object.values(state.placementReports ?? {})) {
    if (state.unsignedYouth?.[placement.unsignedYouthId]) continue;
    const playerId = resolvePlacementPlayerId(state, placement);
    if (!playerId || (!state.players?.[playerId] && !state.retiredPlayers?.[playerId])) {
      failures.push(
        `placement:${placement.id}:unresolvable-player:${playerId ?? placement.unsignedYouthId}`,
      );
    }
  }

  for (const playerId of state.retiredPlayerIds ?? []) {
    if (state.players[playerId]) failures.push(`retired:${playerId}:still-active`);
    if (!state.retiredPlayers?.[playerId]) failures.push(`retired:${playerId}:missing-archive`);
    if (freeAgentPlayerIds.has(playerId)) failures.push(`retired:${playerId}:in-free-agent-pool`);
  }

  return failures;
}

function describePlacedYouthFailures(
  state: GameState,
  references: readonly string[],
): Array<Record<string, unknown>> {
  return references
    .filter((failure) => failure.startsWith("placed-youth-without-movement:"))
    .map((failure) => {
      const youthId = failure.slice("placed-youth-without-movement:".length);
      const youth = state.unsignedYouth?.[youthId];
      const playerId = youth?.player.id;
      return {
        season: state.currentSeason,
        week: state.currentWeek,
        youthId,
        playerId,
        generatedSeason: youth?.generatedSeason,
        age: youth?.player.age,
        placed: youth?.placed,
        retired: youth?.retired,
        placedClubId: youth?.placedClubId,
        activePlayer: playerId ? state.players[playerId] : undefined,
        retiredPlayer: playerId ? state.retiredPlayers?.[playerId] : undefined,
        movements: playerId
          ? (state.playerMovementHistory ?? []).filter((movement) => movement.playerId === playerId)
          : [],
        placementReports: Object.values(state.placementReports ?? {}).filter(
          (placement) => placement.unsignedYouthId === youthId,
        ),
        rivalActivities: playerId
          ? (state.rivalActivities ?? []).filter((activity) => activity.playerId === playerId)
          : [],
        reports: playerId
          ? Object.values(state.reports ?? {}).filter((report) => report.playerId === playerId)
          : [],
        observations: playerId
          ? Object.values(state.observations ?? {}).filter(
              (observation) => observation.playerId === playerId,
            )
          : [],
        alumni: playerId
          ? (state.alumniRecords ?? []).filter((record) => record.playerId === playerId)
          : [],
        worldHistory: playerId
          ? (state.worldHistory?.seasons ?? []).flatMap((season) =>
              season.players
                .filter((player) => player.playerId === playerId)
                .map((player) => ({ season: season.season, player })),
            )
          : [],
      };
    });
}

function validateEconomy(state: GameState): string[] {
  const failures: string[] = [];
  for (const club of Object.values(state.clubs)) {
    if (club.budget < 0) failures.push(`club:${club.id}:negative-budget:${club.budget}`);
  }
  for (const player of Object.values(state.players)) {
    if (player.marketValue < 0) failures.push(`player:${player.id}:negative-value:${player.marketValue}`);
    if (player.wage < 0) failures.push(`player:${player.id}:negative-wage:${player.wage}`);
  }

  const finances = state.finances;
  if (!finances) return failures;
  const nonNegativeFields: Array<[string, number | undefined]> = [
    ["monthlyIncome", finances.monthlyIncome],
    ["reportSalesRevenue", finances.reportSalesRevenue],
    ["placementFeeRevenue", finances.placementFeeRevenue],
    ["retainerRevenue", finances.retainerRevenue],
    ["consultingRevenue", finances.consultingRevenue],
    ["sellOnRevenue", finances.sellOnRevenue],
    ["bonusRevenue", finances.bonusRevenue],
  ];
  for (const [field, value] of nonNegativeFields) {
    if (value !== undefined && value < 0) failures.push(`finances:${field}:negative:${value}`);
  }
  for (const [type, amount] of Object.entries(finances.expenses)) {
    if (amount < 0) failures.push(`finances:expense:${type}:negative:${amount}`);
  }
  const canonicalLoans = finances.activeLoan
    ? [finances.activeLoan]
    : finances.loans ?? [];
  for (const loan of canonicalLoans) {
    if (loan.principal < 0) failures.push(`loan:${loan.id}:negative-principal`);
    if (loan.remainingBalance < 0) failures.push(`loan:${loan.id}:negative-balance`);
    if (loan.remainingBalance > loan.principal * 100) failures.push(`loan:${loan.id}:runaway`);
  }
  if (Math.abs(finances.balance) > 1_000_000_000) {
    failures.push(`finances:runaway-balance:${finances.balance}`);
  }
  return failures;
}

function assertReleaseInvariants(
  state: GameState,
  initialBytes: number,
): SaveRetentionFootprint {
  const retentionFootprint = measureSaveRetentionFootprint(state);
  const bytes = retentionFootprint.totalBytes;
  const nonFinite = collectNonFiniteNumbers(state);
  const references = validateReferences(state);
  const retentionReferences = findSaveRetentionReferenceViolations(state);
  const economy = validateEconomy(state);
  const placedYouthFailures = describePlacedYouthFailures(state, references);
  if (placedYouthFailures.length > 0) {
    console.info(
      "LONG_CAREER_PLACED_YOUTH_FAILURE",
      JSON.stringify(placedYouthFailures),
    );
  }
  if (DIAGNOSTIC_ONLY) {
    if (nonFinite.length + references.length + retentionReferences.length + economy.length > 0) {
      console.info("LONG_CAREER_DIAGNOSTIC_FAILURES", {
        nonFinite,
        references,
        retentionReferences,
        economy,
      });
    }
    return retentionFootprint;
  }
  expect(nonFinite, "non-finite numeric state").toEqual([]);
  expect(references, "invalid entity references").toEqual([]);
  expect(retentionReferences, "invalid retained archive references").toEqual([]);
  expect(economy, "invalid economy state").toEqual([]);
  expect(bytes, "serialized save exceeds absolute release budget").toBeLessThanOrEqual(
    MAX_SERIALIZED_BYTES,
  );
  expect(bytes, "serialized save growth exceeds release multiplier").toBeLessThanOrEqual(
    initialBytes * MAX_GROWTH_MULTIPLIER,
  );
  if (retentionFootprint.collections.players > COLLECTION_BYTE_BUDGETS.players) {
    console.info(
      "LONG_CAREER_PLAYER_RETENTION_FAILURE",
      JSON.stringify(playerRetentionDiagnostic(state)),
    );
  }
  for (const key of SAVE_RETENTION_COLLECTION_KEYS) {
    expect(
      retentionFootprint.collections[key],
      `${key} exceeds its long-save collection budget`,
    ).toBeLessThanOrEqual(COLLECTION_BYTE_BUDGETS[key]);
  }
  return retentionFootprint;
}

function assertAutonomousCareerHealth(
  seed: string,
  snapshots: readonly AutonomousWorldHealthSnapshot[],
  telemetry: AutonomousCareerTelemetry,
): void {
  const final = snapshots.at(-1);
  if (!final) return;
  const maxBacklog = Math.max(...snapshots.map((snapshot) => snapshot.unresolvedActionBacklog));
  const maxFreeAgentRatio = Math.max(...snapshots.map((snapshot) => snapshot.freeAgentRatio));
  const maxActiveLoanRatio = Math.max(...snapshots.map((snapshot) => snapshot.activeLoanRatio));
  const acceptedMarketplaceDecisions = (
    telemetry.acceptedMarketplaceBids + telemetry.acceptedExclusiveUpgradeBids
  );

  if (DIAGNOSTIC_ONLY) {
    const failures: string[] = [];
    if (final.reports <= 0) failures.push("reports");
    if (final.observations <= 0) failures.push("observations");
    if (telemetry.authoredReports <= 0) failures.push("authoredReports");
    if (telemetry.meaningfulDecisions <= 0) failures.push("meaningfulDecisions");
    if (maxBacklog > 36) failures.push(`backlog:${maxBacklog}`);
    if (maxFreeAgentRatio > 0.35) failures.push(`freeAgentRatio:${maxFreeAgentRatio}`);
    if (maxActiveLoanRatio > 0.2) failures.push(`activeLoanRatio:${maxActiveLoanRatio}`);
    if (acceptedMarketplaceDecisions <= 0) failures.push("marketplaceDecisions");
    if (!final.careerPathChosen) failures.push("careerPathChosen");
    if (final.careerTier < 2) failures.push(`careerTier:${final.careerTier}`);
    if (final.completedCourses <= 0) failures.push("completedCourses");
    if (failures.length > 0) {
      console.info("LONG_CAREER_AUTONOMOUS_HEALTH_FAILURE", {
        seed,
        failures,
        telemetry,
        final,
      });
    }
    return;
  }

  expect(final.reports, `seed ${seed} produced no reports`).toBeGreaterThan(0);
  expect(final.observations, `seed ${seed} produced no observations`).toBeGreaterThan(0);
  expect(telemetry.authoredReports, `seed ${seed} never authored a report via store actions`).toBeGreaterThan(0);
  expect(telemetry.meaningfulDecisions, `seed ${seed} never resolved a meaningful decision`).toBeGreaterThan(0);
  expect(maxBacklog, `seed ${seed} accumulated an unsafe unresolved-action backlog`).toBeLessThanOrEqual(36);
  expect(maxFreeAgentRatio, `seed ${seed} overgrew the free-agent availability ratio`).toBeLessThanOrEqual(0.35);
  expect(maxActiveLoanRatio, `seed ${seed} overgrew the active-loan ratio`).toBeLessThanOrEqual(0.2);
  if (snapshots.length >= 5) {
    expect(
      snapshots.some((snapshot) => snapshot.freeAgents > 0),
      `seed ${seed} never developed a visible free-agent pool`,
    ).toBe(true);
    expect(
      snapshots.some((snapshot) => snapshot.activeLoans > 0),
      `seed ${seed} never developed active loans`,
    ).toBe(true);
  }
  expect(
    acceptedMarketplaceDecisions,
    `seed ${seed} never accepted an organically generated marketplace bid`,
  ).toBeGreaterThan(0);
  expect(final.careerPathChosen, `seed ${seed} never committed to a career path`).toBe(true);
  expect(final.careerPath, `seed ${seed} diverged from the independent commercial path`).toBe("independent");
  expect(final.careerTier, `seed ${seed} did not progress beyond the opening tier gates`).toBeGreaterThanOrEqual(2);
  expect(final.completedCourses, `seed ${seed} never completed a course`).toBeGreaterThan(0);
}

async function simulateCareer(
  seed: string,
  seasonCount: number,
): Promise<RunEvidence> {
  const { useGameStore } = await import("@/stores/gameStore");
  await useGameStore.getState().startNewGame({
    scoutFirstName: "Release",
    scoutLastName: "Soak",
    scoutAge: 24,
    specialization: "youth",
    difficulty: "normal",
    worldSeed: seed,
    selectedCountries: ["england"],
    startingCountry: "england",
    nationality: "English",
    skillAllocations: {
      technicalEye: 2,
      psychologicalRead: 2,
      playerJudgment: 2,
      potentialAssessment: 2,
    },
    openingMode: "desk",
    originId: "academy-apprentice",
    flawId: "fragile-network",
    doctrineIds: ["evidence-first"],
  });

  const initial = useGameStore.getState().gameState;
  if (!initial) throw new Error(`Failed to initialize release soak seed ${seed}`);
  const initialBytes = serializedBytes(initial);
  requestGarbageCollection();
  const initialMemory = collectMemorySample(initial.currentSeason);
  const memorySamples: MemorySample[] = [initialMemory];
  let peakHeapUsedBytes = initialMemory.heapUsedBytes;
  let peakRssBytes = initialMemory.rssBytes;
  let peakBytes = initialBytes;
  let canonicalTicks = 0;
  let calendarWeeksSpanned = 0;
  let lastCheckedSeason = initial.currentSeason;
  let lastBoundaryBytes = initialBytes;
  const weeklyLatency: number[] = [];
  const compactionSamples: SaveRetentionCompactionSample[] = [];
  const pendingCompactionSamples: SaveRetentionCompactionSample[] = [];
  let latestWeeklyTelemetry: WeeklySimulationTelemetry | undefined;
  const seasonGrowth: RunEvidence["seasonGrowth"] = [];
  const worldHealth: RunEvidence["worldHealth"] = [];
  const careerTelemetry = createAutonomousCareerTelemetry();
  const stopObservingCompaction = observeSaveRetentionCompaction((sample) => {
    compactionSamples.push(sample);
    pendingCompactionSamples.push(sample);
  });
  const stopObservingWeeklyTelemetry = observeWeeklySimulationTelemetry((sample) => {
    latestWeeklyTelemetry = sample;
  });

  while ((useGameStore.getState().gameState?.currentSeason ?? 0) <= seasonCount) {
    const before = useGameStore.getState().gameState;
    if (!before) throw new Error(`Seed ${seed} lost game state`);
    const started = performance.now();
    await driveAutonomousYouthCareerWeek(careerTelemetry);
    const elapsed = performance.now() - started;
    // The real UI yields after every command. Without this yield, mocked
    // checkpoint/autosave promises retain every prior serialized state and the
    // soak measures its own synchronous harness rather than game heap.
    await flushAsyncPersistenceQueue();
    const after = useGameStore.getState().gameState;
    const advanced = Boolean(
      after && (
        after.currentSeason !== before.currentSeason
        || after.currentWeek !== before.currentWeek
      ),
    );
    if (!after || !advanced) {
      throw new Error(
        `Seed ${seed} stalled at S${before.currentSeason} W${before.currentWeek}`,
      );
    }
    canonicalTicks++;
    calendarWeeksSpanned += 1;
    weeklyLatency.push(elapsed);
    const phaseBreakdown = latestWeeklyTelemetry
      && latestWeeklyTelemetry.sourceSeason === before.currentSeason
      && latestWeeklyTelemetry.sourceWeek === before.currentWeek
      ? latestWeeklyTelemetry.phases
        .map((phase) => `${phase.phase}=${phase.elapsedMs.toFixed(1)}ms`)
        .join(", ")
      : "unavailable";
    expect(
      elapsed,
      `seed ${seed} batch latency indicates a hang at S${before.currentSeason} W${before.currentWeek}; phases: ${phaseBreakdown}`,
    ).toBeLessThan(MAX_SINGLE_BATCH_MS);

    if (after.currentSeason !== lastCheckedSeason) {
      stabilizeAutonomousCareerState(careerTelemetry);
      const stabilized = useGameStore.getState().gameState;
      if (!stabilized) throw new Error(`Seed ${seed} lost stabilized state at season boundary`);
      const footprint = assertReleaseInvariants(stabilized, initialBytes);
      worldHealth.push(collectAutonomousWorldHealth(stabilized, careerTelemetry));
      expect(
        serializedRoundTripDigest(stabilized),
        `seed ${seed} changed during the season ${stabilized.currentSeason} save round trip`,
      ).toBe(deterministicDigest(stabilized));
      expect(
        Object.keys(stabilized.players).length,
        `seed ${seed} exhausted the active player pool`,
      ).toBeGreaterThan(0);
      expect(
        Object.keys(stabilized.unsignedYouth ?? {}).length,
        `seed ${seed} exhausted the unsigned youth pool`,
      ).toBeGreaterThan(0);
      const bytes = footprint.totalBytes;
      const boundaryCompactions = pendingCompactionSamples.splice(
        0,
        pendingCompactionSamples.length,
      );
      seasonGrowth.push({
        season: after.currentSeason,
        serializedBytes: bytes,
        growthBytes: bytes - lastBoundaryBytes,
        compactionRemovedBytes: boundaryCompactions.reduce(
          (sum, sample) => sum + sample.removedBytes,
          0,
        ),
        compactionEvents: boundaryCompactions.length,
        collectionBytes: footprint.collections,
        collectionCompactionDeltas: sumCompactionDeltas(boundaryCompactions),
      });
      lastBoundaryBytes = bytes;
      peakBytes = Math.max(peakBytes, bytes);
      lastCheckedSeason = stabilized.currentSeason;
      const beforeCollection = collectMemorySample(stabilized.currentSeason);
      peakHeapUsedBytes = Math.max(peakHeapUsedBytes, beforeCollection.heapUsedBytes);
      peakRssBytes = Math.max(peakRssBytes, beforeCollection.rssBytes);
      requestGarbageCollection();
      const afterCollection = collectMemorySample(stabilized.currentSeason);
      peakHeapUsedBytes = Math.max(peakHeapUsedBytes, afterCollection.heapUsedBytes);
      peakRssBytes = Math.max(peakRssBytes, afterCollection.rssBytes);
      memorySamples.push(afterCollection);

    }
  }
  stopObservingCompaction();
  stopObservingWeeklyTelemetry();

  const finalState = useGameStore.getState().gameState;
  if (!finalState) throw new Error(`Seed ${seed} lost its final state`);
  stabilizeAutonomousCareerState(careerTelemetry);
  const stabilizedFinalState = useGameStore.getState().gameState;
  if (!stabilizedFinalState) throw new Error(`Seed ${seed} lost its stabilized final state`);
  const finalBytes = assertReleaseInvariants(stabilizedFinalState, initialBytes).totalBytes;
  peakBytes = Math.max(peakBytes, finalBytes);
  const history = stabilizedFinalState.worldHistory;
  expect(history, `seed ${seed} has no world history after ${seasonCount} seasons`).toBeDefined();
  expect(history?.latestRecordedSeason).toBe(seasonCount);
  expect(history?.seasons).toHaveLength(
    Math.min(seasonCount, WORLD_HISTORY_MAX_SEASONS),
  );
  expect(history?.seasons.map((season) => season.season)).toEqual(
    Array.from(
      { length: Math.min(seasonCount, WORLD_HISTORY_MAX_SEASONS) },
      (_, index) => seasonCount - Math.min(seasonCount, WORLD_HISTORY_MAX_SEASONS) + index + 1,
    ),
  );
  assertAutonomousCareerHealth(seed, worldHealth, careerTelemetry);
  const finalDigest = deterministicDigest(stabilizedFinalState);
  expect(
    serializedRoundTripDigest(stabilizedFinalState),
    `seed ${seed} changed during JSON save round trip`,
  ).toBe(finalDigest);
  const beforeFinalCollection = collectMemorySample(stabilizedFinalState.currentSeason);
  peakHeapUsedBytes = Math.max(peakHeapUsedBytes, beforeFinalCollection.heapUsedBytes);
  peakRssBytes = Math.max(peakRssBytes, beforeFinalCollection.rssBytes);
  requestGarbageCollection();
  const finalMemory = collectMemorySample(stabilizedFinalState.currentSeason);
  peakHeapUsedBytes = Math.max(peakHeapUsedBytes, finalMemory.heapUsedBytes);
  peakRssBytes = Math.max(peakRssBytes, finalMemory.rssBytes);
  expect(peakHeapUsedBytes, `seed ${seed} exceeded the heap release budget`).toBeLessThanOrEqual(
    MAX_HEAP_USED_BYTES,
  );
  expect(peakRssBytes, `seed ${seed} exceeded the RSS release budget`).toBeLessThanOrEqual(
    MAX_RSS_BYTES,
  );
  expect(
    finalMemory.heapUsedBytes - initialMemory.heapUsedBytes,
    `seed ${seed} retained excessive heap across the career`,
  ).toBeLessThanOrEqual(MAX_POST_GC_HEAP_GROWTH_BYTES);

  return {
    seed,
    reachedSeason: finalState.currentSeason,
    canonicalTicks,
    calendarWeeksSpanned,
    initialBytes,
    finalBytes,
    peakBytes,
    finalToInitialRatio: round(finalBytes / initialBytes),
    worldHistorySeasons: history?.seasons.length ?? 0,
    worldHistoryBytes: Buffer.byteLength(JSON.stringify(history), "utf8"),
    largestCollections: largestCollections(finalState),
    seasonGrowth,
    compaction: {
      events: compactionSamples.length,
      seasonsWithReduction: new Set(
        compactionSamples
          .filter((sample) => sample.removedBytes > 0)
          .map((sample) => sample.season),
      ).size,
      totalRemovedBytes: compactionSamples.reduce(
        (sum, sample) => sum + sample.removedBytes,
        0,
      ),
      collectionDeltas: sumCompactionDeltas(compactionSamples),
    },
    memory: {
      initial: initialMemory,
      final: finalMemory,
      peakHeapUsedBytes,
      peakRssBytes,
      samples: memorySamples,
    },
    weeklyLatencyMs: {
      p50: round(percentile(weeklyLatency, 0.5)),
      p95: round(percentile(weeklyLatency, 0.95)),
      max: round(Math.max(...weeklyLatency)),
      mean: round(weeklyLatency.reduce((sum, value) => sum + value, 0) / weeklyLatency.length),
    },
    worldHealth,
    careerTelemetry,
    digest: finalDigest,
  };
}

describe("full canonical-week release soak", () => {
  it("keeps seeded careers coherent, bounded, serializable, and deterministic", async () => {
    expect(RELEASE_SEED_COUNT).toBeGreaterThan(0);
    expect(RELEASE_SEASON_COUNT).toBeGreaterThan(0);
    const seeds = Array.from(
      { length: RELEASE_SEED_COUNT },
      (_, index) => `release-soak-${String(index + RELEASE_SEED_START).padStart(2, "0")}`,
    );
    const runs: RunEvidence[] = [];
    for (const seed of seeds) runs.push(await simulateCareer(seed, RELEASE_SEASON_COUNT));

    const persistenceReplay = DIAGNOSTIC_ONLY || WORKER_MODE
      ? runs[0]
      : await simulateCareer(seeds[0], RELEASE_SEASON_COUNT);
    if (!DIAGNOSTIC_ONLY && !WORKER_MODE) {
      expect(persistenceReplay.digest, "same seed changed deterministic outcome").toBe(runs[0].digest);
    }

    const summary = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      profile: {
        kind: "full-canonical-weekly-career",
        authoritativeTicksPerSeason: "calendar-dependent",
        skippedOrdinaryWeeks: false,
        seedCount: RELEASE_SEED_COUNT,
        seasonCount: RELEASE_SEASON_COUNT,
        deterministicReplaySeed: seeds[0],
        maxSerializedBytes: MAX_SERIALIZED_BYTES,
        maxGrowthMultiplier: MAX_GROWTH_MULTIPLIER,
        maxHeapUsedBytes: MAX_HEAP_USED_BYTES,
        maxRssBytes: MAX_RSS_BYTES,
        maxPostGcHeapGrowthBytes: MAX_POST_GC_HEAP_GROWTH_BYTES,
        collectionByteBudgets: COLLECTION_BYTE_BUDGETS,
      },
      aggregate: {
        totalCanonicalTicks: runs.reduce((sum, run) => sum + run.canonicalTicks, 0),
        totalCalendarWeeksSpanned: runs.reduce((sum, run) => sum + run.calendarWeeksSpanned, 0),
        largestSaveBytes: Math.max(...runs.map((run) => run.peakBytes)),
        largestFinalToInitialRatio: Math.max(...runs.map((run) => run.finalToInitialRatio)),
        peakHeapUsedBytes: Math.max(...runs.map((run) => run.memory.peakHeapUsedBytes)),
        peakRssBytes: Math.max(...runs.map((run) => run.memory.peakRssBytes)),
        largestSingleSeasonGrowthBytes: Math.max(
          ...runs.flatMap((run) => run.seasonGrowth.map((sample) => sample.growthBytes)),
        ),
        totalCompactionRemovedBytes: runs.reduce(
          (sum, run) => sum + run.compaction.totalRemovedBytes,
          0,
        ),
        totalMeaningfulDecisions: runs.reduce(
          (sum, run) => sum + run.careerTelemetry.meaningfulDecisions,
          0,
        ),
        maxUnresolvedActionBacklog: Math.max(
          ...runs.flatMap((run) => run.worldHealth.map((snapshot) => snapshot.unresolvedActionBacklog)),
        ),
        maxFreeAgentRatio: round(Math.max(
          ...runs.flatMap((run) => run.worldHealth.map((snapshot) => snapshot.freeAgentRatio)),
        ), 3),
        maxActiveLoanRatio: round(Math.max(
          ...runs.flatMap((run) => run.worldHealth.map((snapshot) => snapshot.activeLoanRatio)),
        ), 3),
        seedsWithCareerPathChoice: runs.filter(
          (run) => run.worldHealth.at(-1)?.careerPathChosen,
        ).length,
        seedsWithCompletedCourses: runs.filter(
          (run) => (run.worldHealth.at(-1)?.completedCourses ?? 0) > 0,
        ).length,
        compactionCollectionDeltas: Object.fromEntries(
          SAVE_RETENTION_COLLECTION_KEYS.map((key) => [
            key,
            runs.reduce((sum, run) => sum + run.compaction.collectionDeltas[key], 0),
          ]),
        ),
        weeklyLatencyMs: {
          p50: round(percentile(runs.map((run) => run.weeklyLatencyMs.p50), 0.5)),
          p95: round(percentile(runs.map((run) => run.weeklyLatencyMs.p95), 0.95)),
          max: round(Math.max(...runs.map((run) => run.weeklyLatencyMs.max))),
        },
      },
      runs,
      persistenceReplay,
    };

    await mkdir(dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    console.info(`LONG_CAREER_RELEASE_GATE ${JSON.stringify(summary.aggregate)}`);
  });
});
