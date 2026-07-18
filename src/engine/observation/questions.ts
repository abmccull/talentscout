import type {
  ActivityType,
  Observation,
  ReflectionJournalEntry,
  Scout,
  ScoutingQuestionId,
} from "@/engine/core/types";
import type {
  ContextualScoutingQuestion,
  ObservationExperienceSnapshot,
  ObservationOpponentContext,
  ObservationSession,
  ObservationSignalAssessment,
  SessionPlayer,
} from "@/engine/observation/types";
import type { ObservationSituationSnapshot } from "@/engine/observation/situations";

const QUESTION_IDS = [
  "execution",
  "decisions",
  "movement",
  "pressure",
  "repeatability",
  "projection",
] as const satisfies readonly ScoutingQuestionId[];

type RoleGroup =
  | "goalkeeper"
  | "centreBack"
  | "fullBack"
  | "holdingMidfielder"
  | "creativeMidfielder"
  | "wideAttacker"
  | "striker";

const ROLE_QUESTION_SCORES: Record<RoleGroup, Record<ScoutingQuestionId, number>> = {
  goalkeeper: { execution: 18, decisions: 24, movement: 16, pressure: 22, repeatability: 12, projection: 8 },
  centreBack: { execution: 10, decisions: 24, movement: 20, pressure: 18, repeatability: 14, projection: 8 },
  fullBack: { execution: 16, decisions: 18, movement: 24, pressure: 12, repeatability: 20, projection: 10 },
  holdingMidfielder: { execution: 14, decisions: 24, movement: 22, pressure: 18, repeatability: 10, projection: 12 },
  creativeMidfielder: { execution: 22, decisions: 24, movement: 18, pressure: 14, repeatability: 8, projection: 14 },
  wideAttacker: { execution: 22, decisions: 14, movement: 24, pressure: 12, repeatability: 16, projection: 14 },
  striker: { execution: 24, decisions: 14, movement: 24, pressure: 16, repeatability: 12, projection: 12 },
};

const ROLE_ANGLES: Record<RoleGroup, Record<ScoutingQuestionId, string>> = {
  goalkeeper: {
    execution: "Watch whether handling and distribution stay clean when the next action is rushed.",
    decisions: "Track starting position, scanning, and the choice to hold, sweep, or release.",
    movement: "Judge whether the goalkeeper's position keeps the goal and the space behind the line protected.",
    pressure: "Watch the response to traffic, a difficult delivery, or an error.",
    repeatability: "Check whether footwork and set position remain consistent late in the session.",
    projection: "Identify the goalkeeping habit most likely to survive a faster level.",
  },
  centreBack: {
    execution: "Watch first contact, tackling technique, and the quality of the first pass out.",
    decisions: "Track when the defender holds the line, steps out, or protects depth.",
    movement: "Watch spacing with the partner and movement when the ball changes sides.",
    pressure: "Judge the next action after a duel, mistake, or direct run at the back line.",
    repeatability: "Check whether duels, recovery runs, and body shape hold across repeated attacks.",
    projection: "Identify which defensive habit could translate when the space and pace increase.",
  },
  fullBack: {
    execution: "Watch the first touch, crossing action, and tackle technique near the touchline.",
    decisions: "Track the choice to overlap, hold, invert, or protect the space behind.",
    movement: "Follow the player's width, recovery route, and timing around the winger.",
    pressure: "Watch the response when isolated or forced to defend while retreating.",
    repeatability: "Check whether high-intensity runs and recovery positioning survive the full session.",
    projection: "Identify whether the player's strongest flank habit can carry into a more demanding role.",
  },
  holdingMidfielder: {
    execution: "Watch receiving shape and the first pass when opponents close from behind.",
    decisions: "Track scanning, risk selection, and which danger the player chooses to remove first.",
    movement: "Follow how the player protects passing lanes and offers an exit behind the press.",
    pressure: "Watch the next decision after contact, a turnover, or a teammate's mistake.",
    repeatability: "Check whether positioning and defensive coverage remain disciplined as space opens.",
    projection: "Identify the midfield habit most likely to survive less time and more tactical responsibility.",
  },
  creativeMidfielder: {
    execution: "Watch first touch, pass weight, and technique when the receiving angle is imperfect.",
    decisions: "Track scanning and whether the player sees the next pass before the ball arrives.",
    movement: "Follow how the player creates a passing lane between and beyond opponents.",
    pressure: "Watch whether contact, crowding, or a failed action changes the next choice.",
    repeatability: "Check whether creative actions remain available after the game loses its early rhythm.",
    projection: "Identify the creative tool that could still work when space disappears faster.",
  },
  wideAttacker: {
    execution: "Watch the touch at speed and the final action after creating separation.",
    decisions: "Track the choice to drive, combine, cross, or recycle before the lane closes.",
    movement: "Follow runs behind, inside, and away from the ball rather than only actions in possession.",
    pressure: "Watch the response after being crowded out, tackled, or denied the preferred side.",
    repeatability: "Check whether explosive actions and recovery runs remain available late on.",
    projection: "Identify which one-versus-one or movement tool can translate against quicker defenders.",
  },
  striker: {
    execution: "Watch the first contact and finishing action when the chance is rushed or awkward.",
    decisions: "Track the choice to run, pin, drop, or release a teammate before receiving.",
    movement: "Follow blind-side runs, separation from centre-backs, and the timing of changes in direction.",
    pressure: "Watch the next action after a missed chance, heavy contact, or a long quiet spell.",
    repeatability: "Check whether pressing, duels, and penalty-area movement repeat late in the match.",
    projection: "Identify the attacking habit most likely to survive stronger and more organised defenders.",
  },
};

const FRAME_SCORES: Record<
  ObservationSituationSnapshot["tacticalFrame"],
  Partial<Record<ScoutingQuestionId, number>>
> = {
  unstructured: { execution: 12, projection: 8, decisions: -4 },
  direct: { pressure: 10, repeatability: 10, movement: 6 },
  transitionHeavy: { movement: 12, decisions: 8, repeatability: 8 },
  possession: { decisions: 12, movement: 10, execution: 8 },
  pressing: { decisions: 12, pressure: 12, execution: 8 },
  structured: { decisions: 10, movement: 10, projection: 6 },
};

function roleGroup(player: Pick<SessionPlayer, "position" | "naturalRole">): RoleGroup {
  const role = player.naturalRole;
  if (role === "shotStopper" || role === "sweeper" || player.position === "GK") return "goalkeeper";
  if (role === "ballPlayingDefender" || role === "noNonsenseCB" || role === "libero" || player.position === "CB") return "centreBack";
  if (role === "fullBack" || role === "wingBack" || role === "invertedFullBack" || player.position === "LB" || player.position === "RB") return "fullBack";
  if (role === "anchorMan" || role === "halfBack" || role === "deepLyingPlaymaker" || player.position === "CDM") return "holdingMidfielder";
  if (role === "winger" || role === "invertedWinger" || role === "insideForward" || player.position === "LW" || player.position === "RW") return "wideAttacker";
  if (role === "poacher" || role === "targetMan" || role === "advancedForward" || role === "pressingForward" || player.position === "ST") return "striker";
  return "creativeMidfielder";
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, places = 2): number {
  const multiplier = 10 ** places;
  return Math.round(value * multiplier) / multiplier;
}

function hashUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function contextScore(
  questionId: ScoutingQuestionId,
  situation: ObservationSituationSnapshot | undefined,
  opponent: ObservationOpponentContext | undefined,
): number {
  let score = situation ? FRAME_SCORES[situation.tacticalFrame][questionId] ?? 0 : 0;
  if (situation?.stakes === "selection" || situation?.stakes === "careerDefining") {
    if (questionId === "pressure") score += 12;
    if (questionId === "decisions") score += 5;
  }
  if (situation?.stakes === "knockout" && (questionId === "pressure" || questionId === "repeatability")) {
    score += 8;
  }
  if (opponent?.relativeStrength === "stronger") {
    if (questionId === "decisions" || questionId === "pressure") score += 10;
    if (questionId === "projection") score += 6;
  }
  if (opponent?.familiarity === "unfamiliar" && (questionId === "decisions" || questionId === "pressure")) {
    score += 5;
  }
  if (opponent?.tacticalFrame) {
    score += FRAME_SCORES[opponent.tacticalFrame][questionId] ?? 0;
  }
  return score;
}

function contextAngle(
  situation: ObservationSituationSnapshot | undefined,
  opponent: ObservationOpponentContext | undefined,
): string {
  const opponentName = opponent?.name ?? "this opponent";
  if (opponent?.relativeStrength === "stronger") {
    return `${opponentName} should reduce time and space, making this a useful translation test.`;
  }
  if (situation?.tacticalFrame === "pressing") {
    return "The pressing shape should reveal which actions survive when time closes quickly.";
  }
  if (situation?.tacticalFrame === "transitionHeavy") {
    return "Frequent transitions should expose choices and recovery habits on both sides of the ball.";
  }
  if (situation?.stakes === "selection" || situation?.stakes === "careerDefining") {
    return "Selection pressure makes the response to mistakes and uncertainty especially informative.";
  }
  if (situation?.tacticalFrame === "possession") {
    return "Longer possession phases should make scanning, spacing, and repeatable technique easier to compare.";
  }
  if (situation?.tacticalFrame === "unstructured") {
    return "The loose structure may reveal instinct and technique, but tactical conclusions should remain cautious.";
  }
  return "Use this setting to gather one clear comparison rather than trying to settle the whole player.";
}

function priorQuestionCount(
  context: ObservationExperienceSnapshot | undefined,
  questionId: ScoutingQuestionId,
): number {
  return context?.priorQuestionIds?.filter((candidate) => candidate === questionId).length ?? 0;
}

export interface BuildObservationExperienceSnapshotInput {
  scout: Pick<Scout, "skills">;
  playerId: string;
  observations: readonly Observation[];
  reflectionEntries?: readonly ReflectionJournalEntry[];
  regionalKnowledgeLevel?: number;
  openQuestionIds?: readonly ScoutingQuestionId[];
}

/** Build the player-safe session snapshot from existing canonical records. */
export function buildObservationExperienceSnapshot(
  input: BuildObservationExperienceSnapshotInput,
): ObservationExperienceSnapshot {
  const observations = input.observations.filter((observation) =>
    observation.playerId === input.playerId,
  );
  const reflectionEntries = (input.reflectionEntries ?? []).filter((entry) =>
    entry.playerIds.includes(input.playerId),
  );
  const priorQuestionIds = reflectionEntries.flatMap((entry) =>
    entry.scoutingQuestionId ? [entry.scoutingQuestionId] : [],
  );
  const cards = reflectionEntries.flatMap((entry) =>
    (entry.evidenceCards ?? []).filter((card) => card.playerId === input.playerId),
  );
  const readingConfidences = observations.flatMap((observation) =>
    observation.attributeReadings.map((reading) => reading.confidence),
  );
  const qualitySamples = [
    ...readingConfidences,
    ...cards.map((card) => card.confidence),
  ];
  const priorEvidenceQuality = qualitySamples.length > 0
    ? qualitySamples.reduce((sum, value) => sum + value, 0) / qualitySamples.length
    : 0;
  const judgment = input.scout.skills.playerJudgment ?? 1;
  const blendedSkill = (primary: number | undefined) =>
    round(clamp(((primary ?? 1) + judgment) / 2, 1, 20));
  const priorContextKeys = [...new Set(observations.map((observation) =>
    observation.situation?.repetitionKey ?? `context:${observation.context}`,
  ))];

  return {
    skillByQuestion: {
      execution: blendedSkill(input.scout.skills.technicalEye),
      decisions: blendedSkill(input.scout.skills.tacticalUnderstanding),
      movement: blendedSkill(input.scout.skills.tacticalUnderstanding),
      pressure: blendedSkill(input.scout.skills.psychologicalRead),
      repeatability: blendedSkill(input.scout.skills.physicalAssessment),
      projection: blendedSkill(input.scout.skills.potentialAssessment),
    },
    regionalKnowledgeLevel: clamp(input.regionalKnowledgeLevel ?? 0, 0, 100),
    priorObservationCount: observations.length,
    priorIndependentContextCount: priorContextKeys.length,
    priorEvidenceQuality: round(clamp(priorEvidenceQuality, 0, 1)),
    priorQuestionIds,
    openQuestionIds: [...new Set(input.openQuestionIds ?? [])],
    priorContextKeys,
  };
}

export interface BuildContextualScoutingQuestionsInput {
  player: Pick<SessionPlayer, "playerId" | "position" | "naturalRole">;
  activityType: ActivityType;
  situation?: ObservationSituationSnapshot;
  opponent?: ObservationOpponentContext;
  observer?: ObservationExperienceSnapshot;
}

/**
 * Rank contextual angles around the canonical question ids. The result plans
 * attention only; it does not create evidence or write a report judgment.
 */
export function buildContextualScoutingQuestions(
  input: BuildContextualScoutingQuestionsInput,
): ContextualScoutingQuestion[] {
  const group = roleGroup(input.player);
  const observer = input.observer;
  const contextText = contextAngle(input.situation, input.opponent);
  const openQuestions = new Set(observer?.openQuestionIds ?? []);

  const ranked = QUESTION_IDS.map((questionId, order) => {
    const repeats = priorQuestionCount(observer, questionId);
    const skill = clamp(observer?.skillByQuestion?.[questionId] ?? 10, 1, 20);
    const regionalKnowledge = clamp(observer?.regionalKnowledgeLevel ?? 50, 0, 100);
    let score = 35
      + ROLE_QUESTION_SCORES[group][questionId]
      + contextScore(questionId, input.situation, input.opponent)
      + (skill - 10) * 0.45
      - Math.min(18, repeats * 7);

    if (openQuestions.has(questionId)) score += 24;
    if ((observer?.priorObservationCount ?? 0) === 0 && questionId === "projection") score += 5;
    if ((observer?.priorObservationCount ?? 0) >= 2 && questionId === "repeatability") score += 6;
    if ((observer?.priorEvidenceQuality ?? 0.5) < 0.45 && (questionId === "repeatability" || questionId === "pressure")) score += 5;
    if (questionId === "projection") score += (regionalKnowledge - 50) * 0.08;

    const reasonParts = [
      `The player's role makes this a relevant line of inquiry.`,
      contextText,
    ];
    if (openQuestions.has(questionId)) {
      reasonParts.unshift("This directly tests an uncertainty already open on the case.");
    } else if (repeats > 0) {
      reasonParts.push("You have asked this before, so a different context is needed to add value.");
    }

    return {
      option: {
        id: questionId,
        score: Math.round(clamp(score)),
        recommended: false,
        roleAngle: ROLE_ANGLES[group][questionId],
        contextAngle: contextText,
        prompt: `${ROLE_ANGLES[group][questionId]} ${contextText}`,
        reason: reasonParts.join(" "),
      } satisfies ContextualScoutingQuestion,
      order,
    };
  }).sort((left, right) => right.option.score - left.option.score || left.order - right.order);

  return ranked.map(({ option }, index) => ({ ...option, recommended: index === 0 }));
}

export function getRecommendedContextualQuestion(
  input: BuildContextualScoutingQuestionsInput,
): ContextualScoutingQuestion {
  return buildContextualScoutingQuestions(input)[0];
}

const CLARITY_VALUE: Record<NonNullable<ObservationSession["cueReadings"]>[number]["clarity"], number> = {
  missed: 0.08,
  glimpse: 0.32,
  usable: 0.58,
  strong: 0.78,
  exceptional: 0.94,
};

/**
 * Resolve whether the player earned a clear read, a weak lead, or no usable
 * signal. It consumes only player-visible cues and knowledge snapshots.
 */
export function resolveObservationSignalAssessment(
  session: ObservationSession,
): ObservationSignalAssessment {
  const flaggedIds = new Set(session.flaggedMoments.map((flagged) => flagged.moment.id));
  const cues = (session.cueReadings ?? []).filter((cue) => flaggedIds.has(cue.momentId));
  const decisions = session.evidenceDecisions ?? {};
  const noConclusionCount = cues.filter((cue) =>
    decisions[cue.id]?.classification === "noConclusion",
  ).length;
  const usableCues = cues.filter((cue) =>
    cue.clarity !== "missed"
    && cue.clarity !== "glimpse"
    && decisions[cue.id]?.classification !== "noConclusion",
  );
  const observer = session.observerContext;
  const currentContextKey = session.situation?.repetitionKey ?? session.activityType;
  const priorContextKeys = observer?.priorContextKeys ?? [];
  const contextChanged = priorContextKeys.length > 0 && !priorContextKeys.includes(currentContextKey);
  const comparisonReady = (observer?.priorObservationCount ?? 0) > 0
    && contextChanged
    && usableCues.length > 0;

  if (cues.length === 0) {
    return {
      outcome: "noSignal",
      score: 0,
      cueCount: 0,
      usableCueCount: 0,
      comparisonReady: false,
      contextChanged,
      summary: "The session did not produce a cue you can defend yet.",
      reasons: [
        "No flagged passage produced a saved cue.",
        "A quiet watch is information too: keep the question open and change the next test.",
      ],
    };
  }

  const averageConfidence = cues.reduce((sum, cue) => sum + cue.confidence, 0) / cues.length;
  const averageClarity = cues.reduce((sum, cue) => sum + CLARITY_VALUE[cue.clarity], 0) / cues.length;
  const usableRatio = usableCues.length / cues.length;
  const selectedQuestion = session.scoutingQuestionId ?? cues[0]?.questionId;
  const questionSkill = selectedQuestion
    ? clamp(observer?.skillByQuestion?.[selectedQuestion] ?? 10, 1, 20)
    : 10;
  const regionalKnowledge = clamp(observer?.regionalKnowledgeLevel ?? 50, 0, 100);
  const priorEvidenceQuality = clamp(observer?.priorEvidenceQuality ?? 0.5, 0, 1);
  const uncertaintyPenalty = Math.max(0, (session.situation?.uncertaintyMultiplier ?? 1) - 1) * 0.16;
  const misleadingRiskPenalty = (session.situation?.misleadingSignalRisk ?? 0.12) * 0.12;
  const classificationPenalty = (noConclusionCount / cues.length) * 0.34;
  const boundedUncertainty = (hashUnit(`${session.id}:${selectedQuestion ?? "unasked"}:signal`) - 0.5) * 0.16;
  const score = clamp(
    averageConfidence * 0.5
      + averageClarity * 0.25
      + usableRatio * 0.2
      + (questionSkill - 10) * 0.004
      + (regionalKnowledge - 50) * 0.001
      + (priorEvidenceQuality - 0.5) * 0.06
      + (comparisonReady ? 0.04 : 0)
      - uncertaintyPenalty
      - misleadingRiskPenalty
      - classificationPenalty
      + boundedUncertainty,
    0,
    1,
  );
  const allMissed = cues.every((cue) => cue.clarity === "missed");
  const allWithheld = noConclusionCount === cues.length;
  const outcome = allMissed || allWithheld || (score < 0.3 && usableCues.length === 0)
    ? "noSignal"
    : score >= 0.62 && usableCues.length > 0
      ? "clear"
      : "weak";
  const reasons = [
    `${usableCues.length} of ${cues.length} saved cue${cues.length === 1 ? "" : "s"} reached a usable clarity level.`,
    contextChanged
      ? "The setting differs from the prior evidence, so the comparison adds context rather than repetition."
      : priorContextKeys.length > 0
        ? "The setting repeats an existing context, so apparent agreement carries less new weight."
        : "This is the first stored context for the question.",
  ];
  if (noConclusionCount > 0) {
    reasons.push(`${noConclusionCount} cue${noConclusionCount === 1 ? " was" : "s were"} deliberately left without a conclusion.`);
  }
  if ((session.situation?.uncertaintyMultiplier ?? 1) > 1.12) {
    reasons.push("The visible match conditions made clean interpretation harder.");
  }
  if (observer?.regionalKnowledgeLevel !== undefined && regionalKnowledge < 35) {
    reasons.push("Your regional reference base is still thin, so comparisons remain cautious.");
  }

  return {
    outcome,
    score: round(score),
    cueCount: cues.length,
    usableCueCount: usableCues.length,
    comparisonReady,
    contextChanged,
    summary: outcome === "clear"
      ? "You have a defensible lead to compare with the rest of the case, not proof of the player's future."
      : outcome === "weak"
        ? "The session produced a lead, but the signal is too fragile to carry the case by itself."
        : "The session did not settle the question; change the context or source before making the claim.",
    reasons,
  };
}
