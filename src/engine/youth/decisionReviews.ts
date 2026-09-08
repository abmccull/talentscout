/**
 * Non-signing decisions share the existing case/review ledger. A pass is a
 * private judgment, not a recruitment action or a future reward entitlement.
 * Reviews read only dated performance and movement records, never ability/PA.
 */
import type {
  ClubDecision,
  GameState,
  Player,
  PlayerMovementEvent,
  RecommendationReview,
  ScoutReport,
  ScoutingDecisionReceipt,
} from "@/engine/core/types";
import { resolvePlayerEntity } from "@/lib/playerResolution";

const SIGNING_TYPES = new Set<PlayerMovementEvent["type"]>([
  "youthSigning", "freeAgentSigning", "permanentTransfer", "loanBuyOption",
]);

function after(
  date: { week: number; season: number },
  boundary: { week: number; season: number },
): boolean {
  return date.season > boundary.season
    || (date.season === boundary.season && date.week > boundary.week);
}

function atOrAfter(
  date: { week: number; season: number },
  boundary: { week: number; season: number },
): boolean {
  return date.season > boundary.season
    || (date.season === boundary.season && date.week >= boundary.week);
}

export function createScoutingDecisionReceipt(report: ScoutReport): ScoutingDecisionReceipt {
  if (report.decisionReceipt) return report.decisionReceipt;
  return {
    id: `scouting_decision_${report.id}`,
    action: report.recommendedAction ?? "monitor",
    confidence: report.evidenceAssessment?.confidence,
    week: report.submittedWeek,
    season: report.submittedSeason,
    conviction: report.conviction,
    intendedClubId: report.intendedClubId,
    projectedRole: report.projectedRole,
    potentialRange: report.perceivedPARange ? [...report.perceivedPARange] : undefined,
    evidenceObservationIds: [...(report.evidenceObservationIds ?? [])],
    evidenceCardIds: [...(report.evidenceAssessment?.evidenceIds ?? [])],
    summary: report.summary,
  };
}

function decisionKind(
  report: ScoutReport,
  decisions: ClubDecision[],
  movements: PlayerMovementEvent[],
): RecommendationReview["decisionKind"] | undefined {
  const receipt = report.decisionReceipt;
  // Legacy reports lack a decision-time snapshot. Do not invent one later.
  if (!receipt) return undefined;
  if (receipt.action === "pass") return "pass";
  if (report.clubResponse === "ignored"
    || decisions.some((decision) => decision.outcome === "rejected")) return "ignored";
  if (movements.some((movement) =>
    SIGNING_TYPES.has(movement.type)
    && Boolean(movement.toClubId)
    && movement.toClubId !== receipt.intendedClubId
    && after(movement, receipt),
  )) return "elsewhere";
  return undefined;
}

/** Reconcile only genuinely authored decisions; IDs are stable across retries. */
export function reconcileScoutingDecisionReviews(state: GameState): GameState {
  const movementsByPlayer = new Map<string, PlayerMovementEvent[]>();
  for (const movement of state.playerMovementHistory ?? []) {
    const movements = movementsByPlayer.get(movement.playerId) ?? [];
    movements.push(movement);
    movementsByPlayer.set(movement.playerId, movements);
  }
  const decisionsByReport = new Map<string, ClubDecision[]>();
  for (const decision of Object.values(state.clubDecisions ?? {})) {
    if (!decision.reportId) continue;
    const decisions = decisionsByReport.get(decision.reportId) ?? [];
    decisions.push(decision);
    decisionsByReport.set(decision.reportId, decisions);
  }
  let reviews = state.recommendationReviews ?? {};
  let cases = state.scoutingCases ?? {};
  for (const report of Object.values(state.reports)) {
    const receipt = report.decisionReceipt;
    const scoutingCase = report.caseId ? cases[report.caseId] : undefined;
    if (!receipt || !scoutingCase || !scoutingCase.reportIds.includes(report.id)) continue;
    if (scoutingCase.status === "placed" && receipt.action !== "pass") continue;
    const kind = decisionKind(
      report,
      decisionsByReport.get(report.id) ?? [],
      movementsByPlayer.get(report.playerId) ?? [],
    );
    if (!kind) continue;
    for (const [checkpoint, horizon] of [["oneSeason", 1], ["twoSeasons", 2]] as const) {
      const id = `decision_review_${receipt.id}_${checkpoint}`;
      if (reviews[id]) continue;
      reviews = {
        ...reviews,
        [id]: {
          id,
          caseId: scoutingCase.id,
          reportId: report.id,
          playerId: report.playerId,
          clubId: receipt.intendedClubId,
          origin: "decision",
          decisionKind: kind,
          decisionReceiptId: receipt.id,
          checkpoint,
          dueWeek: receipt.week,
          dueSeason: receipt.season + horizon,
          status: "scheduled",
        },
      };
      const currentCase = cases[scoutingCase.id];
      cases = {
        ...cases,
        [currentCase.id]: {
          ...currentCase,
          reviewIds: [...new Set([...(currentCase.reviewIds ?? []), id])],
        },
      };
    }
  }
  return reviews === state.recommendationReviews && cases === state.scoutingCases
    ? state
    : { ...state, recommendationReviews: reviews, scoutingCases: cases };
}

export function completeScoutingDecisionReview(input: {
  review: RecommendationReview;
  report: ScoutReport;
  player?: Player;
  movements: PlayerMovementEvent[];
  currentWeek: number;
  currentSeason: number;
}): RecommendationReview {
  const { review, report, player } = input;
  const receipt = report.decisionReceipt;
  if (review.origin !== "decision" || review.status !== "scheduled" || !receipt
    || review.decisionReceiptId !== receipt.id || review.reportId !== report.id
    || review.caseId !== report.caseId || review.playerId !== report.playerId
    || !atOrAfter({ week: input.currentWeek, season: input.currentSeason }, {
      week: review.dueWeek, season: review.dueSeason,
    })) return review;

  const due = { week: review.dueWeek, season: review.dueSeason };
  const movements = input.movements.filter((movement) =>
    movement.playerId === report.playerId && after(movement, receipt) && atOrAfter(due, movement),
  ).sort((left, right) => left.season - right.season || left.week - right.week || left.id.localeCompare(right.id));
  // Only completed seasons are stable historical evidence. A partial current
  // season can otherwise rewrite a late-loaded checkpoint with future results.
  const ratingsBySeason = new Map<number, NonNullable<Player["seasonRatings"]>[number]>();
  for (const rating of player?.seasonRatings ?? []) {
    // Annual totals cannot separate matches before a mid-season judgment.
    // Do not treat a pre-existing good season as evidence of a later miss.
    if ((rating.season > receipt.season || (receipt.week === 1 && rating.season === receipt.season))
      && rating.season < due.season) {
      ratingsBySeason.set(rating.season, rating);
    }
  }
  const ratings = [...ratingsBySeason.values()].sort((left, right) => left.season - right.season);
  const appearances = ratings.reduce((total, rating) => total + rating.appearances, 0);
  const averageRating = appearances > 0
    ? ratings.reduce((total, rating) => total + rating.avgRating * rating.appearances, 0) / appearances
    : undefined;
  const signings = movements.filter((movement) => SIGNING_TYPES.has(movement.type));
  const latestMovement = movements.at(-1);
  const setback = latestMovement?.type === "release" || latestMovement?.type === "footballExit";
  const progressed = appearances >= 12 && averageRating !== undefined && averageRating >= 6.8;
  const outcome: RecommendationReview["decisionOutcome"] = progressed && setback ? "mixed"
    : progressed ? "progressed" : setback ? "setback" : "unresolved";
  const originalAction = receipt.action === "pass" ? "You passed for now"
    : receipt.action === "monitor" ? "You chose to keep watching"
      : "You recommended further recruitment attention";
  const findings = [
    `${originalAction} in Season ${receipt.season}, Week ${receipt.week}. The original evidence and conviction remain on record.`,
  ];
  if (review.decisionKind === "ignored") {
    findings.push("The intended club did not act on that recommendation. Its response is a separate decision from your player evaluation.");
  }
  if (signings.length > 0) {
    const elsewhere = signings.some((movement) => movement.toClubId !== receipt.intendedClubId);
    findings.push(!receipt.intendedClubId
      ? "A club subsequently signed the player. The dated movement is recorded; a signing alone does not establish career success."
      : elsewhere
        ? "A club elsewhere subsequently signed the player. The dated movement is recorded; a signing alone does not establish career success."
        : "The intended club subsequently signed the player. Later action is preserved without rewriting its earlier response.");
  }
  if (progressed) {
    findings.push(`${appearances} recorded appearances at ${averageRating!.toFixed(1)} average rating show a credible playing career developing.${receipt.action === "pass" ? " This is worth revisiting against the reasons you passed; it does not prove the original uncertainty was unreasonable." : " Your original projection can now be compared with real playing outcomes."}`);
  } else if (appearances > 0) {
    findings.push(`${appearances} recorded appearances at ${averageRating!.toFixed(1)} average rating provide an early checkpoint, not a final verdict on the player's career.`);
  }
  if (setback) findings.push("The latest recorded pathway ended in a release or football exit. That is a setback, not proof that the prospect never had talent.");
  if (outcome === "unresolved") findings.push("There is not enough recorded career evidence for a firm outcome. Missing evidence is not failure.");
  return {
    ...review,
    status: "complete",
    completedWeek: review.dueWeek,
    completedSeason: review.dueSeason,
    decisionOutcome: outcome,
    findings,
    // Qualitative callbacks deliberately create no hidden-truth score or XP.
    evidence: [
      ...movements.map((movement) => ({
        source: "movement" as const,
        sourceId: movement.id,
        description: `Season ${movement.season}, Week ${movement.week}: ${movement.type.replace(/([A-Z])/g, " $1").toLowerCase()}.`,
      })),
      ...ratings.map((rating) => ({
        source: "seasonRating" as const,
        sourceId: `season_rating_${report.playerId}_s${rating.season}`,
        description: `Season ${rating.season}: ${rating.appearances} appearances, ${rating.avgRating.toFixed(1)} average rating.`,
      })),
    ],
  };
}

/** Canonical weekly integration, including unsigned and archived prospects. */
export function processScoutingDecisionReviews(state: GameState): GameState {
  const reconciled = reconcileScoutingDecisionReviews(state);
  let reviews = reconciled.recommendationReviews;
  const messages: GameState["inbox"] = [];
  const movementIndex = new Map<string, PlayerMovementEvent[]>();
  for (const movement of reconciled.playerMovementHistory ?? []) {
    const movements = movementIndex.get(movement.playerId) ?? [];
    movements.push(movement);
    movementIndex.set(movement.playerId, movements);
  }
  for (const review of Object.values(reviews)) {
    if (review.origin !== "decision" || review.status !== "scheduled") continue;
    const report = reconciled.reports[review.reportId];
    if (!report) continue;
    const player = resolvePlayerEntity(reconciled, review.playerId)?.player;
    const completed = completeScoutingDecisionReview({
      review, report, player,
      movements: movementIndex.get(review.playerId) ?? [],
      currentWeek: reconciled.currentWeek,
      currentSeason: reconciled.currentSeason,
    });
    if (completed === review) continue;
    reviews = { ...reviews, [review.id]: completed };
    const playerName = player ? `${player.firstName} ${player.lastName}` : "Your previously assessed prospect";
    const messageId = `recommendation-review-${review.id}`;
    if (!reconciled.inbox.some((message) => message.id === messageId)) {
      messages.push({
        id: messageId,
        week: reconciled.currentWeek,
        season: reconciled.currentSeason,
        type: "feedback",
        title: `${playerName}: ${review.decisionKind === "pass" ? "the player you passed on" : "your earlier judgment"}`,
        body: (completed.findings ?? []).join("\n\n"),
        read: false,
        actionRequired: false,
        relatedId: report.playerId,
        relatedEntityType: "player",
      });
    }
  }
  return reviews === reconciled.recommendationReviews && messages.length === 0 ? reconciled : {
    ...reconciled,
    recommendationReviews: reviews,
    inbox: [...reconciled.inbox, ...messages],
  };
}
