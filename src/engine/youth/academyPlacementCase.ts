import type { RNG } from "@/engine/rng";
import type {
  Club,
  ClubDecisionOutcome,
  JudgmentCategory,
  Observation,
  Player,
  PlayerRole,
  Scout,
  ScoutReport,
  YouthRecruitmentBrief,
} from "@/engine/core/types";
import {
  generateAcademyRecruitmentBriefs,
  type AcademyRecruitmentBrief,
} from "./recruitmentBriefs";
import { evaluatePresentationStrategy } from "@/engine/reports/presentationStrategy";
import { evaluateStakeholderMemoryPolicy } from "@/engine/consequences/stakeholderMemoryPolicy";
import type { ConsequenceEngineState, GameDate } from "@/engine/consequences/types";
import {
  deriveBriefRecruitmentIdentity,
  deriveClubRecruitmentIdentity,
  deriveRegionRecruitmentIdentity,
  evaluateRecruitmentIdentityFit,
} from "@/engine/world/recruitmentIdentity";
import type { ClubRecruitmentIdentity } from "@/engine/world/recruitmentIdentity";

const ROLE_BY_POSITION: Record<Player["position"], PlayerRole> = {
  GK: "sweeper",
  CB: "ballPlayingDefender",
  LB: "wingBack",
  RB: "wingBack",
  CDM: "deepLyingPlaymaker",
  CM: "boxToBox",
  CAM: "advancedPlaymaker",
  LW: "insideForward",
  RW: "insideForward",
  ST: "pressingForward",
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

interface PressureTrackedYouthRecruitmentBrief extends YouthRecruitmentBrief {
  /** Stable baseline makes weekly pressure advancement replay-safe. */
  initialCompetitionPressure: number;
}

function inferredInitialCompetitionPressure(brief: YouthRecruitmentBrief): number {
  const priorityBase = {
    highCeiling: 35,
    earlyReadiness: 45,
    character: 30,
    resale: 38,
  }[brief.developmentPriority];
  const riskAdjustment = { low: 5, medium: 3, high: 0 }[brief.riskTolerance];
  return clamp(priorityBase + riskAdjustment);
}

function mapBrief(
  source: AcademyRecruitmentBrief,
  club: Club,
  identity?: ClubRecruitmentIdentity,
): PressureTrackedYouthRecruitmentBrief {
  const developmentPriority = identity?.seasonalFocus ?? (club.scoutingPhilosophy === "winNow"
    ? "earlyReadiness" as const
    : club.scoutingPhilosophy === "marketSmart"
      ? "resale" as const
      : club.scoutingPhilosophy === "globalRecruiter"
        ? "character" as const
        : "highCeiling" as const);
  const riskTolerance = club.scoutingPhilosophy === "academyFirst"
    ? "high" as const
    : club.scoutingPhilosophy === "winNow"
      ? "low" as const
      : "medium" as const;
  const competitionPressure = clamp(
    (source.priority === "critical" ? 55 : source.priority === "high" ? 38 : 24)
    + club.reputation * 0.2
    + ((identity?.region?.competitionIntensity ?? 50) - 50) * 0.2,
  );
  return {
    id: source.id,
    clubId: source.clubId,
    type: "academyPlacement",
    createdWeek: source.issuedWeek,
    createdSeason: source.issuedSeason,
    expiresWeek: source.expiresWeek,
    expiresSeason: source.expiresSeason,
    requiredPositions: [source.targetPosition],
    preferredRole: ROLE_BY_POSITION[source.targetPosition],
    developmentPriority,
    maxAge: source.ageRange[1],
    riskTolerance,
    weeklyWageBudget: Math.max(
      150,
      Math.min(5_000, Math.round(club.budget / 50_000 / 50) * 50),
    ),
    competitionPressure,
    initialCompetitionPressure: competitionPressure,
    status: source.status,
  };
}

/** Generate a bounded, varied set of persisted briefs without reading hidden ability. */
export function generateYouthRecruitmentBriefs(
  rng: RNG,
  clubs: Club[],
  players: Record<string, Player>,
  week: number,
  season: number,
  existing: Record<string, YouthRecruitmentBrief> = {},
  maximumOpen = 12,
  seasonLength = 38,
  rootSeed = `academy-briefs-s${season}`,
): YouthRecruitmentBrief[] {
  const open = Object.values(existing).filter((brief) => brief.status === "open");
  let slots = Math.max(0, maximumOpen - open.length);
  if (slots === 0) return [];
  const occupiedClubIds = new Set(open.map((brief) => brief.clubId));
  // Index ownership once. Deriving every identity from the full world player
  // record would otherwise turn weekly opportunity refresh into O(clubs * players).
  const playersByClub = new Map<string, Record<string, Player>>();
  for (const player of Object.values(players)) {
    const ownerClubId = player.contractClubId ?? player.clubId;
    if (!ownerClubId) continue;
    const ownedPlayers = playersByClub.get(ownerClubId) ?? {};
    ownedPlayers[player.id] = player;
    playersByClub.set(ownerClubId, ownedPlayers);
  }
  const regionIdentities = new Map<string, ReturnType<typeof deriveRegionRecruitmentIdentity>>();
  for (const regionId of [...new Set(clubs.map((club) => club.leagueId))].sort()) {
    const regionClubs = clubs.filter((club) => club.leagueId === regionId);
    const regionPlayers = Object.fromEntries(regionClubs.flatMap((club) =>
      Object.entries(playersByClub.get(club.id) ?? {})
    ));
    regionIdentities.set(regionId, deriveRegionRecruitmentIdentity({
      regionId,
      clubs: regionClubs,
      players: regionPlayers,
      seed: rootSeed,
      season,
    }));
  }
  const candidates = [...clubs]
    .sort((left, right) => left.id.localeCompare(right.id))
    .filter((club) => !occupiedClubIds.has(club.id))
    .map((club) => ({
      club,
      identity: deriveClubRecruitmentIdentity({
        club,
        players: playersByClub.get(club.id) ?? {},
        seed: rootSeed,
        season,
        region: regionIdentities.get(club.leagueId),
      }),
      tie: rng.next(),
    }))
    .sort((left, right) =>
      right.identity.opportunityScore - left.identity.opportunityScore
      || right.club.youthAcademyRating - left.club.youthAcademyRating
      || right.tie - left.tie
      || left.club.id.localeCompare(right.club.id)
    );
  const generated: YouthRecruitmentBrief[] = [];
  for (const { club, identity } of candidates) {
    if (slots <= 0) break;
    const [brief] = generateAcademyRecruitmentBriefs(
      rng,
      club,
      players,
      week,
      season,
      { maxActiveBriefs: 1, seasonLength },
    );
    if (!brief) continue;
    generated.push(mapBrief(brief, club, identity));
    slots--;
  }
  return generated;
}

export function advanceYouthRecruitmentBriefs(
  briefs: Record<string, YouthRecruitmentBrief>,
  currentWeek: number,
  currentSeason: number,
  seasonLength = 38,
): {
  briefs: Record<string, YouthRecruitmentBrief>;
  expiredIds: string[];
} {
  const expiredIds: string[] = [];
  const updated = Object.fromEntries(Object.values(briefs).map((brief) => {
    if (brief.status !== "open") return [brief.id, brief];
    const due = currentSeason > brief.expiresSeason
      || (currentSeason === brief.expiresSeason && currentWeek >= brief.expiresWeek);
    if (due) {
      expiredIds.push(brief.id);
      return [brief.id, { ...brief, status: "expired" as const }];
    }
    const elapsedWeeks = Math.max(
      0,
      (currentSeason - brief.createdSeason) * seasonLength
      + currentWeek - brief.createdWeek,
    );
    const tracked = brief as YouthRecruitmentBrief & {
      initialCompetitionPressure?: number;
    };
    const initialPressure = tracked.initialCompetitionPressure
      ?? inferredInitialCompetitionPressure(brief);
    const competitionPressure = clamp(Math.max(
      brief.competitionPressure,
      initialPressure + elapsedWeeks * 3,
    ));
    if (competitionPressure === brief.competitionPressure) return [brief.id, brief];
    return [brief.id, {
      ...brief,
      competitionPressure,
    }];
  }));
  return { briefs: updated, expiredIds };
}

export interface AcademyDecisionScore {
  outcome: ClubDecisionOutcome;
  reasons: string[];
  requestedEvidenceCategory?: JudgmentCategory;
  breakdown: NonNullable<import("@/engine/core/types").ClubDecision["scoreBreakdown"]>;
}

const CONFIDENCE_SCORE = { low: 35, medium: 68, high: 92 } as const;
const CONVICTION_SCORE = { note: 20, recommend: 55, strongRecommend: 78, tablePound: 94 } as const;

/**
 * Resolve a club response entirely from the authored artifact and observable
 * context. Player current ability and potential ability are intentionally not
 * accepted by the function, preventing a truth leak into recruitment logic.
 */
export function scoreAcademyClubDecision(input: {
  rng: RNG;
  report: ScoutReport;
  brief: YouthRecruitmentBrief;
  player: Pick<Player, "id" | "age" | "position" | "secondaryPositions">;
  observations: Observation[];
  scout: Scout;
  club: Club;
  relationshipScore?: number;
  stakeholderContext?: {
    consequenceState: Pick<ConsequenceEngineState, "memories" | "obligations">;
    now: GameDate;
    seasonLength?: number;
  };
  worldConditionContext?: {
    scoreAdjustment: number;
    label: string;
  };
}): AcademyDecisionScore {
  const { report, brief, player, observations } = input;
  const verdictEntries = Object.entries(report.categoryVerdicts ?? {}) as Array<[
    JudgmentCategory,
    NonNullable<NonNullable<ScoutReport["categoryVerdicts"]>[JudgmentCategory]>,
  ]>;
  const confidenceAverage = verdictEntries.length > 0
    ? verdictEntries.reduce((sum, [, verdict]) => sum + CONFIDENCE_SCORE[verdict.confidence], 0)
      / verdictEntries.length
    : 20;
  const independentHypotheses = new Set(
    verdictEntries.flatMap(([, verdict]) => verdict.hypothesisIds),
  ).size;
  const contexts = new Set(observations.map((observation) => observation.context)).size;
  let evidence = clamp(
    confidenceAverage * 0.7
    + Math.min(15, independentHypotheses * 4)
    + Math.min(15, contexts * 5),
  );

  const positionMatch = brief.requiredPositions.includes(player.position)
    || player.secondaryPositions.some((position) => brief.requiredPositions.includes(position));
  const roleMatch = !brief.preferredRole || brief.preferredRole === report.projectedRole;
  const ageMatch = player.age <= brief.maxAge;
  const actionFit = brief.developmentPriority === "earlyReadiness"
    ? report.recommendedAction === "offerAcademyPlace"
    : report.recommendedAction !== "monitor";
  let briefFit = clamp(
    (positionMatch ? 45 : 0)
    + (roleMatch ? 25 : 8)
    + (ageMatch ? 15 : 0)
    + (actionFit ? 15 : 5),
  );
  const recruitmentIdentityFit = evaluateRecruitmentIdentityFit({
    identity: deriveBriefRecruitmentIdentity(input.club, brief),
    candidate: player,
    report,
    brief,
    observationContextCount: contexts,
  });
  briefFit = clamp(briefFit + recruitmentIdentityFit.adjustment);

  const wage = report.estimatedWeeklyWage ?? Number.POSITIVE_INFINITY;
  const affordability = Number.isFinite(wage)
    ? clamp(wage <= brief.weeklyWageBudget
      ? 100
      : brief.weeklyWageBudget / Math.max(1, wage) * 100)
    : 0;
  let conviction: number = CONVICTION_SCORE[report.conviction];
  const uncertaintyCount = verdictEntries.filter(([, verdict]) =>
    verdict.confidence === "low" || verdict.acknowledgedUncertainty.trim().length > 24
  ).length;
  const riskPenaltyPerItem = brief.riskTolerance === "low" ? 13 : brief.riskTolerance === "medium" ? 9 : 5;
  let risk = clamp(
    100
    - (report.riskFactors?.length ?? 0) * riskPenaltyPerItem
    - uncertaintyCount * 8,
  );
  if (report.conviction === "tablePound" && evidence < 68) risk = clamp(risk - 25);
  const presentationImpact = evaluatePresentationStrategy({
    approach: report.presentationApproach,
    intendedAudience: report.intendedAudience,
    brief,
    contextCount: contexts,
    hypothesisCount: independentHypotheses,
    riskFactorCount: report.riskFactors?.length ?? 0,
    roleMatch,
  });
  evidence = clamp(evidence + presentationImpact.adjustments.evidence);
  briefFit = clamp(briefFit + presentationImpact.adjustments.briefFit);
  risk = clamp(risk + presentationImpact.adjustments.risk);
  conviction = clamp(conviction + presentationImpact.adjustments.conviction);
  let relationship = clamp(
    (input.relationshipScore ?? 35) * 0.55 + input.scout.reputation * 0.45,
  );
  const stakeholderMemory = input.stakeholderContext
    ? evaluateStakeholderMemoryPolicy({
        memories: input.stakeholderContext.consequenceState.memories,
        obligations: input.stakeholderContext.consequenceState.obligations,
        stakeholder: { kind: "club", id: input.club.id },
        subject: { kind: "scout", id: input.scout.id },
        now: input.stakeholderContext.now,
        seasonLength: input.stakeholderContext.seasonLength,
        domain: "academyReport",
      })
    : undefined;
  if (stakeholderMemory) {
    relationship = clamp(relationship + stakeholderMemory.scoreAdjustment);
    // Prior process trust informs the club's view of disclosed report risk,
    // but at half strength so memory cannot overpower current evidence.
    risk = clamp(risk + Math.round(stakeholderMemory.scoreAdjustment * 0.5));
  }
  const pressureDirection = report.conviction === "strongRecommend" || report.conviction === "tablePound"
    ? 1
    : -0.45;
  const competition = clamp(50 + (brief.competitionPressure - 50) * pressureDirection);
  const seasonalRecruitmentAdjustment = Math.max(
    -12,
    Math.min(12, Math.round(input.worldConditionContext?.scoreAdjustment ?? 0)),
  );
  const total = clamp(
    evidence * 0.25
    + briefFit * 0.25
    + affordability * 0.15
    + conviction * 0.15
    + risk * 0.1
    + relationship * 0.05
    + competition * 0.05
    + presentationImpact.alignmentAdjustment
    + seasonalRecruitmentAdjustment
    + (input.rng.next() - 0.5) * 8,
  );
  const breakdown = {
    evidence,
    briefFit,
    affordability,
    conviction,
    risk,
    relationship,
    competition,
    presentation: presentationImpact.presentationScore,
    total,
  };

  const rankedWeaknesses: Array<[JudgmentCategory, number]> = [
    "potential",
    "roleFit",
    "characterRisk",
  ].map((category) => [
    category as JudgmentCategory,
    report.categoryVerdicts?.[category as JudgmentCategory]
      ? CONFIDENCE_SCORE[report.categoryVerdicts[category as JudgmentCategory]!.confidence]
      : 0,
  ]);
  rankedWeaknesses.sort((left, right) => left[1] - right[1]);
  const requestedEvidenceCategory = rankedWeaknesses[0]?.[0];
  const reasons = [
    briefFit >= 75
      ? "The player closely matches the academy brief."
      : "The player only partially matches the requested profile.",
    evidence >= 70
      ? "The judgment is supported by varied, confident evidence."
      : `The club wants clearer ${requestedEvidenceCategory ?? "supporting"} evidence.`,
    affordability >= 80
      ? "The proposed wage sits inside the academy budget."
      : "The wage estimate stretches the academy budget.",
    risk >= 65
      ? "The disclosed risks are acceptable for this club."
      : "The risk profile is too exposed for the stated conviction.",
    ...recruitmentIdentityFit.reasons,
    presentationImpact.legacyNeutral
      ? presentationImpact.reasons[0]
      : `${presentationImpact.label} presentation: evidence ${presentationImpact.adjustments.evidence >= 0 ? "+" : ""}${presentationImpact.adjustments.evidence}, brief fit ${presentationImpact.adjustments.briefFit >= 0 ? "+" : ""}${presentationImpact.adjustments.briefFit}, risk ${presentationImpact.adjustments.risk >= 0 ? "+" : ""}${presentationImpact.adjustments.risk}, conviction ${presentationImpact.adjustments.conviction >= 0 ? "+" : ""}${presentationImpact.adjustments.conviction}; room alignment ${presentationImpact.alignmentAdjustment >= 0 ? "+" : ""}${presentationImpact.alignmentAdjustment}.`,
    ...(!presentationImpact.legacyNeutral && presentationImpact.reasons.length > 0
      ? [presentationImpact.reasons[0]]
      : []),
    ...(stakeholderMemory?.reason
      ? [`${stakeholderMemory.reason} Relationship ${stakeholderMemory.scoreAdjustment >= 0 ? "+" : ""}${stakeholderMemory.scoreAdjustment}; process-risk ${Math.round(stakeholderMemory.scoreAdjustment * 0.5) >= 0 ? "+" : ""}${Math.round(stakeholderMemory.scoreAdjustment * 0.5)}.`]
      : []),
    ...(seasonalRecruitmentAdjustment !== 0
      ? [`${input.worldConditionContext?.label ?? "The seasonal recruitment climate"} ${seasonalRecruitmentAdjustment > 0 ? "increases" : "reduces"} the club's appetite to act (${seasonalRecruitmentAdjustment > 0 ? "+" : ""}${seasonalRecruitmentAdjustment}).`]
      : []),
  ];

  let outcome: ClubDecisionOutcome;
  if (report.recommendedAction === "monitor") {
    outcome = total >= 44 ? "followUpRequested" : "rejected";
  } else if (report.recommendedAction === "inviteForTrial") {
    outcome = total >= 42 ? "followUpRequested" : "rejected";
  } else if (total >= 66) {
    outcome = "accepted";
  } else if (total >= 45) {
    outcome = "followUpRequested";
  } else {
    outcome = "rejected";
  }
  return {
    outcome,
    reasons,
    requestedEvidenceCategory: outcome === "followUpRequested"
      ? requestedEvidenceCategory
      : undefined,
    breakdown,
  };
}

export function fulfillYouthRecruitmentBrief(
  brief: YouthRecruitmentBrief,
  caseId: string,
  playerId: string,
): YouthRecruitmentBrief {
  if (brief.status !== "open") return brief;
  return {
    ...brief,
    status: "fulfilled",
    assignedCaseId: caseId,
    fulfilledByPlayerId: playerId,
  };
}
