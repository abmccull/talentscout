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
import type {
  CareerMoment,
  CareerMomentCategory,
} from "@/engine/career/careerMoments";
import type {
  CareerStoryArchiveRecord,
  CareerStoryArchiveState,
} from "@/engine/consequences/careerStoryArchive";

export type CareerStoryTemplate =
  | "matchProgramme"
  | "phoneCall"
  | "boardroom"
  | "pressClipping"
  | "notebook"
  | "voicemail"
  | "farewellLetter";

export type CareerStoryKind =
  | "recommendationReview"
  | "playerMovement"
  | "resolvedDecision"
  | "careerMoment";

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

export interface CareerStorySecondaryEvent {
  id: string;
  label: string;
  dateLabel: string;
  summary: string;
  tone: CareerStoryTone;
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
  callbackLine: string;
  secondaryEvents: CareerStorySecondaryEvent[];
  momentCategory?: CareerMomentCategory;
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
  /** Presented/suppressed moment archive; pending moments stay in the delivery queue. */
  careerMoments?: readonly CareerMoment[];
  /** Durable material decisions retained after the live consequence ledger compacts. */
  careerStoryArchive?: CareerStoryArchiveState;
}

const TEMPLATE_OPTIONS: Record<CareerStoryKind, CareerStoryTemplate[]> = {
  recommendationReview: ["matchProgramme", "pressClipping", "boardroom"],
  playerMovement: ["pressClipping", "matchProgramme", "phoneCall"],
  resolvedDecision: ["boardroom", "phoneCall", "pressClipping"],
  careerMoment: ["notebook", "voicemail", "farewellLetter", "pressClipping"],
};

const CALLBACK_LINES: Record<CareerStoryTone, readonly string[]> = {
  positive: [
    "The first notebook entry reads differently now.",
    "A hunch became a line in the career record.",
    "Someone kept the original report. Today, it feels prophetic.",
    "The risk in that recommendation is easy to forget now.",
  ],
  mixed: [
    "The right conclusion arrived by a messier route than expected.",
    "The old report was neither vindicated nor disproved cleanly.",
    "There is pride here, but also a margin note worth revisiting.",
    "Football answered the question without making it simple.",
  ],
  negative: [
    "The warning in the margin is harder to ignore in hindsight.",
    "This is the page every scout would rather leave unturned.",
    "The conviction remains in ink, even after the outcome changed.",
    "A failed call becomes useful only when the lesson survives it.",
  ],
  neutral: [
    "The archive remembers the choice even when the verdict stays open.",
    "Another line was added to a career still being written.",
    "The record preserves what was known, and what was not.",
    "Time changed the context more than the original judgment.",
  ],
};

const MOMENT_CALLBACK_LINES: Record<CareerMomentCategory, readonly string[]> = {
  discovery: [
    "The first clue looked ordinary until the rest of the career gave it meaning.",
    "This was the moment a name became a responsibility.",
    "The notebook still shows how little was known at the beginning.",
  ],
  conviction: [
    "The strength of the language mattered as much as the verdict.",
    "You could have hedged. The record shows that you did not.",
    "Certainty spent here could not be reclaimed later.",
  ],
  vindication: [
    "Time finally supplied the evidence the first report could only predict.",
    "The people who doubted the call remember it differently now.",
    "Vindication arrived late enough to feel earned.",
  ],
  failure: [
    "The lesson survived because the original judgment was never erased.",
    "The miss became part of the method that followed it.",
    "A career is shaped as much by the calls it owns as the calls it celebrates.",
  ],
  betrayal: [
    "Access returned eventually. Trust did not return in the same form.",
    "The information was valuable; the price became clear later.",
    "Every future conversation carried a trace of this one.",
  ],
  comeback: [
    "The return mattered because the fall remained visible.",
    "A closed door became a different route through football.",
    "The comeback changed what success meant afterward.",
  ],
  promotion: [
    "The new title brought decisions that could no longer be solved alone.",
    "Authority arrived with a longer list of people who could be disappointed.",
    "The work changed here, not merely the number beside the title.",
  ],
  farewell: [
    "The last page points back to names that once had no reputation at all.",
    "The career ends; its recommendations continue moving through the world.",
    "What remains is not a score, but a chain of people and consequences.",
  ],
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

export function selectCareerStoryCallback(
  rootSeed: string,
  storyId: string,
  kind: CareerStoryKind,
  tone: CareerStoryTone,
  momentCategory?: CareerMomentCategory,
): string {
  const options = momentCategory
    ? MOMENT_CALLBACK_LINES[momentCategory]
    : CALLBACK_LINES[tone];
  const index = stableHash(`career-story-callback:v2:${rootSeed}:${storyId}:${kind}:${tone}:${momentCategory ?? "general"}`) % options.length;
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
      ? `Warnings noted: ${report.riskFactors.join(", ")}`
      : undefined,
  ].filter((detail): detail is string => Boolean(detail));

  return {
    label: "Original report",
    dateLabel: dateLabel(report.submittedSeason, report.submittedWeek),
    headline: convictionLabel(report),
    body: report.summary.trim() || "No written summary survived in your file.",
    details,
  };
}

function discoveryContext(record: DiscoveryRecord): CareerStoryContext {
  return {
    label: "Original discovery",
    dateLabel: dateLabel(record.discoveredSeason, record.discoveredWeek),
    headline: "Flagged on your radar",
    body: "No earlier written report is tied to this move in your case file.",
    details: ["No earlier upside projection is attached to this discovery."],
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
            : "The review closed without any written findings reaching your file.",
          details: [
            review.clubFitScore === undefined ? undefined : `Club fit: ${review.clubFitScore}/100`,
            review.timingScore === undefined ? undefined : `Timing: ${review.timingScore}/100`,
            review.confidenceCalibration === undefined
              ? undefined
              : `Confidence calibration: ${review.confidenceCalibration}/100`,
            ...(review.evidence ?? []).slice(0, 4).map((evidence) => evidence.description),
          ].filter((detail): detail is string => Boolean(detail)),
        },
        callbackLine: selectCareerStoryCallback(
          source.rootSeed,
          `review:${review.id}`,
          "recommendationReview",
          tone,
        ),
        secondaryEvents: movementSecondaryEvents(
          source,
          review.playerId,
          reportDate(report),
        ),
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

function movementTone(type: PlayerMovementEvent["type"]): CareerStoryTone {
  if (type === "release" || type === "footballExit") return "negative";
  if (type === "youthSigning" || type === "freeAgentSigning") return "positive";
  return "neutral";
}

function movementSecondaryEvents(
  source: ConsequenceCinemaSource,
  playerId: string,
  after: { season: number; week: number },
  excludeMovementId?: string,
): CareerStorySecondaryEvent[] {
  return source.playerMovementHistory
    .filter((movement) =>
      movement.playerId === playerId
      && movement.id !== excludeMovementId
      && compareDate(movement, after) > 0,
    )
    .sort((left, right) => compareDate(left, right) || left.id.localeCompare(right.id))
    .slice(0, 3)
    .map((movement) => {
      const fromClub = clubName(source, movement.fromClubId)
        ?? (movement.fromClubId ? "an archived club" : "free agency");
      const toClub = clubName(source, movement.toClubId)
        ?? (movement.toClubId ? "an archived club" : "outside football");
      return {
        id: `secondary-movement:${movement.id}`,
        label: humanize(movementLabel(movement.type)),
        dateLabel: dateLabel(movement.season, movement.week),
        summary: movement.reason ?? `${fromClub} to ${toClub}`,
        tone: movementTone(movement.type),
      };
    });
}

function decisionSecondaryEvents(
  source: ConsequenceCinemaSource,
  decision: DecisionRecord,
): CareerStorySecondaryEvent[] {
  return decision.consequenceIds
    .map((id) => source.consequenceState.consequences[id])
    .filter(Boolean)
    .sort((left, right) =>
      compareDate(left.resolvedAt ?? left.dueAt, right.resolvedAt ?? right.dueAt)
      || left.id.localeCompare(right.id),
    )
    .slice(0, 3)
    .map((consequence) => ({
      id: `secondary-consequence:${consequence.id}`,
      label: consequence.status === "pending" ? "Still unfolding" : humanize(consequence.status),
      dateLabel: dateLabel(
        (consequence.resolvedAt ?? consequence.dueAt).season,
        (consequence.resolvedAt ?? consequence.dueAt).week,
      ),
      summary: consequence.status === "applied"
        ? "A promised consequence finally caught up with your career."
        : consequence.status === "pending"
          ? "The decision still has a scheduled consequence ahead."
          : `That thread closed as ${humanize(consequence.status).toLowerCase()}.`,
      tone: consequence.status === "applied"
        ? "positive" as const
        : consequence.status === "failed" || consequence.status === "cancelled"
          ? "negative" as const
          : consequence.status === "skipped"
            ? "mixed" as const
            : "neutral" as const,
    }));
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
      movement.fee === undefined ? undefined : `Reported fee: ${formatMoney(movement.fee)}`,
      movement.reason ? `Stated reason: ${movement.reason}` : undefined,
    ].filter((detail): detail is string => Boolean(detail));
    const tone = movementTone(movement.type);

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
          : `${fromClub} to ${toClub} went through and became part of the player's career trail.`,
        details,
      },
      callbackLine: selectCareerStoryCallback(
        source.rootSeed,
        `movement:${movement.id}`,
        "playerMovement",
        tone,
      ),
      secondaryEvents: movementSecondaryEvents(source, movement.playerId, date, movement.id),
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
      const tone = presentation?.tone ?? "neutral";

      return [{
        id: `decision:${decision.id}`,
        kind: "resolvedDecision" as const,
        template: selectCareerStoryTemplate(source.rootSeed, `decision:${decision.id}`, "resolvedDecision"),
        tone,
        season: decision.resolvedAt.season,
        week: decision.resolvedAt.week,
        eyebrow: decision.selectionKind === "default" ? "Deadline decision" : "Career decision",
        title,
        subtitle: `${selected.label} was the line you backed; the fallout is shown below.`,
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
            ?? (fallbackBody || "The decision resolved, but no clear public follow-up reached your file."),
          details: presentation?.details ?? [],
        },
        callbackLine: selectCareerStoryCallback(
          source.rootSeed,
          `decision:${decision.id}`,
          "resolvedDecision",
          tone,
        ),
        secondaryEvents: decisionSecondaryEvents(source, decision),
        ...stakeholder,
      }];
    });
}

function careerMomentTone(moment: CareerMoment): CareerStoryTone {
  if (moment.tone === "positive") return "positive";
  if (moment.tone === "negative") return "negative";
  if (moment.tone === "tense") return "mixed";
  return "neutral";
}

function careerMomentTemplate(
  rootSeed: string,
  moment: CareerMoment,
): CareerStoryTemplate {
  if (moment.category === "farewell") return "farewellLetter";
  if (moment.category === "betrayal" || moment.category === "comeback") return "voicemail";
  if (moment.category === "discovery" || moment.category === "conviction") return "notebook";
  return selectCareerStoryTemplate(rootSeed, `career-moment:${moment.id}`, "careerMoment");
}

function careerMomentStories(source: ConsequenceCinemaSource): CareerStory[] {
  return [...(source.careerMoments ?? [])].map((moment) => {
    const tone = careerMomentTone(moment);
    const stakeholder = moment.playerId
      ? stakeholderRecords(source, relatedDecisionIds(source, moment.playerId), moment.playerId)
      : { memories: [], obligations: [] };
    return {
      id: `career-moment:${moment.id}`,
      kind: "careerMoment" as const,
      template: careerMomentTemplate(source.rootSeed, moment),
      tone,
      season: moment.occurredAt.season,
      week: moment.occurredAt.week,
      eyebrow: humanize(moment.category),
      title: moment.title,
      subtitle: moment.summary,
      playerId: moment.playerId,
      reportId: moment.reportId,
      momentCategory: moment.category,
      original: {
        label: "How it started",
        dateLabel: dateLabel(moment.occurredAt.season, moment.occurredAt.week),
        headline: humanize(moment.source.kind),
        body: `This reel is drawn from your ${humanize(moment.source.kind).toLowerCase()} file and the football world's later response.`,
        details: moment.tags.slice(0, 6).map(humanize),
      },
      outcome: {
        label: moment.magnitude === "careerDefining" ? "Career-defining moment" : "Career moment",
        dateLabel: dateLabel(moment.occurredAt.season, moment.occurredAt.week),
        headline: moment.title,
        body: moment.summary,
        details: moment.stakeholderIds.length > 0
          ? [`${moment.stakeholderIds.length} persistent stakeholder${moment.stakeholderIds.length === 1 ? "" : "s"} connected to this outcome.`]
          : [],
      },
      callbackLine: selectCareerStoryCallback(
        source.rootSeed,
        moment.id,
        "careerMoment",
        tone,
        moment.category,
      ),
      secondaryEvents: [],
      ...stakeholder,
    };
  });
}

function archivedDecisionTone(record: CareerStoryArchiveRecord): CareerStoryTone {
  const valence = record.stakeholderReactions.reduce(
    (sum, reaction) => sum + reaction.valence,
    0,
  );
  if (valence > 20) return "positive";
  if (valence < -20) return "negative";
  if (record.status === "expired" || record.obligations.some((item) => item.status === "breached")) {
    return "mixed";
  }
  return "neutral";
}

function archivedDecisionStories(source: ConsequenceCinemaSource): CareerStory[] {
  const archive = source.careerStoryArchive;
  if (!archive) return [];
  return archive.order.flatMap((recordId) => {
    const record = archive.records[recordId];
    if (!record || source.consequenceState.decisions[record.decisionId]) return [];
    const tone = archivedDecisionTone(record);
    const castName = (entity: EntityRef) => record.cast.find((item) =>
      item.entity.kind === entity.kind && item.entity.id === entity.id,
    )?.label ?? humanize(entity.kind);
    return [{
      id: `decision:${record.decisionId}`,
      kind: "resolvedDecision" as const,
      template: selectCareerStoryTemplate(
        source.rootSeed,
        `archive:${record.decisionId}`,
        "resolvedDecision",
      ),
      tone,
      season: record.terminalAt.season,
      week: record.terminalAt.week,
      eyebrow: record.selectionKind === "default" ? "Deadline decision" : "Career archive",
      title: record.title,
      subtitle: record.selectedOptionLabel
        ? `${record.selectedOptionLabel} stayed on your career file.`
        : "This material decision still lives in your career file.",
      playerId: record.playerId,
      reportId: record.reportId,
      original: {
        label: "Original judgment",
        dateLabel: dateLabel(record.offeredAt.season, record.offeredAt.week),
        headline: record.selectedOptionLabel ?? record.title,
        body: record.status === "expired"
          ? "The deadline passed, so the standing option became the decision."
          : "That course was locked into your career file.",
        details: record.knownTradeoffs,
      },
      outcome: {
        label: "Archived consequence",
        dateLabel: dateLabel(record.terminalAt.season, record.terminalAt.week),
        headline: record.outcomeFacts[0]
          ? humanize(record.outcomeFacts[0].kind)
          : record.status === "expired" ? "Decision expired" : "Decision resolved",
        body: record.outcomeFacts.length > 0
          ? `${record.outcomeFacts.length} outcome note${record.outcomeFacts.length === 1 ? "" : "s"} and ${record.stakeholderReactions.length} stakeholder reaction${record.stakeholderReactions.length === 1 ? "" : "s"} carried forward into the archive.`
          : "The decision and its relationship fallout were carried forward into the archive.",
        details: record.obligations.map((item) => `${item.status}: ${item.terms}`).slice(0, 5),
      },
      memories: record.stakeholderReactions.map((reaction, index) => ({
        id: `${record.id}:reaction:${index}`,
        holder: castName(reaction.stakeholder),
        summary: reaction.tags.map(humanize).join(" · ") || "Remembered the decision",
        intensity: Math.min(100, Math.max(0, Math.abs(reaction.valence))),
        salience: Math.min(100, Math.max(0, record.significance)),
        tone: reaction.valence > 0 ? "positive" as const : reaction.valence < 0 ? "negative" as const : "neutral" as const,
      })),
      obligations: record.obligations.map((obligation) => ({
        id: obligation.id,
        parties: `${castName(obligation.debtor)} → ${castName(obligation.creditor)}`,
        terms: obligation.terms,
        status: obligation.status as Obligation["status"],
        timing: obligation.resolvedAt
          ? dateLabel(obligation.resolvedAt.season, obligation.resolvedAt.week)
          : "Recorded",
        resolution: obligation.resolutionNote,
      })),
      callbackLine: selectCareerStoryCallback(
        source.rootSeed,
        `archive:${record.decisionId}`,
        "resolvedDecision",
        tone,
      ),
      secondaryEvents: [],
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
    ...archivedDecisionStories(source),
    ...careerMomentStories(source),
  ]
    .sort((left, right) =>
      right.season - left.season
      || right.week - left.week
      || left.id.localeCompare(right.id),
    )
    .slice(0, Math.max(0, limit));
}
