import type {
  Club,
  Contact,
  DiscoveryRecord,
  Player,
  PlayerMovementEvent,
  RecommendationReview,
  ScoutReport,
} from "@/engine/core/types";
import type {
  ConsequenceEngineState,
  DecisionRecord,
  EntityRef,
  JsonValue,
  Obligation,
  StakeholderMemory,
  WorldFact,
} from "@/engine/consequences/types";

export type CareerStoryTemplate =
  | "matchProgramme"
  | "phoneCall"
  | "boardroom"
  | "pressClipping";

export type CareerStoryKind =
  | "recommendationReview"
  | "playerMovement"
  | "resolvedDecision";

export type CareerStoryTone = "positive" | "mixed" | "negative" | "neutral";

export interface CareerStoryContext {
  label: string;
  dateLabel: string;
  headline: string;
  body: string;
  details: string[];
}

export interface CareerStoryMemory {
  id: string;
  holder: string;
  summary: string;
  intensity: number;
  salience: number;
  tone: "positive" | "negative" | "neutral";
}

export interface CareerStoryObligation {
  id: string;
  parties: string;
  terms: string;
  status: Obligation["status"];
  timing: string;
  resolution?: string;
}

export interface CareerStory {
  id: string;
  kind: CareerStoryKind;
  template: CareerStoryTemplate;
  tone: CareerStoryTone;
  season: number;
  week: number;
  eyebrow: string;
  title: string;
  subtitle: string;
  playerId?: string;
  reportId?: string;
  original: CareerStoryContext;
  outcome: CareerStoryContext;
  memories: CareerStoryMemory[];
  obligations: CareerStoryObligation[];
}

type NamedPlayer = Pick<Player, "id" | "firstName" | "lastName">;
type NamedClub = Pick<Club, "id" | "name" | "shortName">;
type NamedContact = Pick<Contact, "id" | "name" | "organization">;

export interface ConsequenceCinemaSource {
  rootSeed: string;
  players: Record<string, NamedPlayer>;
  retiredPlayers: Record<string, NamedPlayer>;
  clubs: Record<string, NamedClub>;
  contacts: Record<string, NamedContact>;
  rivalScouts?: Record<string, { id: string; name: string }>;
  rivalOrganizations?: Record<string, { id: string; name: string }>;
  reports: Record<string, ScoutReport>;
  recommendationReviews: Record<string, RecommendationReview>;
  discoveryRecords: DiscoveryRecord[];
  playerMovementHistory: PlayerMovementEvent[];
  consequenceState: ConsequenceEngineState;
}

const TEMPLATE_OPTIONS: Record<CareerStoryKind, CareerStoryTemplate[]> = {
  recommendationReview: ["matchProgramme", "pressClipping", "boardroom"],
  playerMovement: ["pressClipping", "matchProgramme", "phoneCall"],
  resolvedDecision: ["boardroom", "phoneCall", "pressClipping"],
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectCareerStoryTemplate(
  rootSeed: string,
  storyId: string,
  kind: CareerStoryKind,
): CareerStoryTemplate {
  const options = TEMPLATE_OPTIONS[kind];
  const index = stableHash(`career-story-reel:v1:${rootSeed}:${storyId}`) % options.length;
  return options[index];
}

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function dateLabel(season: number, week: number): string {
  return `Season ${season}, week ${week}`;
}

function compareDate(
  left: { season: number; week: number },
  right: { season: number; week: number },
): number {
  return left.season - right.season || left.week - right.week;
}

function playerName(source: ConsequenceCinemaSource, playerId: string): string {
  const player = source.players[playerId] ?? source.retiredPlayers[playerId];
  return player ? `${player.firstName} ${player.lastName}` : "Tracked player";
}

function clubName(source: ConsequenceCinemaSource, clubId?: string): string | undefined {
  if (!clubId) return undefined;
  return source.clubs[clubId]?.name;
}

function entityName(source: ConsequenceCinemaSource, entity: EntityRef): string {
  if (entity.kind === "contact") {
    return source.contacts[entity.id]?.name ?? "A contact";
  }
  if (entity.kind === "club") {
    return source.clubs[entity.id]?.name ?? "A club stakeholder";
  }
  if (entity.kind === "player") return playerName(source, entity.id);
  if (entity.kind === "family") return `${playerName(source, entity.id)}'s family`;
  if (entity.kind === "rival") {
    return source.rivalScouts?.[entity.id]?.name ?? "A rival scout";
  }
  if (entity.kind === "board") {
    const club = source.clubs[entity.id]?.name;
    return club ? `${club} board` : "A club board";
  }
  if (entity.kind === "rivalOrganization") {
    return source.rivalOrganizations?.[entity.id]?.name ?? "A rival organization";
  }
  if (entity.kind === "scout") return "Your scouting career";
  return humanize(entity.kind);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function reportDate(report: ScoutReport): { season: number; week: number } {
  return { season: report.submittedSeason, week: report.submittedWeek };
}

function reportBefore(
  source: ConsequenceCinemaSource,
  playerId: string,
  date: { season: number; week: number },
): ScoutReport | undefined {
  return Object.values(source.reports)
    .filter((report) =>
      report.playerId === playerId
      && compareDate(reportDate(report), date) <= 0,
    )
    .sort((left, right) =>
      compareDate(reportDate(right), reportDate(left))
      || (right.revision ?? 0) - (left.revision ?? 0)
      || right.id.localeCompare(left.id),
    )[0];
}

function convictionLabel(report: ScoutReport): string {
  switch (report.conviction) {
    case "strongRecommend": return "Strong recommendation";
    case "tablePound": return "Table-pound recommendation";
    case "recommend": return "Recommendation";
    default: return "Scouting note";
  }
}

function reportContext(report: ScoutReport): CareerStoryContext {
  const details = [
    `Conviction: ${convictionLabel(report)}`,
    report.recommendedAction
      ? `Requested action: ${humanize(report.recommendedAction)}`
      : undefined,
    report.recruitmentNeed ? `Club need: ${report.recruitmentNeed}` : undefined,
    report.projectedRole ? `Projected role: ${humanize(report.projectedRole)}` : undefined,
    report.intendedAudience ? `Audience: ${humanize(report.intendedAudience)}` : undefined,
    report.riskFactors?.length
      ? `Risks recorded: ${report.riskFactors.join(", ")}`
      : undefined,
  ].filter((detail): detail is string => Boolean(detail));

  return {
    label: "Original report",
    dateLabel: dateLabel(report.submittedSeason, report.submittedWeek),
    headline: convictionLabel(report),
    body: report.summary.trim() || "No authored report summary was preserved.",
    details,
  };
}

function discoveryContext(record: DiscoveryRecord): CareerStoryContext {
  return {
    label: "Original discovery",
    dateLabel: dateLabel(record.discoveredSeason, record.discoveredWeek),
    headline: record.wasWonderkid ? "Marked as an exceptional prospect" : "Added to the scouting record",
    body: "No authored report predating this movement is linked in the current save.",
    details: ["The reel is using the persisted discovery record only."],
  };
}

function safeRecord(value: JsonValue): Record<string, JsonValue> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : undefined;
}

function safeString(record: Record<string, JsonValue> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function safeNumber(record: Record<string, JsonValue> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function safeBoolean(record: Record<string, JsonValue> | undefined, key: string): boolean | undefined {
  const value = record?.[key];
  return typeof value === "boolean" ? value : undefined;
}

/** Only recognizes explicitly player-facing persisted outcome schemas. */
function outcomeFromFact(fact: WorldFact): { body: string; details: string[]; tone: CareerStoryTone } | undefined {
  const value = safeRecord(fact.value);
  if (fact.kind === "ScoutingSpecialEventOutcome") {
    const outcomeLabel = safeString(value, "outcomeLabel");
    const branch = safeString(value, "branch");
    const delta = safeNumber(value, "delta");
    return {
      body: outcomeLabel ?? `The recorded branch resolved as ${branch ? humanize(branch).toLowerCase() : "complete"}.`,
      details: delta === undefined ? [] : [`Recorded impact: ${delta > 0 ? "+" : ""}${delta}`],
      tone: branch === "success" ? "positive" : branch === "failure" ? "negative" : "neutral",
    };
  }
  if (fact.kind === "CareerCrossroadsOutcome") {
    const succeeded = safeBoolean(value, "succeeded");
    const reputationDelta = safeNumber(value, "reputationDelta");
    return {
      body: succeeded === undefined
        ? "The career crossroads reached its recorded outcome."
        : succeeded
          ? "The recorded career gamble succeeded."
          : "The recorded career gamble failed.",
      details: reputationDelta === undefined
        ? []
        : [`Reputation impact: ${reputationDelta > 0 ? "+" : ""}${reputationDelta}`],
      tone: succeeded === true ? "positive" : succeeded === false ? "negative" : "neutral",
    };
  }

  // Rival openings expose an explicit resolution field intended for feedback.
  if (fact.kind === "RivalOrganizationOpportunityResolved") {
    const resolution = safeString(value, "resolution");
    return resolution ? {
      body: `The counter-scouting move resolved as ${humanize(resolution).toLowerCase()}.`,
      details: [],
      tone: resolution === "success" ? "positive" : resolution === "failure" ? "negative" : "neutral",
    } : undefined;
  }
  return undefined;
}

function memoryTone(memory: StakeholderMemory): CareerStoryMemory["tone"] {
  return memory.valence > 0 ? "positive" : memory.valence < 0 ? "negative" : "neutral";
}

function stakeholderRecords(
  source: ConsequenceCinemaSource,
  decisionIds: Set<string>,
  playerId?: string,
): { memories: CareerStoryMemory[]; obligations: CareerStoryObligation[] } {
  const memories = Object.values(source.consequenceState.memories)
    .filter((memory) =>
      (memory.sourceDecisionId ? decisionIds.has(memory.sourceDecisionId) : false)
      || (playerId ? memory.subject.id === playerId : false),
    )
    .sort((left, right) =>
      compareDate(right.createdAt, left.createdAt) || right.id.localeCompare(left.id),
    )
    .slice(0, 3)
    .map((memory) => ({
      id: memory.id,
      holder: entityName(source, memory.stakeholder),
      summary: memory.tags.length > 0
        ? memory.tags.map(humanize).join(" · ")
        : "A lasting stakeholder impression",
      intensity: memory.intensity,
      salience: memory.salience,
      tone: memoryTone(memory),
    }));

  const obligations = Object.values(source.consequenceState.obligations)
    .filter((obligation) => decisionIds.has(obligation.sourceDecisionId))
    .sort((left, right) =>
      compareDate(right.createdAt, left.createdAt) || right.id.localeCompare(left.id),
    )
    .slice(0, 3)
    .map((obligation) => ({
      id: obligation.id,
      parties: `${entityName(source, obligation.debtor)} → ${entityName(source, obligation.creditor)}`,
      terms: obligation.terms,
      status: obligation.status,
      timing: obligation.dueAt
        ? `Due ${dateLabel(obligation.dueAt.season, obligation.dueAt.week)}`
        : "No fixed deadline",
      resolution: obligation.resolutionNote,
    }));

  return { memories, obligations };
}

function relatedDecisionIds(
  source: ConsequenceCinemaSource,
  playerId: string,
): Set<string> {
  return new Set(
    Object.values(source.consequenceState.decisions)
      .filter((decision) => {
        if (decision.source.kind === "player" && decision.source.id === playerId) return true;
        const metadata = decision.metadata;
        return metadata?.relatedPlayerId === playerId || metadata?.playerId === playerId;
      })
      .map((decision) => decision.id),
  );
}

function recommendationStories(source: ConsequenceCinemaSource): CareerStory[] {
  return Object.values(source.recommendationReviews)
    .filter((review) => review.status === "complete")
    .flatMap((review) => {
      const report = source.reports[review.reportId];
      if (!report) return [];
      const season = review.completedSeason ?? review.dueSeason;
      const week = review.completedWeek ?? review.dueWeek;
      const player = playerName(source, review.playerId);
      const club = clubName(source, review.clubId) ?? "the destination club";
      const score = review.overallScore;
      const decisionIds = relatedDecisionIds(source, review.playerId);
      const stakeholder = stakeholderRecords(source, decisionIds, review.playerId);
      const tone: CareerStoryTone = score === undefined
        ? "neutral"
        : score >= 75
          ? "positive"
          : score < 45
            ? "negative"
            : "mixed";
      const checkpoint = review.checkpoint === "oneSeason" ? "one-season" : "two-season";

      return [{
        id: `review:${review.id}`,
        kind: "recommendationReview" as const,
        template: selectCareerStoryTemplate(source.rootSeed, `review:${review.id}`, "recommendationReview"),
        tone,
        season,
        week,
        eyebrow: `${checkpoint} review`,
        title: `${player}: the verdict arrives`,
        subtitle: `${club} reviewed the recommendation against observable career evidence.`,
        playerId: review.playerId,
        reportId: review.reportId,
        original: reportContext(report),
        outcome: {
          label: "Later review",
          dateLabel: dateLabel(season, week),
          headline: score === undefined ? "Review completed" : `${score}/100 overall`,
          body: review.findings?.length
            ? review.findings.join(" ")
            : "The completed review preserved scores but no written findings.",
          details: [
            review.clubFitScore === undefined ? undefined : `Club fit: ${review.clubFitScore}/100`,
            review.timingScore === undefined ? undefined : `Timing: ${review.timingScore}/100`,
            review.confidenceCalibration === undefined
              ? undefined
              : `Confidence calibration: ${review.confidenceCalibration}/100`,
            ...(review.evidence ?? []).slice(0, 4).map((evidence) => evidence.description),
          ].filter((detail): detail is string => Boolean(detail)),
        },
        ...stakeholder,
      }];
    });
}

function movementLabel(type: PlayerMovementEvent["type"]): string {
  switch (type) {
    case "youthSigning": return "academy signing";
    case "permanentTransfer": return "transfer";
    case "loanStart": return "loan move";
    case "loanReturn": return "loan return";
    case "loanRecall": return "loan recall";
    case "loanBuyOption": return "loan option exercised";
    case "freeAgentSigning": return "free-agent signing";
    case "contractRenewal": return "contract renewal";
    case "footballExit": return "football exit";
    default: return humanize(type).toLowerCase();
  }
}

function movementStories(source: ConsequenceCinemaSource): CareerStory[] {
  const discoveries = new Map(
    source.discoveryRecords.map((record) => [record.playerId, record]),
  );
  return source.playerMovementHistory.flatMap((movement) => {
    const discovery = discoveries.get(movement.playerId);
    if (!discovery) return [];
    const date = { season: movement.season, week: movement.week };
    const report = reportBefore(source, movement.playerId, date);
    const fromClub = clubName(source, movement.fromClubId) ?? (movement.fromClubId ? "an archived club" : "free agency");
    const toClub = clubName(source, movement.toClubId) ?? (movement.toClubId ? "an archived club" : "outside football");
    const move = movementLabel(movement.type);
    const decisionIds = relatedDecisionIds(source, movement.playerId);
    const stakeholder = stakeholderRecords(source, decisionIds, movement.playerId);
    const details = [
      `Route: ${fromClub} → ${toClub}`,
      movement.fee === undefined ? undefined : `Recorded fee: ${formatMoney(movement.fee)}`,
      movement.reason ? `Recorded reason: ${movement.reason}` : undefined,
    ].filter((detail): detail is string => Boolean(detail));
    const tone: CareerStoryTone = movement.type === "release" || movement.type === "footballExit"
      ? "negative"
      : movement.type === "youthSigning" || movement.type === "freeAgentSigning"
        ? "positive"
        : "neutral";

    return [{
      id: `movement:${movement.id}`,
      kind: "playerMovement" as const,
      template: selectCareerStoryTemplate(source.rootSeed, `movement:${movement.id}`, "playerMovement"),
      tone,
      season: movement.season,
      week: movement.week,
      eyebrow: humanize(move),
      title: `${playerName(source, movement.playerId)}: ${move}`,
      subtitle: `${fromClub} to ${toClub}`,
      playerId: movement.playerId,
      reportId: report?.id,
      original: report ? reportContext(report) : discoveryContext(discovery),
      outcome: {
        label: "Career movement",
        dateLabel: dateLabel(movement.season, movement.week),
        headline: humanize(move),
        body: movement.reason
          ? movement.reason
          : `The canonical movement ledger records this player moving from ${fromClub} to ${toClub}.`,
        details,
      },
      ...stakeholder,
    }];
  });
}

function metadataString(decision: DecisionRecord, key: string): string | undefined {
  const value = decision.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function decisionPlayerId(source: ConsequenceCinemaSource, decision: DecisionRecord): string | undefined {
  if (decision.source.kind === "player") return decision.source.id;
  const direct = metadataString(decision, "relatedPlayerId") ?? metadataString(decision, "playerId");
  if (direct) return direct;
  const fact = Object.values(source.consequenceState.facts).find((candidate) =>
    candidate.sourceDecisionId === decision.id && candidate.subject?.kind === "player",
  );
  return fact?.subject?.id;
}

function decisionReportId(source: ConsequenceCinemaSource, decision: DecisionRecord): string | undefined {
  const direct = metadataString(decision, "reportId") ?? metadataString(decision, "relatedReportId");
  if (direct && source.reports[direct]) return direct;
  if (decision.source.kind === "report" && source.reports[decision.source.id]) return decision.source.id;
  return undefined;
}

function decisionStories(source: ConsequenceCinemaSource): CareerStory[] {
  return Object.values(source.consequenceState.decisions)
    .filter((decision) => decision.status === "resolved" && Boolean(decision.selectedOptionId))
    .flatMap((decision) => {
      const selected = decision.options.find((option) => option.id === decision.selectedOptionId);
      if (!selected || !decision.resolvedAt) return [];
      const linkedFacts = Object.values(source.consequenceState.facts)
        .filter((fact) => fact.sourceDecisionId === decision.id)
        .sort((left, right) =>
          compareDate(right.observedAt, left.observedAt) || right.id.localeCompare(left.id),
        );
      const presentedFact = linkedFacts
        .map((fact) => ({ fact, presentation: outcomeFromFact(fact) }))
        .find((entry) => entry.presentation);
      const consequences = decision.consequenceIds
        .map((id) => source.consequenceState.consequences[id])
        .filter(Boolean);
      const statusCounts = consequences.reduce(
        (counts, consequence) => ({
          ...counts,
          [consequence.status]: counts[consequence.status] + 1,
        }),
        { pending: 0, applied: 0, skipped: 0, failed: 0, cancelled: 0 },
      );
      const playerId = decisionPlayerId(source, decision);
      const reportId = decisionReportId(source, decision)
        ?? (playerId ? reportBefore(source, playerId, decision.resolvedAt)?.id : undefined);
      const report = reportId ? source.reports[reportId] : undefined;
      const stakeholder = stakeholderRecords(source, new Set([decision.id]), playerId);
      const title = metadataString(decision, "title") ?? selected.label;
      const fallbackBody = [
        statusCounts.applied ? `${statusCounts.applied} linked consequence${statusCounts.applied === 1 ? "" : "s"} applied` : undefined,
        statusCounts.skipped ? `${statusCounts.skipped} skipped` : undefined,
        statusCounts.failed ? `${statusCounts.failed} failed` : undefined,
        statusCounts.cancelled ? `${statusCounts.cancelled} cancelled` : undefined,
      ].filter(Boolean).join("; ");
      const presentation = presentedFact?.presentation;

      return [{
        id: `decision:${decision.id}`,
        kind: "resolvedDecision" as const,
        template: selectCareerStoryTemplate(source.rootSeed, `decision:${decision.id}`, "resolvedDecision"),
        tone: presentation?.tone ?? "neutral",
        season: decision.resolvedAt.season,
        week: decision.resolvedAt.week,
        eyebrow: decision.selectionKind === "default" ? "Deadline decision" : "Career decision",
        title,
        subtitle: `${selected.label} was locked in; its persisted consequence record is shown below.`,
        playerId,
        reportId,
        original: {
          label: report ? "Choice and linked report" : "Original choice",
          dateLabel: dateLabel(
            (decision.selectedAt ?? decision.offeredAt).season,
            (decision.selectedAt ?? decision.offeredAt).week,
          ),
          headline: selected.label,
          body: report?.summary.trim()
            || `Selected ${decision.selectionKind === "default" ? "by deadline default" : "as a deliberate career choice"}.`,
          details: [
            ...selected.knownTradeoffs,
            ...(report ? [`Linked report: ${convictionLabel(report)}`] : []),
          ],
        },
        outcome: {
          label: "Resolved outcome",
          dateLabel: dateLabel(decision.resolvedAt.season, decision.resolvedAt.week),
          headline: presentedFact ? humanize(presentedFact.fact.kind) : "Decision resolved",
          body: presentation?.body
            ?? (fallbackBody || "The decision is marked resolved with no player-facing outcome fact preserved."),
          details: presentation?.details ?? [],
        },
        ...stakeholder,
      }];
    });
}

export function buildCareerStoryReel(
  source: ConsequenceCinemaSource,
  limit = 24,
): CareerStory[] {
  return [
    ...recommendationStories(source),
    ...movementStories(source),
    ...decisionStories(source),
  ]
    .sort((left, right) =>
      right.season - left.season
      || right.week - left.week
      || left.id.localeCompare(right.id),
    )
    .slice(0, Math.max(0, limit));
}
