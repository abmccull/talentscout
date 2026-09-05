import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect } from "vitest";
import type { GameState, RecommendationReview, ScoutReport } from "@/engine/core/types";
import { getAvailableActivities, getScheduledActivityInstances } from "@/engine/core/calendar";
import { getSeasonLength } from "@/engine/core/gameDate";
import {
  SCOUTING_QUESTIONS, buildSessionEvidenceCards, getEvidenceClaimOptions,
  getEvidenceNextTestOptions, getEvidenceUnknownOptions,
} from "@/engine/scout/evidenceModel";
import { getLatestReportInScope } from "@/engine/reports/reportAccountability";
import { useGameStore } from "@/stores/gameStore";
import { resolvePlayerEntity } from "@/lib/playerResolution";
import {
  chooseAutonomousPlacementDestination, createAutonomousCareerTelemetry,
  driveAutonomousYouthCareerWeek,
} from "./autonomousYouthCareerDriver";

type Clock = { season: number; week: number };
const clock = (state: GameState): Clock => ({ season: state.currentSeason, week: state.currentWeek });
const order = (a: Clock, b: Clock) => a.season - b.season || a.week - b.week;
const stateNow = (): GameState => {
  const state = useGameStore.getState().gameState;
  if (!state) throw new Error("Youth consequence scenario lost its career");
  return state;
};
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value) ?? "undefined").digest("hex");

function sourceIdentity() {
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const paths = git("ls-files", "--cached", "--others", "--exclude-standard", "-z", "src", "tests", "scripts", "package.json", "package-lock.json", "vitest*", "tsconfig.json")
    .split("\0").filter(Boolean).sort();
  const files = paths.map((path) => ({ path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") }));
  return { commit: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}"),
    worktreeStatus: git("status", "--porcelain"), files, fingerprint: digest(files) };
}

// Validation results and deliveries may be added later. These are the authored
// judgment and its immutable evidence, which later feedback must not rewrite.
function filedJudgment(report: ScoutReport) {
  return copy({ id: report.id, playerId: report.playerId, scoutId: report.scoutId,
    submittedWeek: report.submittedWeek, submittedSeason: report.submittedSeason, summary: report.summary,
    conviction: report.conviction, recommendedAction: report.recommendedAction,
    decisionReceipt: report.decisionReceipt, evidenceObservationIds: report.evidenceObservationIds,
    evidenceAssessment: report.evidenceAssessment, categoryVerdicts: report.categoryVerdicts,
    intendedClubId: report.intendedClubId, strengths: report.strengths, weaknesses: report.weaknesses });
}

interface Attempt {
  playerId: string;
  destinationClubId: string;
  scheduledAt: Clock;
  report: ReturnType<typeof filedJudgment>;
  evidenceHashes: Record<string, string>;
  placementIds: string[];
  history: Array<{ at: Clock; responses: Array<{ id: string; response: string | undefined }> }>;
  canonicalSigning?: unknown;
}

function reportEvidenceHashes(state: GameState, report: ScoutReport): Record<string, string> {
  expect(report.evidenceObservationIds?.length, "A scenario judgment needs earned observation evidence").toBeGreaterThan(0);
  return Object.fromEntries((report.evidenceObservationIds ?? []).map((id) => {
    expect(state.observations[id], `Missing filed evidence ${id}`).toBeDefined();
    return [id, digest(state.observations[id])];
  }));
}

function assertPreserved(state: GameState, report: ReturnType<typeof filedJudgment>, hashes: Record<string, string>) {
  expect(state.reports[report.id], "The original filed judgment disappeared").toBeDefined();
  expect(filedJudgment(state.reports[report.id])).toEqual(report);
  for (const [id, hash] of Object.entries(hashes)) expect(digest(state.observations[id]), `Evidence ${id} changed`).toBe(hash);
}

function finishOpeningAndPass() {
  const store = useGameStore.getState();
  const opening = stateNow().openingCase!;
  const setup = store.activeSession;
  expect(setup?.state).toBe("setup");
  const question = SCOUTING_QUESTIONS.find((entry) => entry.id === setup!.scoutingQuestionId)!;
  store.beginSession();
  for (let step = 0; step < setup!.phases.length; step += 1) {
    let session = useGameStore.getState().activeSession!;
    const phase = session.phases[session.currentPhaseIndex];
    if (phase.isHalfTime) store.setSessionHalftimeApproach("challenge");
    if (!session.players.find((entry) => entry.playerId === opening.playerId)?.isFocused) {
      store.allocateSessionFocus(opening.playerId, question.lens);
    }
    session = useGameStore.getState().activeSession!;
    const moment = phase.moments.find((entry) => entry.playerId === opening.playerId)!;
    const cue = session.cueReadings?.find((entry) => entry.momentId === moment.id);
    store.flagSessionMoment(moment.id, cue?.direction === "positive" ? "promising"
      : cue?.direction === "negative" ? "concerning" : "needs_more_data");
    store.advanceSessionPhase();
  }
  const reflection = useGameStore.getState().activeSession!;
  expect(reflection.state).toBe("reflection");
  for (const card of buildSessionEvidenceCards(reflection)) store.classifySessionEvidence(card.id, card.classification);
  store.endObservationSession();
  expect(useGameStore.getState().activeSession).toBeNull();
  const cards = Object.values(stateNow().reflectionJournal).flatMap((entry) => entry.evidenceCards ?? [])
    .filter((card) => card.playerId === opening.playerId);
  const card = cards[0];
  expect(card).toBeDefined();
  const unknown = getEvidenceUnknownOptions(card)[0];
  store.resolveOpeningDiscoveryChoice("protect");
  const before = stateNow();
  const beforeMoney = copy(before.finances);
  const beforeScout = copy(before.scout);
  store.submitReport("note", "", [], [], undefined, {
    evidenceCardId: card.id, claimOptionId: getEvidenceClaimOptions(card)[0].id,
    unknownOptionId: unknown.id, nextTestId: getEvidenceNextTestOptions(unknown)[0].id,
    confidence: "tentative", recommendation: "pass",
  });
  const after = stateNow();
  const report = Object.values(after.reports).find((entry) => entry.playerId === opening.playerId)!;
  expect(report?.recommendedAction).toBe("pass");
  expect(report.decisionReceipt?.action).toBe("pass");
  expect(after.finances).toEqual(beforeMoney);
  expect(after.scout).toEqual(beforeScout);
  expect(after.schedule).toEqual(before.schedule);
  expect(Object.values(after.placementReports)).toHaveLength(0);
  expect(useGameStore.getState().pendingListingReportId).toBeNull();
  // Repeat the same action; no new receipt, review or reward can appear.
  const immutable = filedJudgment(report);
  const count = Object.keys(after.reports).length;
  store.submitReport("note", "Duplicate pass", [], []);
  expect(Object.keys(stateNow().reports)).toHaveLength(count);
  expect(filedJudgment(stateNow().reports[report.id])).toEqual(immutable);
  const reviews = Object.values(after.recommendationReviews).filter((review) => review.reportId === report.id);
  expect(reviews.map((review) => review.checkpoint).sort()).toEqual(["oneSeason", "twoSeasons"]);
  expect(reviews.every((review) => review.status === "scheduled" && review.decisionKind === "pass")).toBe(true);
  return { report: immutable, evidenceHashes: reportEvidenceHashes(after, report), reviewIds: reviews.map((review) => review.id) };
}

/** One ordinary career, at most three visible eligible pitches; acceptance is never forced. */
export async function runYouthConsequenceScenario(seed: string, outputPath: string): Promise<void> {
  const output = resolve(outputPath);
  if (existsSync(output)) throw new Error(`Refusing to overwrite earlier consequence evidence: ${output}`);
  const source = sourceIdentity();
  const attempts: Attempt[] = [];
  const snapshots: unknown[] = [];
  const completed = new Map<string, RecommendationReview>();
  const reviewMessageReceipts = new Map<string, { receivedAt: Clock; message: GameState["inbox"][number] }>();
  const archivedReviewMessages = new Set<string>();
  const telemetry = createAutonomousCareerTelemetry("cautious");
  let pass: ReturnType<typeof finishOpeningAndPass> | undefined;
  let error: string | undefined;
  let sourceAfter: ReturnType<typeof sourceIdentity> | undefined;
  let replayChecked = false;
  let ticks = 0;
  const checkReviews = () => {
    const state = stateNow();
    const relevant = Object.values(state.recommendationReviews).filter((review) => pass?.reviewIds.includes(review.id)
      || attempts.some((attempt) => attempt.report.id === review.reportId && review.origin !== "decision"));
    for (const review of relevant) {
      const due = { season: review.dueSeason, week: review.dueWeek };
      if (order(clock(state), due) < 0) expect(review.status, `${review.id} completed early`).toBe("scheduled");
      if (review.status !== "complete") continue;
      expect(order({ season: review.completedSeason!, week: review.completedWeek! }, due)).toBeGreaterThanOrEqual(0);
      const preserved = completed.get(review.id);
      if (preserved) expect(review).toEqual(preserved);
      else completed.set(review.id, copy(review));
      const messages = state.inbox.filter((message) => message.id === `recommendation-review-${review.id}`);
      const receipt = reviewMessageReceipts.get(review.id);
      if (!receipt) {
        expect(messages, "A completed review must deliver its feedback once").toHaveLength(1);
        reviewMessageReceipts.set(review.id, { receivedAt: clock(state), message: copy(messages[0]) });
      } else {
        // The real inbox retains 200 messages. Preserve delivery evidence here
        // rather than require a year-old notification to remain in the inbox.
        expect(messages.length).toBeLessThanOrEqual(1);
        if (messages.length === 0) archivedReviewMessages.add(review.id);
        else {
          expect(archivedReviewMessages.has(review.id), "Archived review feedback was delivered again").toBe(false);
          expect({ ...messages[0], read: receipt.message.read }).toEqual(receipt.message);
        }
      }
      if (review.decisionKind === "pass") {
        expect(review.overallScore).toBeUndefined();
        expect(review.categoryScores).toBeUndefined();
        expect(review.confidenceCalibration).toBeUndefined();
      }
      for (const evidence of review.evidence ?? []) {
        if (evidence.source === "movement") {
          const movement = state.playerMovementHistory.find((entry) => entry.id === evidence.sourceId);
          expect(movement, `Unresolvable review movement ${evidence.sourceId}`).toBeDefined();
          expect(movement!.playerId).toBe(review.playerId);
          expect(order(movement!, due)).toBeLessThanOrEqual(0);
        } else if (evidence.source === "seasonRating") {
          const season = Number(evidence.sourceId?.match(/_s(\d+)$/)?.[1]);
          expect(season).toBeLessThan(review.dueSeason);
          expect(resolvePlayerEntity(state, review.playerId)?.player.seasonRatings?.some((rating) => rating.season === season)).toBe(true);
        } else if (evidence.source === "injury") {
          const injury = resolvePlayerEntity(state, review.playerId)?.player.injuryHistory?.injuries
            .find((entry) => entry.id === evidence.sourceId);
          expect(injury, `Unresolvable review injury ${evidence.sourceId}`).toBeDefined();
          expect(order({ week: injury!.occurredWeek, season: injury!.occurredSeason }, due)).toBeLessThanOrEqual(0);
        }
      }
    }
    return relevant;
  };
  const collect = () => {
    const state = stateNow();
    if (pass) assertPreserved(state, pass.report, pass.evidenceHashes);
    for (const attempt of attempts) {
      assertPreserved(state, attempt.report, attempt.evidenceHashes);
      const placements = Object.values(state.placementReports).filter((entry) => entry.reportId === attempt.report.id
        && entry.targetClubId === attempt.destinationClubId);
      attempt.placementIds = placements.map((entry) => entry.id);
      const responses = placements.map((entry) => ({ id: entry.id, response: entry.clubResponse }));
      if (digest(attempt.history.at(-1)?.responses) !== digest(responses)) attempt.history.push({ at: clock(state), responses });
      for (const placement of placements) {
        expect(placement.deliveryId).toBeTruthy();
        expect(state.reportDeliveries[placement.deliveryId!]).toBeDefined();
        if (placement.clubResponse !== "accepted" || attempt.canonicalSigning) continue;
        expect(attempt.history.some((entry) => entry.responses.some((response) => response.response === "pending"))).toBe(true);
        expect(placement.decisionId).toBeTruthy();
        const decision = state.clubDecisions[placement.decisionId!];
        expect(decision).toBeDefined();
        const movement = state.playerMovementHistory.find((entry) => entry.playerId === attempt.playerId
          && entry.type === "youthSigning" && entry.toClubId === attempt.destinationClubId
          && order(entry, attempt.scheduledAt) >= 0);
        expect(movement, "Accepted pitch has no canonical signing").toBeDefined();
        const player = state.players[attempt.playerId];
        expect(player?.contractClubId).toBe(attempt.destinationClubId);
        expect(player.contractExpiry).toBeGreaterThanOrEqual(state.currentSeason);
        const club = state.clubs[attempt.destinationClubId];
        expect([...club.playerIds, ...(club.academyPlayerIds ?? [])]).toContain(attempt.playerId);
        expect(Object.values(state.unsignedYouth).some((youth) => youth.player.id === attempt.playerId)).toBe(false);
        const alumni = state.alumniRecords.filter((entry) => entry.placementReportId === placement.id);
        expect(alumni).toHaveLength(1);
        expect(state.scoutingCases[placement.caseId!]?.status).toBe("placed");
        const reviews = Object.values(state.recommendationReviews).filter((review) => review.reportId === attempt.report.id && review.origin !== "decision");
        expect(reviews.map((review) => review.checkpoint).sort()).toEqual(["oneSeason", "twoSeasons"]);
        attempt.canonicalSigning = copy({ placement, decision, movement, alumni: alumni[0],
          contract: { clubId: player.contractClubId, expires: player.contractExpiry }, reviews });
      }
    }
    const reviews = checkReviews();
    snapshots.push({ at: clock(state), ticks, reports: Object.keys(state.reports).length,
      placements: Object.values(state.placementReports).map((entry) => ({ id: entry.id, response: entry.clubResponse })),
      reviews: reviews.map((review) => ({ id: review.id, status: review.status, dueSeason: review.dueSeason, dueWeek: review.dueWeek })),
      balance: state.finances?.balance, reputation: state.scout.reputation, tier: state.scout.careerTier });
    return reviews;
  };
  try {
    await useGameStore.getState().startNewGame({
      scoutFirstName: "Consequence", scoutLastName: "Scout", scoutAge: 24, specialization: "youth",
      difficulty: "normal", worldSeed: seed, selectedCountries: ["england"], startingCountry: "england", nationality: "English",
      skillAllocations: { technicalEye: 2, psychologicalRead: 2, playerJudgment: 2, potentialAssessment: 2 },
      originId: "academy-apprentice", flawId: "fragile-network", doctrineIds: ["evidence-first"], openingMode: "tutorial",
    });
    pass = finishOpeningAndPass();
    collect();
    const seasonLength = getSeasonLength(stateNow().fixtures, stateNow().currentSeason);
    const maxPreparationWeeks = 26;
    const maxTicks = maxPreparationWeeks + seasonLength * 2 + 4;
    let finishedAtTick: number | undefined;
    while (ticks < maxTicks) {
      await driveAutonomousYouthCareerWeek(telemetry, { afterSchedule: () => {
        const store = useGameStore.getState();
        // The scenario owns a bounded pitch policy; ordinary profile runs do
        // not use this callback. All other work, costs and weekly systems run.
        for (const { activity, dayIndex } of getScheduledActivityInstances(stateNow().schedule)) {
          if (activity.type === "writePlacementReport") store.unscheduleActivity(dayIndex);
        }
        if (attempts.length >= 3 || ticks >= maxPreparationWeeks || attempts.some((entry) => entry.canonicalSigning)) return;
        const state = stateNow();
        const offered = getAvailableActivities(state.scout, state.currentWeek, Object.values(state.fixtures), Object.values(state.contacts),
          state.subRegions, state.observations, state.unsignedYouth, state.players, undefined, state.youthTournaments,
          state.reports, { currentSeason: state.currentSeason, consequenceState: state.consequenceState })
          .find((activity) => activity.type === "writePlacementReport");
        const target = offered?.targetPool?.find((candidate) => candidate.id !== pass!.report.playerId
          && !attempts.some((attempt) => attempt.playerId === candidate.id)
          && (candidate.observations ?? 0) >= 3 && chooseAutonomousPlacementDestination(state, candidate.id));
        if (!offered || !target) return;
        const destinationClubId = chooseAutonomousPlacementDestination(state, target.id)!;
        const report = getLatestReportInScope(Object.values(state.reports), state.scout.id, target.id)!;
        let dayIndex = state.schedule.activities.findIndex((entry) => entry === null);
        if (dayIndex < 0) {
          // Choosing a pitch costs the final scheduled activity; use the public
          // unschedule action so a multi-day instance cannot be split.
          dayIndex = getScheduledActivityInstances(state.schedule).at(-1)!.dayIndex;
          store.unscheduleActivity(dayIndex);
        }
        store.scheduleActivity({ ...offered, targetPool: undefined, targetId: target.id, destinationClubId }, dayIndex);
        const booked = stateNow().schedule.activities[dayIndex];
        expect(booked).toMatchObject({ type: "writePlacementReport", targetId: target.id, destinationClubId });
        expect(report.decisionReceipt).toBeDefined();
        attempts.push({ playerId: target.id, destinationClubId, scheduledAt: clock(state),
          report: filedJudgment(report), evidenceHashes: reportEvidenceHashes(state, report), placementIds: [], history: [] });
      } });
      ticks += 1;
      const reviews = collect();
      const signed = attempts.filter((attempt) => attempt.canonicalSigning);
      const required = reviews.filter((review) => pass!.reviewIds.includes(review.id)
        || signed.some((attempt) => attempt.report.id === review.reportId));
      const allDueAndComplete = signed.length > 0 && required.length === 2 + signed.length * 2
        && required.every((review) => review.status === "complete");
      if (allDueAndComplete && finishedAtTick === undefined) finishedAtTick = ticks;
      if (finishedAtTick !== undefined && ticks > finishedAtTick) { replayChecked = true; break; }
    }
    expect(attempts.length, "No legal observable candidate produced a pitch within 26 ordinary weeks").toBeGreaterThan(0);
    expect(attempts.some((attempt) => attempt.canonicalSigning), "No club accepted the bounded eligible attempts; coverage is partial, not fabricated").toBe(true);
    expect(replayChecked, "Both review horizons and a later idempotence week must execute").toBe(true);
    const serialized = JSON.parse(JSON.stringify(stateNow())) as GameState;
    assertPreserved(serialized, pass.report, pass.evidenceHashes);
    for (const attempt of attempts) assertPreserved(serialized, attempt.report, attempt.evidenceHashes);
    for (const review of completed.values()) expect(serialized.recommendationReviews[review.id]).toEqual(review);
  } catch (cause) {
    error = cause instanceof Error ? cause.stack ?? cause.message : String(cause);
    throw cause;
  } finally {
    sourceAfter = sourceIdentity();
    const sourceStable = source.fingerprint === sourceAfter.fingerprint && source.commit === sourceAfter.commit;
    const final = useGameStore.getState().gameState;
    const relevantPlayerIds = new Set([...(pass ? [pass.report.playerId] : []), ...attempts.map((attempt) => attempt.playerId)]);
    const observableOutcomes = final ? [...relevantPlayerIds].map((id) => {
      const entity = resolvePlayerEntity(final, id);
      return { playerId: id, resolved: !!entity, retired: entity?.isRetired,
        clubId: entity?.player.clubId, contractClubId: entity?.player.contractClubId,
        seasonRatings: entity?.player.seasonRatings, injuries: entity?.player.injuryHistory?.injuries,
        movements: final.playerMovementHistory.filter((entry) => entry.playerId === id) };
    }) : [];
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify({ schemaVersion: 1, kind: "bounded-youth-consequences", seed,
      source, sourceAfter, sourceStable, status: error ? "failed" : sourceStable && replayChecked ? "passed" : "partial",
      limits: { attempts: 3, preparationWeeks: 26, profiles: ["cautious"], durableProvider: false,
        coverage: "One deterministic ordinary career; does not establish balance or all normal-soak branch coverage" },
      ticks, pass, attempts, snapshots, completedReviews: [...completed.values()], observableOutcomes,
      reviewMessageReceipts: [...reviewMessageReceipts.entries()], archivedReviewMessageIds: [...archivedReviewMessages],
      telemetry, replayChecked, error,
    }, null, 2));
    if (!error) expect(sourceStable, "Source changed during the consequence scenario").toBe(true);
  }
}
