import type {
  EvidenceClassificationId,
  EvidenceConfidenceBand,
  InitialAssessmentInput,
  JudgmentCategory,
  ObservationHalftimeApproach,
  ReportRiskAssessment,
  ReportRecommendedAction,
  Scout,
  ScoutCueReading,
  ScoutSkill,
  ScoutingEvidenceCard,
  ScoutingQuestionId,
  StructuredScoutingAssessment,
  StructuredScoutingClaim,
  StructuredScoutingNextTest,
  StructuredScoutingUnknown,
  StructuredReportInput,
  YouthReportRiskId,
} from "@/engine/core/types";
import type {
  LensType,
  ObservationSession,
  PlayerMoment,
} from "@/engine/observation/types";

export interface ScoutingQuestionDefinition {
  id: ScoutingQuestionId;
  label: string;
  prompt: string;
  matchFocus: string;
  lens: LensType;
  primarySkill: ScoutSkill;
  secondarySkill: ScoutSkill;
  classifications: EvidenceClassificationId[];
  momentTypes: PlayerMoment["momentType"][];
}

export const SCOUTING_QUESTIONS: readonly ScoutingQuestionDefinition[] = [
  {
    id: "execution",
    label: "Can the technique hold up?",
    prompt: "Watch body shape, first touch, weight of pass, and execution under pressure.",
    matchFocus: "Technical execution",
    lens: "technical",
    primarySkill: "technicalEye",
    secondarySkill: "playerJudgment",
    classifications: ["technicalExecution", "pressureResponse"],
    momentTypes: ["technicalAction"],
  },
  {
    id: "decisions",
    label: "How quickly does the player read danger?",
    prompt: "Look for scanning, option selection, and decisions made before receiving.",
    matchFocus: "Speed of decision",
    lens: "tactical",
    primarySkill: "tacticalUnderstanding",
    secondarySkill: "playerJudgment",
    classifications: ["preReceiveDecision", "pressureResponse"],
    momentTypes: ["tacticalDecision", "mentalResponse"],
  },
  {
    id: "movement",
    label: "Does the player find useful space?",
    prompt: "Track off-ball movement, timing, spacing, and role discipline.",
    matchFocus: "Off-ball movement",
    lens: "tactical",
    primarySkill: "tacticalUnderstanding",
    secondarySkill: "playerJudgment",
    classifications: ["offBallMovement", "preReceiveDecision"],
    momentTypes: ["tacticalDecision"],
  },
  {
    id: "pressure",
    label: "What changes when pressure arrives?",
    prompt: "Watch the next action after contact, mistakes, setbacks, and rushed moments.",
    matchFocus: "Response to pressure",
    lens: "mental",
    primarySkill: "psychologicalRead",
    secondarySkill: "playerJudgment",
    classifications: ["pressureResponse", "preReceiveDecision"],
    momentTypes: ["mentalResponse", "characterReveal"],
  },
  {
    id: "repeatability",
    label: "Can the player repeat the action?",
    prompt: "Separate one explosive moment from balance, recovery, and late-session repeatability.",
    matchFocus: "Physical repeatability",
    lens: "physical",
    primarySkill: "physicalAssessment",
    secondarySkill: "playerJudgment",
    classifications: ["physicalRepeatability", "pressureResponse"],
    momentTypes: ["physicalTest"],
  },
  {
    id: "projection",
    label: "What might translate to the next level?",
    prompt: "Look for one transferable tool and the conditions still needed to test it.",
    matchFocus: "Development projection",
    lens: "general",
    primarySkill: "potentialAssessment",
    secondarySkill: "playerJudgment",
    classifications: ["technicalExecution", "offBallMovement", "anomaly"],
    momentTypes: [
      "technicalAction",
      "physicalTest",
      "mentalResponse",
      "tacticalDecision",
      "characterReveal",
    ],
  },
] as const;

const CLARITY_ORDER = ["missed", "glimpse", "usable", "strong", "exceptional"] as const;

const CLASSIFICATION_LABELS: Record<EvidenceClassificationId, string> = {
  technicalExecution: "technical execution",
  preReceiveDecision: "pre-receive decision",
  offBallMovement: "off-ball movement",
  pressureResponse: "response to pressure",
  physicalRepeatability: "physical repeatability",
  anomaly: "an unusual signal",
  noConclusion: "no reliable conclusion",
};

const CONFIDENCE_VALUE: Record<EvidenceConfidenceBand, number> = {
  tentative: 0.3,
  working: 0.5,
  supported: 0.7,
  robust: 0.85,
};

const RECOMMENDATION_LABEL: Record<ReportRecommendedAction, string> = {
  monitor: "Keep the name private and arrange another look",
  inviteForTrial: "Test the read in a more demanding context",
  offerAcademyPlace: "Escalate the player to the recruitment team now",
};

const MOMENT_CLASSIFICATION: Record<PlayerMoment["momentType"], EvidenceClassificationId> = {
  technicalAction: "technicalExecution",
  physicalTest: "physicalRepeatability",
  mentalResponse: "pressureResponse",
  tacticalDecision: "preReceiveDecision",
  characterReveal: "pressureResponse",
};

function clamp(value: number, low = 0, high = 1): number {
  return Math.max(low, Math.min(high, value));
}

function round(value: number, places = 3): number {
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

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function questionDefinition(questionId: ScoutingQuestionId): ScoutingQuestionDefinition {
  return SCOUTING_QUESTIONS.find((question) => question.id === questionId)
    ?? SCOUTING_QUESTIONS[0];
}

function cueClarity(score: number): ScoutCueReading["clarity"] {
  if (score < 0.28) return "missed";
  if (score < 0.44) return "glimpse";
  if (score < 0.62) return "usable";
  if (score < 0.78) return "strong";
  return "exceptional";
}

function confidenceBand(confidence: number): EvidenceConfidenceBand {
  if (confidence < 0.38) return "tentative";
  if (confidence < 0.58) return "working";
  if (confidence < 0.76) return "supported";
  return "robust";
}

function directionForMoment(moment: PlayerMoment): ScoutCueReading["direction"] {
  if (moment.quality >= 7 || moment.isStandout) return "positive";
  if (moment.quality <= 4) return "negative";
  return "mixed";
}

function activeLensForPhase(
  session: ObservationSession,
  playerId: string,
  phaseIndex: number,
): LensType {
  const player = session.players.find((candidate) => candidate.playerId === playerId);
  if (!player) return "general";
  return player.focusHistory
    .filter((entry) => entry.phaseIndex <= phaseIndex)
    .sort((left, right) => right.phaseIndex - left.phaseIndex)[0]?.lens
    ?? player.currentLens
    ?? "general";
}

function halftimeAdjustment(
  approach: ObservationHalftimeApproach | undefined,
  phaseIndex: number,
  halftimeIndex: number,
  aligned: boolean,
  direction: ScoutCueReading["direction"],
): number {
  if (!approach || phaseIndex <= halftimeIndex) return 0;
  if (approach === "confirm") return aligned ? 0.05 : -0.01;
  if (approach === "challenge") return direction !== "positive" ? 0.06 : -0.01;
  return aligned ? 0 : 0.05;
}

function regionalContextLabel(knowledgeLevel: number, countryId?: string): string {
  const place = countryId ? ` in ${countryId}` : " in this football environment";
  if (knowledgeLevel >= 75) {
    return `Your strong local reference base${place} helps you compare the context, not predict the player's future.`;
  }
  if (knowledgeLevel >= 45) {
    return `Your working local knowledge${place} gives this cue a useful reference point.`;
  }
  if (knowledgeLevel > 0) {
    return `Your local reference base${place} is still limited, so the comparison remains provisional.`;
  }
  return `You do not yet have a reliable local reference base${place}; avoid treating unfamiliar context as player weakness.`;
}

function cueText(
  moment: PlayerMoment,
  clarity: ScoutCueReading["clarity"],
  classification: EvidenceClassificationId,
): Pick<ScoutCueReading, "summary" | "detail"> {
  const label = CLASSIFICATION_LABELS[classification];
  if (clarity === "missed") {
    return {
      summary: "No clean read",
      detail: `${moment.vagueDescription} You could not isolate a defensible cue from this passage.`,
    };
  }
  if (clarity === "glimpse") {
    return {
      summary: `Possible ${label}`,
      detail: `${moment.vagueDescription} There may be a ${label} signal here, but the view was incomplete.`,
    };
  }
  const qualifier = clarity === "usable"
    ? "This is a usable first-hand cue, not yet a pattern."
    : clarity === "strong"
      ? "The action is clear enough to support a working claim, but it still needs another context."
      : "This was an unusually clear cue. It remains one passage of play rather than proof of a repeatable trait.";
  return {
    summary: `${clarity === "exceptional" ? "Exceptional" : clarity === "strong" ? "Strong" : "Usable"} ${label}`,
    detail: `${moment.description} ${qualifier}`,
  };
}

export interface ResolveSessionCueInput {
  session: ObservationSession;
  scout: Pick<Scout, "skills" | "attributes" | "fatigue">;
  questionId: ScoutingQuestionId;
  regionalKnowledgeLevel?: number;
}

/** Resolve every live cue from the same seed and player actions. */
export function resolveSessionCueReadings(input: ResolveSessionCueInput): ScoutCueReading[] {
  const definition = questionDefinition(input.questionId);
  const regionalKnowledge = clamp(input.regionalKnowledgeLevel ?? 0, 0, 100);
  const halftimeIndex = input.session.phases.findIndex((phase) => phase.isHalfTime);
  const readings: ScoutCueReading[] = [];

  for (const phase of input.session.phases) {
    for (const moment of phase.moments) {
      const player = input.session.players.find((candidate) => candidate.playerId === moment.playerId);
      const focused = player?.focusedPhases.includes(phase.index) ?? false;
      const lens = activeLensForPhase(input.session, moment.playerId, phase.index);
      const aligned = definition.momentTypes.includes(moment.momentType);
      const domainSkill = ((input.scout.skills?.[definition.primarySkill] ?? 1) / 20) * 0.23;
      const judgment = ((input.scout.skills?.[definition.secondarySkill] ?? 1) / 20) * 0.12;
      const focus = focused ? 0.15 + (lens === definition.lens || lens === "general" ? 0.06 : 0) : -0.12;
      const questionAlignment = aligned ? 0.15 : -0.03;
      const eventSignal = (moment.quality / 10) * 0.15 + (moment.isStandout ? 0.08 : 0);
      const regionalContext = (regionalKnowledge - 30) / 700;
      const fatigue = -(clamp(input.scout.fatigue ?? 0, 0, 100) / 100) * 0.18;
      const conditions = -(input.session.venueAtmosphere?.chaosLevel ?? 0) * 0.1;
      const direction = directionForMoment(moment);
      const halftime = halftimeAdjustment(
        input.session.halftimeApproach,
        phase.index,
        halftimeIndex,
        aligned,
        direction,
      );
      const uncertainty = (hashUnit(`${input.session.id}:${moment.id}:${input.questionId}`) - 0.5) * 0.16;
      const intuitionSpark = moment.isStandout
        ? ((input.scout.attributes?.intuition ?? 1) / 20) * hashUnit(`${moment.id}:spark`) * 0.05
        : 0;
      const score = clamp(
        0.05
        + domainSkill
        + judgment
        + focus
        + questionAlignment
        + eventSignal
        + regionalContext
        + fatigue
        + conditions
        + halftime
        + uncertainty
        + intuitionSpark,
      );
      const clarity = cueClarity(score);
      const confidence = clamp(score * 0.86 + Math.min(0.04, regionalKnowledge / 2500), 0.12, 0.88);
      const primaryClassification = aligned
        ? definition.classifications[0]
        : MOMENT_CLASSIFICATION[moment.momentType];
      const text = cueText(moment, clarity, primaryClassification);
      const attributeLimit = clarity === "exceptional" ? 3 : clarity === "strong" ? 2 : clarity === "usable" ? 1 : 0;

      readings.push({
        id: `cue:${input.session.id}:${moment.id}`,
        sessionId: input.session.id,
        momentId: moment.id,
        playerId: moment.playerId,
        phaseIndex: phase.index,
        minute: phase.minute,
        questionId: input.questionId,
        lens,
        clarity,
        score: round(score),
        confidence: round(confidence),
        confidenceBand: confidenceBand(confidence),
        direction,
        summary: text.summary,
        detail: text.detail,
        suggestedClassifications: unique([
          primaryClassification,
          ...definition.classifications,
          "anomaly" as const,
          "noConclusion" as const,
        ]).slice(0, 4),
        attributesHinted: moment.attributesHinted.slice(0, attributeLimit),
        pressureContext: moment.pressureContext,
        contextKey: input.session.situation?.repetitionKey ?? input.session.activityType,
        countryId: input.session.countryId,
        regionalContext: regionalContextLabel(regionalKnowledge, input.session.countryId),
        factors: {
          domainSkill: round(domainSkill),
          judgment: round(judgment),
          focus: round(focus),
          questionAlignment: round(questionAlignment),
          eventSignal: round(eventSignal + halftime + intuitionSpark),
          regionalContext: round(regionalContext),
          fatigue: round(fatigue),
          conditions: round(conditions),
          boundedUncertainty: round(uncertainty),
        },
      });
    }
  }

  return readings;
}

/** Convert flagged cue reads into durable evidence cards. */
export function buildSessionEvidenceCards(session: ObservationSession): ScoutingEvidenceCard[] {
  const cueByMoment = new Map((session.cueReadings ?? []).map((cue) => [cue.momentId, cue]));
  return session.flaggedMoments.flatMap((flagged) => {
    const cue = cueByMoment.get(flagged.moment.id);
    if (!cue) return [];
    const decision = session.evidenceDecisions?.[cue.id];
    const classification = decision?.classification
      ?? (cue.clarity === "missed" ? "noConclusion" : cue.suggestedClassifications[0]);
    return [{
      ...cue,
      version: 1 as const,
      sourceType: "liveObservation" as const,
      classification,
      independenceKey: `session:${session.id}:${cue.playerId}:${classification}`,
    }];
  });
}

export interface EvidenceClaimOption {
  id: string;
  label: string;
  statement: string;
  category: JudgmentCategory;
  support: StructuredScoutingClaim["support"];
  classification: EvidenceClassificationId;
}

function categoryForClassification(classification: EvidenceClassificationId): JudgmentCategory {
  if (classification === "preReceiveDecision" || classification === "offBallMovement") return "roleFit";
  if (classification === "pressureResponse") return "characterRisk";
  return "potential";
}

function measuredClaim(classification: EvidenceClassificationId): string {
  switch (classification) {
    case "technicalExecution": return "The action supports a working read of clean technical execution at this level.";
    case "preReceiveDecision": return "The player appeared to prepare the decision before receiving the ball.";
    case "offBallMovement": return "The movement created a useful passing option before the space became obvious.";
    case "pressureResponse": return "The response to pressure was composed in this specific moment.";
    case "physicalRepeatability": return "The action showed useful physical control, but repeatability remains untested.";
    case "anomaly": return "The passage was unusual enough to justify a deliberate second look.";
    case "noConclusion": return "This passage does not support a stable football conclusion.";
  }
}

function stretchClaim(classification: EvidenceClassificationId): string {
  switch (classification) {
    case "technicalExecution": return "The player may possess a repeatable technical advantage over this level.";
    case "preReceiveDecision": return "The player may process the game earlier than peers in the same age group.";
    case "offBallMovement": return "The player may have advanced spatial awareness that will translate across roles.";
    case "pressureResponse": return "The player may have an unusually resilient mentality under sustained pressure.";
    case "physicalRepeatability": return "The player's physical tools may already translate to a higher competitive level.";
    case "anomaly": return "The unusual passage may be an early sign of exceptional upside.";
    case "noConclusion": return "The absence of a clear signal may conceal a late-developing strength.";
  }
}

export function getEvidenceClaimOptions(card: ScoutingEvidenceCard): EvidenceClaimOption[] {
  const category = categoryForClassification(card.classification);
  return [
    {
      id: `claim:${card.id}:measured`,
      label: "Make the measured read",
      statement: measuredClaim(card.classification),
      category,
      support: card.classification === "noConclusion" ? "withheld" : "supported",
      classification: card.classification,
    },
    {
      id: `claim:${card.id}:stretch`,
      label: "Back the stronger interpretation",
      statement: stretchClaim(card.classification),
      category,
      support: "stretch",
      classification: card.classification,
    },
    {
      id: `claim:${card.id}:withhold`,
      label: "Record it without a conclusion",
      statement: "The passage is worth retaining, but it does not yet support a reportable trait claim.",
      category,
      support: "withheld",
      classification: "noConclusion",
    },
  ];
}

export interface EvidenceUnknownOption {
  id: string;
  category: JudgmentCategory;
  label: string;
  statement: string;
  recommendedQuestionId: ScoutingQuestionId;
  activityType: StructuredScoutingNextTest["activityType"];
  contextRequirement: string;
}

export interface FormalUnknownOption {
  id: string;
  label: string;
  statement: string;
  questionId: ScoutingQuestionId;
  contextRequirement: string;
}

export const FORMAL_CATEGORY_UNKNOWN_OPTIONS: Record<
  JudgmentCategory,
  readonly FormalUnknownOption[]
> = {
  potential: [
    {
      id: "formal-unknown:potential:repeatability",
      label: "You have only seen this once",
      statement: "You have only seen this development cue once, so it may not hold against different opposition.",
      questionId: "projection",
      contextRequirement: "A second live setting with different opposition and development demands.",
    },
    {
      id: "formal-unknown:potential:physical",
      label: "Physical growth remains uncertain",
      statement: "The effect of physical development on the player's pathway remains uncertain.",
      questionId: "repeatability",
      contextRequirement: "A later-stage watch that tests balance, recovery, and repeatability.",
    },
  ],
  roleFit: [
    {
      id: "formal-unknown:role:alternate",
      label: "Another tactical role is untested",
      statement: "The player has not been tested with a different tactical responsibility.",
      questionId: "movement",
      contextRequirement: "A second role or team shape that changes the player's off-ball responsibilities.",
    },
    {
      id: "formal-unknown:role:speed",
      label: "Faster opposition is untested",
      statement: "The role fit has not been tested against a faster, more organised opponent.",
      questionId: "decisions",
      contextRequirement: "A stronger opponent that reduces time and space.",
    },
  ],
  characterRisk: [
    {
      id: "formal-unknown:character:pressure",
      label: "Sustained pressure is untested",
      statement: "The player's response to sustained pressure remains untested.",
      questionId: "pressure",
      contextRequirement: "A live period with mistakes, contact, and little recovery time.",
    },
    {
      id: "formal-unknown:character:independent",
      label: "Independent character view is missing",
      statement: "The character read has not been challenged by an independent source.",
      questionId: "pressure",
      contextRequirement: "A coach or family source who has seen the player in another setting.",
    },
  ],
};

export const YOUTH_REPORT_RISK_OPTIONS: ReadonlyArray<{
  id: YouthReportRiskId;
  label: string;
  description: string;
}> = [
  { id: "injuryAvailability", label: "Availability or injury", description: "Durability and training availability may affect the pathway." },
  { id: "physicalDevelopment", label: "Physical development", description: "Growth, balance, or repeatability may change the projection." },
  { id: "pressureResponse", label: "Pressure response", description: "The response to mistakes, contact, or scrutiny is not settled." },
  { id: "roleTranslation", label: "Role translation", description: "The observed role may not transfer cleanly into the academy shape." },
  { id: "adaptationMobility", label: "Adaptation and mobility", description: "Family, travel, language, or environment could affect the move." },
  { id: "competitionTranslation", label: "Competition translation", description: "The current level may not reproduce the same time and space." },
  { id: "noMaterialSignal", label: "No material risk signal", description: "No specific risk is supported yet; unknowns remain recorded separately." },
] as const;

export function getEvidenceUnknownOptions(card: ScoutingEvidenceCard): EvidenceUnknownOption[] {
  const category = categoryForClassification(card.classification);
  const shared: EvidenceUnknownOption[] = [
    {
      id: `unknown:${card.id}:pressure`,
      category,
      label: "Untested under sustained pressure",
      statement: "We have not seen whether the same decision survives sustained pressure.",
      recommendedQuestionId: "pressure",
      activityType: "followUpSession",
      contextRequirement: "A live period with repeated pressure and little recovery time.",
    },
    {
      id: `unknown:${card.id}:late`,
      category,
      label: "Untested late in the session",
      statement: "We have not seen whether the quality holds when fatigue changes the picture.",
      recommendedQuestionId: "repeatability",
      activityType: "followUpSession",
      contextRequirement: "A full session where the player can be watched after the hour mark.",
    },
    {
      id: `unknown:${card.id}:level`,
      category,
      label: "Untested against stronger opposition",
      statement: "We have not seen this signal against a faster or more organised opponent.",
      recommendedQuestionId: card.questionId,
      activityType: "youthTournament",
      contextRequirement: "A stronger opponent or tournament match with less time and space.",
    },
  ];
  if (card.classification === "offBallMovement" || card.classification === "preReceiveDecision") {
    shared[1] = {
      id: `unknown:${card.id}:role`,
      category,
      label: "Untested in another role",
      statement: "We have not seen whether the read survives a different tactical responsibility.",
      recommendedQuestionId: "movement",
      activityType: "followUpSession",
      contextRequirement: "A second live look with a different starting role or team shape.",
    };
  }
  return shared;
}

export function getEvidenceNextTestOptions(
  unknown: EvidenceUnknownOption,
): StructuredScoutingNextTest[] {
  return [
    {
      id: `next:${unknown.id}:live`,
      label: "Arrange another live look",
      description: `Return with one question: ${unknown.label.toLowerCase()}.`,
      questionId: unknown.recommendedQuestionId,
      activityType: unknown.activityType,
      contextRequirement: unknown.contextRequirement,
    },
    {
      id: `next:${unknown.id}:corroborate`,
      label: "Ask for an independent view",
      description: "Use a trusted source to challenge the first read before presenting it as settled.",
      questionId: unknown.recommendedQuestionId,
      activityType: "parentCoachMeeting",
      contextRequirement: "An independent source who has seen the player in a different setting.",
    },
  ];
}

function scoreAssessment(
  cards: ScoutingEvidenceCard[],
  claim: EvidenceClaimOption,
  confidence: EvidenceConfidenceBand,
  recommendation: ReportRecommendedAction,
): StructuredScoutingAssessment["score"] {
  const clarityScore: Record<ScoutingEvidenceCard["clarity"], number> = {
    missed: 4,
    glimpse: 8,
    usable: 15,
    strong: 21,
    exceptional: 25,
  };
  const evidenceSufficiency = Math.min(25, Math.max(...cards.map((card) => clarityScore[card.clarity])) + Math.min(4, cards.length - 1));
  const claimEvidenceFit = claim.support === "supported" ? 20 : claim.support === "withheld" ? 18 : 9;
  const contextDiversity = Math.min(15, new Set(cards.map((card) => card.contextKey)).size * 5);
  const evidenceConfidence = cards.reduce((sum, card) => sum + card.confidence, 0) / Math.max(1, cards.length);
  const confidenceGap = Math.max(0, CONFIDENCE_VALUE[confidence] - evidenceConfidence);
  const calibration = Math.max(0, Math.round(15 - confidenceGap * 35 - (claim.support === "stretch" ? 3 : 0)));
  const unknownHandling = 10;
  const briefFit = 6;
  const recommendationTarget = recommendation === "monitor" ? 0.3 : recommendation === "inviteForTrial" ? 0.55 : 0.8;
  const deliveryFit = Math.max(0, Math.round(5 - Math.abs(recommendationTarget - evidenceConfidence) * 10));
  return {
    evidenceSufficiency,
    claimEvidenceFit,
    contextDiversity,
    calibration,
    unknownHandling,
    briefFit,
    deliveryFit,
    total: Math.round(
      evidenceSufficiency
      + claimEvidenceFit
      + contextDiversity
      + calibration
      + unknownHandling
      + briefFit
      + deliveryFit,
    ),
  };
}

export interface InitialAssessmentBuildResult {
  valid: boolean;
  errors: string[];
  assessment?: StructuredScoutingAssessment;
}

export function buildInitialAssessment(
  input: InitialAssessmentInput,
  availableCards: ScoutingEvidenceCard[],
  playerName = "The player",
): InitialAssessmentBuildResult {
  const errors: string[] = [];
  const card = availableCards.find((candidate) => candidate.id === input.evidenceCardId);
  if (!card) errors.push("Choose one saved observation cue.");
  const claims = card ? getEvidenceClaimOptions(card) : [];
  const claim = claims.find((candidate) => candidate.id === input.claimOptionId);
  if (!claim) errors.push("Choose what the evidence suggests.");
  const unknowns = card ? getEvidenceUnknownOptions(card) : [];
  const unknown = unknowns.find((candidate) => candidate.id === input.unknownOptionId);
  if (!unknown) errors.push("Choose what remains untested.");
  const nextTests = unknown ? getEvidenceNextTestOptions(unknown) : [];
  const nextTest = nextTests.find((candidate) => candidate.id === input.nextTestId);
  if (!nextTest) errors.push("Choose the next test for this read.");
  if (!card || !claim || !unknown || !nextTest) return { valid: false, errors };

  const score = scoreAssessment([card], claim, input.confidence, input.recommendation);
  const confidenceGap = CONFIDENCE_VALUE[input.confidence] - card.confidence;
  const overclaimCount = (claim.support === "stretch" ? 1 : 0) + (confidenceGap > 0.16 ? 1 : 0);
  const structuredClaim: StructuredScoutingClaim = {
    id: claim.id,
    category: claim.category,
    statement: claim.statement,
    evidenceIds: [card.id],
    hypothesisIds: [],
    confidence: input.confidence,
    support: claim.support,
    classification: claim.classification,
  };
  const structuredUnknown: StructuredScoutingUnknown = {
    id: unknown.id,
    category: unknown.category,
    statement: unknown.statement,
    sourceEvidenceIds: [card.id],
  };
  const action = RECOMMENDATION_LABEL[input.recommendation];
  const generatedSummary = [
    `At ${card.minute} minutes, ${playerName} produced the passage you kept: ${card.detail}`,
    claim.statement,
    unknown.statement,
    `${nextTest.description} ${action}.`,
  ].join(" ");

  return {
    valid: true,
    errors: [],
    assessment: {
      version: 1,
      kind: "initial",
      questionId: card.questionId,
      evidenceIds: [card.id],
      claims: [structuredClaim],
      unknowns: [structuredUnknown],
      nextTest,
      recommendation: input.recommendation,
      confidence: input.confidence,
      overclaimCount,
      score,
      generatedSummary,
    },
  };
}

function evidenceBandFromReportConfidence(
  confidence: "low" | "medium" | "high",
): EvidenceConfidenceBand {
  if (confidence === "high") return "supported";
  if (confidence === "medium") return "working";
  return "tentative";
}

function defaultFormalNextTest(
  category: JudgmentCategory,
  unknown: FormalUnknownOption | undefined,
): StructuredScoutingNextTest {
  const fallback = FORMAL_CATEGORY_UNKNOWN_OPTIONS[category][0];
  const selected = unknown ?? fallback;
  return {
    id: `next:${selected.id}`,
    label: "Resolve the leading uncertainty",
    description: `Return with one purpose: ${selected.label.toLowerCase()}.`,
    questionId: selected.questionId,
    activityType: category === "characterRisk" ? "parentCoachMeeting" : "followUpSession",
    contextRequirement: selected.contextRequirement,
  };
}

function scoreFormalAssessment(
  cards: ScoutingEvidenceCard[],
  claims: StructuredScoutingClaim[],
  unknowns: StructuredScoutingUnknown[],
  recommendation: ReportRecommendedAction,
): StructuredScoutingAssessment["score"] {
  const clarityValue: Record<ScoutingEvidenceCard["clarity"], number> = {
    missed: 2,
    glimpse: 7,
    usable: 14,
    strong: 20,
    exceptional: 24,
  };
  const evidenceSufficiency = Math.min(
    25,
    cards.reduce((sum, card) => sum + clarityValue[card.clarity], 0) / Math.max(1, cards.length)
      + Math.min(5, cards.length - 1),
  );
  const supportScore = claims.reduce((sum, claim) => {
    if (claim.support === "supported") return sum + 20;
    if (claim.support === "withheld") return sum + 17;
    return sum + 9;
  }, 0) / Math.max(1, claims.length);
  const contextDiversity = Math.min(
    15,
    new Set(cards.map((card) => `${card.contextKey}:${card.independenceKey}`)).size * 5,
  );
  const calibrationValues = claims.map((claim) => {
    const supportCards = cards.filter((card) => claim.evidenceIds.includes(card.id));
    const evidenceConfidence = supportCards.reduce((sum, card) => sum + card.confidence, 0)
      / Math.max(1, supportCards.length);
    const gap = Math.max(0, CONFIDENCE_VALUE[claim.confidence] - evidenceConfidence);
    return Math.max(0, 15 - gap * 35 - (claim.support === "stretch" ? 3 : 0));
  });
  const calibration = Math.round(
    calibrationValues.reduce((sum, value) => sum + value, 0)
      / Math.max(1, calibrationValues.length),
  );
  const unknownHandling = Math.min(10, unknowns.length * 3 + (unknowns.length >= 3 ? 1 : 0));
  const briefFit = 10;
  const averageConfidence = cards.reduce((sum, card) => sum + card.confidence, 0) / Math.max(1, cards.length);
  const recommendationTarget = recommendation === "monitor" ? 0.3 : recommendation === "inviteForTrial" ? 0.55 : 0.8;
  const deliveryFit = Math.max(0, Math.round(5 - Math.abs(recommendationTarget - averageConfidence) * 10));
  return {
    evidenceSufficiency: Math.round(evidenceSufficiency),
    claimEvidenceFit: Math.round(supportScore),
    contextDiversity,
    calibration,
    unknownHandling,
    briefFit,
    deliveryFit,
    total: Math.round(
      evidenceSufficiency
      + supportScore
      + contextDiversity
      + calibration
      + unknownHandling
      + briefFit
      + deliveryFit,
    ),
  };
}

export interface FormalAssessmentBuildResult extends InitialAssessmentBuildResult {}

/** Build a formal academy report from selected evidence, explicit unknowns, and a club brief. */
export function buildFormalAssessment(
  input: StructuredReportInput,
  availableCards: ScoutingEvidenceCard[],
  playerName = "The player",
  clubName = "the academy",
): FormalAssessmentBuildResult {
  const errors: string[] = [];
  if (input.evidenceVersion !== 1) return { valid: false, errors: ["Structured evidence is required."] };
  const cardById = new Map(availableCards.map((card) => [card.id, card]));
  const claims: StructuredScoutingClaim[] = [];
  const collectedUnknowns: StructuredScoutingUnknown[] = [];

  for (const category of ["potential", "roleFit", "characterRisk"] as const) {
    const verdict = input.categoryVerdicts[category];
    const evidenceIds = (verdict.evidenceIds ?? []).filter((id) => cardById.has(id));
    if (verdict.status === "assessed") {
      if (!verdict.classification || !verdict.claimSupport || evidenceIds.length === 0) {
        errors.push(`${category} is missing traceable evidence.`);
      } else {
        claims.push({
          id: `formal-claim:${category}:${evidenceIds.join(":")}`,
          category,
          statement: verdict.verdict,
          evidenceIds,
          hypothesisIds: [...verdict.hypothesisIds],
          confidence: evidenceBandFromReportConfidence(verdict.confidence),
          support: verdict.claimSupport,
          classification: verdict.classification,
        });
      }
    }
    if (!verdict.unknownOptionId) {
      errors.push(`${category} is missing an explicit uncertainty.`);
    } else {
      collectedUnknowns.push({
        id: verdict.unknownOptionId,
        category,
        statement: verdict.acknowledgedUncertainty,
        sourceEvidenceIds: evidenceIds,
      });
    }
  }
  if (claims.length === 0) errors.push("At least one category needs an evidence-backed claim.");
  if (errors.length > 0) return { valid: false, errors };

  // The same uncertainty can be relevant to more than one judgment. Preserve
  // all linked evidence, but do not reward or repeat identical wording.
  const unknowns = [...collectedUnknowns.reduce((unique, unknown) => {
    const key = unknown.statement.trim().toLowerCase();
    const existing = unique.get(key);
    unique.set(key, existing
      ? {
          ...existing,
          sourceEvidenceIds: [...new Set([
            ...existing.sourceEvidenceIds,
            ...unknown.sourceEvidenceIds,
          ])],
        }
      : unknown);
    return unique;
  }, new Map<string, StructuredScoutingUnknown>()).values()];

  const usedCards = [...new Map(
    claims.flatMap((claim) => claim.evidenceIds)
      .map((id) => [id, cardById.get(id)!]),
  ).values()];
  const leadClaimCategory = claims[0]?.category;
  const leadUnknown = unknowns.find((unknown) => unknown.category === leadClaimCategory)
    ?? unknowns[0];
  const formalUnknown = leadUnknown
    ? FORMAL_CATEGORY_UNKNOWN_OPTIONS[leadUnknown.category]
        .find((option) => option.id === leadUnknown.id)
    : undefined;
  const nextTest = defaultFormalNextTest(leadUnknown?.category ?? "potential", formalUnknown);
  const confidence = claims.some((claim) => claim.confidence === "supported")
    ? "supported"
    : claims.some((claim) => claim.confidence === "working")
      ? "working"
      : "tentative";
  const overclaimCount = claims.reduce((count, claim) => {
    const supportingCards = usedCards.filter((card) => claim.evidenceIds.includes(card.id));
    const average = supportingCards.reduce((sum, card) => sum + card.confidence, 0)
      / Math.max(1, supportingCards.length);
    return count
      + (claim.support === "stretch" ? 1 : 0)
      + (CONFIDENCE_VALUE[claim.confidence] - average > 0.16 ? 1 : 0);
  }, 0);
  const score = scoreFormalAssessment(usedCards, claims, unknowns, input.recommendedAction);
  const riskSummary = (input.riskAssessments ?? [])
    .filter((risk) => risk.id !== "noMaterialSignal")
    .map((risk: ReportRiskAssessment) => `${risk.label.toLowerCase()} (${risk.status})`)
    .join(", ");
  const generatedSummary = [
    `For ${clubName}, ${playerName} projects as ${String(input.projectedRole).replace(/([A-Z])/g, " $1").toLowerCase()} against the current brief.`,
    claims.map((claim) => claim.statement).join(" "),
    `Current limits: ${unknowns.map((unknown) => unknown.statement).join(" ")}`,
    riskSummary ? `Risk posture: ${riskSummary}.` : "No specific material risk signal is being claimed.",
    `${RECOMMENDATION_LABEL[input.recommendedAction]}. ${nextTest.description}`,
  ].join(" ");

  return {
    valid: true,
    errors: [],
    assessment: {
      version: 1,
      kind: "formal",
      questionId: usedCards[0]?.questionId ?? nextTest.questionId,
      evidenceIds: usedCards.map((card) => card.id),
      claims,
      unknowns,
      nextTest,
      recommendation: input.recommendedAction,
      confidence,
      overclaimCount,
      score,
      generatedSummary,
    },
  };
}

/** Practice XP follows the decisions the scout actually made, not only the calendar slot. */
export function calculateEvidencePracticeXp(
  cards: ScoutingEvidenceCard[],
): Partial<Record<ScoutSkill, number>> {
  const gains: Partial<Record<ScoutSkill, number>> = {};
  const skillForClassification: Record<EvidenceClassificationId, ScoutSkill> = {
    technicalExecution: "technicalEye",
    preReceiveDecision: "tacticalUnderstanding",
    offBallMovement: "tacticalUnderstanding",
    pressureResponse: "psychologicalRead",
    physicalRepeatability: "physicalAssessment",
    anomaly: "potentialAssessment",
    noConclusion: "playerJudgment",
  };
  for (const card of cards) {
    const skill = skillForClassification[card.classification];
    const clarityIndex = CLARITY_ORDER.indexOf(card.clarity);
    gains[skill] = (gains[skill] ?? 0) + Math.max(1, Math.min(3, clarityIndex));
    gains.playerJudgment = (gains.playerJudgment ?? 0) + 1;
  }
  return gains;
}

export function calculateAssessmentPracticeXp(
  assessment: StructuredScoutingAssessment,
): Partial<Record<ScoutSkill, number>> {
  return {
    playerJudgment: assessment.overclaimCount > 0 ? 1 : assessment.score.calibration >= 12 ? 4 : 2,
    dataLiteracy: assessment.evidenceIds.length >= 2 ? 2 : 1,
    potentialAssessment: assessment.claims.some((claim) => claim.category === "potential") ? 2 : 0,
  };
}
