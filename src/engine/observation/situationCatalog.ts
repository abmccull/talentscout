import {
  CONTENT_SCHEMA_VERSION,
  ContentValidationError,
  defineContentPack,
  hasNonBlankString,
  type ContentValidationIssue,
} from "@/engine/content/contracts";
import type {
  ActivityType,
  AttributeDomain,
  ObservationContext,
} from "@/engine/core/types";

export const OBSERVATION_COMPETITION_LEVELS = [
  "community",
  "school",
  "academy",
  "reserve",
  "professional",
  "elite",
] as const;

export type ObservationCompetitionLevel =
  (typeof OBSERVATION_COMPETITION_LEVELS)[number];

export const OBSERVATION_STAKES = [
  "routine",
  "selection",
  "competitive",
  "knockout",
  "careerDefining",
] as const;

export type ObservationStakes = (typeof OBSERVATION_STAKES)[number];

export const OBSERVATION_TACTICAL_FRAMES = [
  "unstructured",
  "direct",
  "transitionHeavy",
  "possession",
  "pressing",
  "structured",
] as const;

export type ObservationTacticalFrame =
  (typeof OBSERVATION_TACTICAL_FRAMES)[number];

const SUPPORTED_ACTIVITY_CONTEXTS = {
  schoolMatch: "schoolMatch",
  grassrootsTournament: "grassrootsTournament",
  streetFootball: "streetFootball",
  academyTrialDay: "academyTrialDay",
  youthFestival: "youthFestival",
  academyVisit: "academyVisit",
  youthTournament: "youthTournament",
  attendMatch: "liveMatch",
  reserveMatch: "reserveMatch",
  trainingVisit: "trainingGround",
  trialMatch: "trialMatch",
  scoutingMission: "liveMatch",
  followUpSession: "followUpSession",
  parentCoachMeeting: "parentCoachMeeting",
  watchVideo: "videoAnalysis",
  databaseQuery: "databaseQuery",
  deepVideoAnalysis: "deepVideoAnalysis",
  oppositionAnalysis: "oppositionAnalysis",
  agentShowcase: "agentShowcase",
  statsBriefing: "statsBriefing",
} as const satisfies Partial<Record<ActivityType, ObservationContext>>;

export type ObservationSituationCatalogActivityType =
  keyof typeof SUPPORTED_ACTIVITY_CONTEXTS;

export const CORE_YOUTH_OBSERVATION_ACTIVITY_TYPES = [
  "schoolMatch",
  "grassrootsTournament",
  "streetFootball",
  "academyTrialDay",
  "youthFestival",
  "academyVisit",
  "youthTournament",
  "followUpSession",
  "parentCoachMeeting",
  "watchVideo",
] as const satisfies readonly ObservationSituationCatalogActivityType[];

type ObservationSituationSignal =
  Partial<Record<AttributeDomain, number>>;

interface ObservationSituationTemplate {
  levels: readonly ObservationCompetitionLevel[];
  stakes: readonly ObservationStakes[];
  frames: readonly ObservationTacticalFrame[];
  signal: ObservationSituationSignal;
  uncertainty: number;
  misleadingRisk: number;
  tags: readonly string[];
  reasons: readonly string[];
}

export interface ObservationSituationDefinition
  extends ObservationSituationTemplate {
  id: string;
  activityType: ObservationSituationCatalogActivityType;
  observationContext: ObservationContext;
  defaultBaseline: boolean;
  variantKey?: string;
}

type VariantOverride =
  Partial<Omit<ObservationSituationTemplate, "signal" | "tags" | "reasons">>
  & {
    signal?: ObservationSituationSignal;
    tags: readonly string[];
    reasons: readonly string[];
  };

const COMPETITION_LEVEL_SET = new Set<ObservationCompetitionLevel>(
  OBSERVATION_COMPETITION_LEVELS,
);
const STAKES_SET = new Set<ObservationStakes>(OBSERVATION_STAKES);
const TACTICAL_FRAME_SET = new Set<ObservationTacticalFrame>(
  OBSERVATION_TACTICAL_FRAMES,
);
const CORE_YOUTH_ACTIVITY_SET =
  new Set<ObservationSituationCatalogActivityType>(
    CORE_YOUTH_OBSERVATION_ACTIVITY_TYPES,
  );

const BASELINE_TEMPLATES: Record<
  ObservationSituationCatalogActivityType,
  ObservationSituationTemplate
> = {
  schoolMatch: {
    levels: ["school"],
    stakes: ["routine", "competitive"],
    frames: ["unstructured", "direct"],
    signal: { technical: 0.98, physical: 1.04, mental: 1.02, tactical: 0.78 },
    uncertainty: 1.12,
    misleadingRisk: 0.2,
    tags: ["school-pathway", "limited-structure"],
    reasons: [
      "Routine school fixtures offer honest effort samples but only limited tactical repetition.",
    ],
  },
  grassrootsTournament: {
    levels: ["community"],
    stakes: ["competitive", "knockout"],
    frames: ["direct", "transitionHeavy", "unstructured"],
    signal: { physical: 1.12, mental: 1.08, tactical: 0.82 },
    uncertainty: 1.18,
    misleadingRisk: 0.22,
    tags: ["multi-match", "uneven-opposition"],
    reasons: [
      "Grassroots tournament play exposes stamina and mentality but the opposition floor varies sharply.",
    ],
  },
  streetFootball: {
    levels: ["community"],
    stakes: ["routine", "competitive"],
    frames: ["unstructured"],
    signal: { technical: 1.18, physical: 1.08, tactical: 0.68 },
    uncertainty: 1.28,
    misleadingRisk: 0.28,
    tags: ["informal", "small-space"],
    reasons: [
      "Street football magnifies improvisation and first actions while obscuring broader tactical structure.",
    ],
  },
  academyTrialDay: {
    levels: ["academy"],
    stakes: ["selection", "careerDefining"],
    frames: ["structured", "pressing", "possession"],
    signal: { mental: 1.12, tactical: 1.12, hidden: 1.04 },
    uncertainty: 0.92,
    misleadingRisk: 0.2,
    tags: ["trial", "coached-drills"],
    reasons: [
      "A formal academy trial compresses selection pressure into coached exercises and short match phases.",
    ],
  },
  youthFestival: {
    levels: ["academy", "elite"],
    stakes: ["competitive", "knockout"],
    frames: ["transitionHeavy", "pressing", "structured"],
    signal: { mental: 1.15, hidden: 1.08, tactical: 0.96 },
    uncertainty: 1.06,
    misleadingRisk: 0.18,
    tags: ["showcase-pressure", "multi-club"],
    reasons: [
      "Festival football sharpens pressure reads because multiple clubs and peer groups are watching together.",
    ],
  },
  academyVisit: {
    levels: ["academy"],
    stakes: ["routine", "selection"],
    frames: ["structured", "possession", "pressing"],
    signal: { technical: 1.1, tactical: 1.08, mental: 1.03 },
    uncertainty: 0.9,
    misleadingRisk: 0.11,
    tags: ["coached-environment", "development-pathway"],
    reasons: [
      "Academy visits provide a repeatable coached environment that clarifies habits and role detail.",
    ],
  },
  youthTournament: {
    levels: ["academy", "elite"],
    stakes: ["competitive", "knockout"],
    frames: ["transitionHeavy", "pressing", "structured"],
    signal: { physical: 1.08, mental: 1.08, tactical: 0.94 },
    uncertainty: 1.05,
    misleadingRisk: 0.16,
    tags: ["age-group-competition", "multi-match"],
    reasons: [
      "Youth tournaments reveal how players translate their game across unfamiliar peers and short turnarounds.",
    ],
  },
  attendMatch: {
    levels: ["professional", "elite"],
    stakes: ["routine", "competitive", "knockout"],
    frames: ["direct", "transitionHeavy", "possession", "pressing", "structured"],
    signal: { mental: 1.06, tactical: 1.08 },
    uncertainty: 1,
    misleadingRisk: 0.12,
    tags: ["senior-live"],
    reasons: [
      "Senior live matches provide the cleanest overall translation test when pace, pressure, and consequence align.",
    ],
  },
  reserveMatch: {
    levels: ["reserve"],
    stakes: ["routine", "selection"],
    frames: ["structured", "transitionHeavy", "pressing"],
    signal: { technical: 1.04, physical: 1.06, mental: 0.94 },
    uncertainty: 0.94,
    misleadingRisk: 0.15,
    tags: ["reserve-level", "selection-pressure"],
    reasons: [
      "Reserve football exposes readiness and physical repeatability but motivation can vary between squads.",
    ],
  },
  trainingVisit: {
    levels: ["professional"],
    stakes: ["routine", "selection"],
    frames: ["structured", "possession", "pressing"],
    signal: { technical: 1.14, tactical: 1.12, physical: 1.03, mental: 0.9 },
    uncertainty: 0.84,
    misleadingRisk: 0.13,
    tags: ["training-ground", "repeatable-drills"],
    reasons: [
      "Training visits offer repeatable detail and tactical context while muting some real-match pressure.",
    ],
  },
  trialMatch: {
    levels: ["professional"],
    stakes: ["careerDefining"],
    frames: ["structured", "transitionHeavy", "pressing"],
    signal: { mental: 1.16, hidden: 1.08, tactical: 1.04 },
    uncertainty: 0.92,
    misleadingRisk: 0.24,
    tags: ["trial", "career-pressure"],
    reasons: [
      "Trial matches show how players handle professional consequences, but performative risk rises with the stakes.",
    ],
  },
  scoutingMission: {
    levels: ["professional", "elite"],
    stakes: ["competitive", "knockout"],
    frames: ["direct", "transitionHeavy", "possession", "pressing", "structured"],
    signal: { tactical: 1.08, mental: 1.05 },
    uncertainty: 1.04,
    misleadingRisk: 0.14,
    tags: ["assigned-watch", "senior-live"],
    reasons: [
      "An assigned mission usually starts from a tactical question, so role fit and decision pressure matter most.",
    ],
  },
  followUpSession: {
    levels: ["academy"],
    stakes: ["selection"],
    frames: ["structured"],
    signal: { technical: 1.08, physical: 1.08, mental: 1.08, tactical: 1.08 },
    uncertainty: 0.88,
    misleadingRisk: 0.08,
    tags: ["targeted-follow-up"],
    reasons: [
      "A deliberate follow-up session narrows the question and reduces noise compared with a first watch.",
    ],
  },
  parentCoachMeeting: {
    levels: ["community", "academy"],
    stakes: ["selection"],
    frames: ["structured"],
    signal: { mental: 1.1, hidden: 1.18 },
    uncertainty: 1.12,
    misleadingRisk: 0.2,
    tags: ["relationship-evidence", "second-hand"],
    reasons: [
      "Parent and coach testimony can unlock mentality and support clues, but it remains second-hand evidence.",
    ],
  },
  watchVideo: {
    levels: ["professional"],
    stakes: ["routine", "competitive"],
    frames: ["direct", "transitionHeavy", "possession", "pressing", "structured"],
    signal: { technical: 1.03, tactical: 1.08, physical: 0.82, hidden: 0.62 },
    uncertainty: 1.12,
    misleadingRisk: 0.17,
    tags: ["video", "curated-sample"],
    reasons: [
      "Standard video review sharpens technical and tactical recall but still hides physical repeatability and support detail.",
    ],
  },
  databaseQuery: {
    levels: ["professional"],
    stakes: ["routine"],
    frames: ["structured"],
    signal: {
      technical: 0.94,
      tactical: 1.02,
      physical: 0.8,
      mental: 0.68,
      hidden: 0.55,
    },
    uncertainty: 1.24,
    misleadingRisk: 0.23,
    tags: ["data", "competition-normalisation"],
    reasons: [
      "Database work scales comparison but the scout only sees what the model captured and normalized.",
    ],
  },
  deepVideoAnalysis: {
    levels: ["professional"],
    stakes: ["routine", "competitive"],
    frames: ["direct", "transitionHeavy", "possession", "pressing", "structured"],
    signal: { technical: 1.08, mental: 1.02, tactical: 1.14, physical: 0.86 },
    uncertainty: 0.98,
    misleadingRisk: 0.12,
    tags: ["video", "data-overlay"],
    reasons: [
      "Deep video analysis improves sequencing and tactical context through rewind and annotation support.",
    ],
  },
  oppositionAnalysis: {
    levels: ["professional", "elite"],
    stakes: ["competitive", "knockout"],
    frames: ["direct", "transitionHeavy", "possession", "pressing", "structured"],
    signal: { mental: 1.02, tactical: 1.16, technical: 0.92 },
    uncertainty: 1.02,
    misleadingRisk: 0.14,
    tags: ["opposition", "tactical-sample"],
    reasons: [
      "Opposition study prioritizes system behavior and decision patterns over broad all-around player truth.",
    ],
  },
  agentShowcase: {
    levels: ["professional"],
    stakes: ["selection", "careerDefining"],
    frames: ["transitionHeavy", "possession"],
    signal: { technical: 1.08, physical: 1.06, mental: 1.04, tactical: 0.8 },
    uncertainty: 1.14,
    misleadingRisk: 0.3,
    tags: ["agent-curated", "showcase-pressure"],
    reasons: [
      "Agent showcases can surface upside quickly, but curation and scripting increase selection bias materially.",
    ],
  },
  statsBriefing: {
    levels: ["professional"],
    stakes: ["routine"],
    frames: ["structured"],
    signal: {
      technical: 0.88,
      tactical: 0.94,
      physical: 0.72,
      mental: 0.62,
      hidden: 0.55,
    },
    uncertainty: 1.28,
    misleadingRisk: 0.24,
    tags: ["data", "summary-only"],
    reasons: [
      "A stats briefing is efficient but abstracted, so the scout inherits every blind spot of the summary layer.",
    ],
  },
};

function createBaselineDefinition(
  activityType: ObservationSituationCatalogActivityType,
): ObservationSituationDefinition {
  const baseline = BASELINE_TEMPLATES[activityType];
  return {
    id: `${activityType}-baseline`,
    activityType,
    observationContext: SUPPORTED_ACTIVITY_CONTEXTS[activityType],
    defaultBaseline: true,
    ...baseline,
  };
}

function createVariantDefinition(
  activityType: ObservationSituationCatalogActivityType,
  variantKey: string,
  overrides: VariantOverride,
): ObservationSituationDefinition {
  const baseline = BASELINE_TEMPLATES[activityType];
  return {
    id: `${activityType}-${variantKey}`,
    activityType,
    observationContext: SUPPORTED_ACTIVITY_CONTEXTS[activityType],
    defaultBaseline: false,
    variantKey,
    levels: overrides.levels ?? baseline.levels,
    stakes: overrides.stakes ?? baseline.stakes,
    frames: overrides.frames ?? baseline.frames,
    signal: { ...baseline.signal, ...(overrides.signal ?? {}) },
    uncertainty: overrides.uncertainty ?? baseline.uncertainty,
    misleadingRisk: overrides.misleadingRisk ?? baseline.misleadingRisk,
    tags: [...baseline.tags, ...overrides.tags],
    reasons: [...baseline.reasons, ...overrides.reasons],
  };
}

const OBSERVATION_SITUATION_DEFINITION_INPUTS: readonly ObservationSituationDefinition[] = [
  ...(
    Object.keys(BASELINE_TEMPLATES) as ObservationSituationCatalogActivityType[]
  ).map(createBaselineDefinition),
  createVariantDefinition("schoolMatch", "selectionWindow", {
    stakes: ["selection", "competitive"],
    frames: ["direct", "transitionHeavy"],
    signal: { mental: 1.08, hidden: 1.05, tactical: 0.82 },
    uncertainty: 1.06,
    misleadingRisk: 0.17,
    tags: ["touchline-club-visit", "variant:schoolMatch-selectionWindow"],
    reasons: [
      "Club jackets on the touchline turn a school fixture into a visible selection window with stronger body-language reads.",
    ],
  }),
  createVariantDefinition("schoolMatch", "weatherScramble", {
    frames: ["unstructured", "transitionHeavy"],
    signal: { technical: 0.93, physical: 1.08, tactical: 0.72 },
    uncertainty: 1.2,
    misleadingRisk: 0.25,
    tags: ["scrappy-second-ball", "variant:schoolMatch-weatherScramble"],
    reasons: [
      "A broken school-game rhythm creates louder duel and recovery actions but a less trustworthy tactical sample.",
    ],
  }),
  createVariantDefinition("grassrootsTournament", "survivalBracket", {
    stakes: ["competitive", "knockout", "careerDefining"],
    frames: ["direct", "transitionHeavy"],
    signal: { physical: 1.15, mental: 1.12, tactical: 0.78 },
    uncertainty: 1.14,
    misleadingRisk: 0.19,
    tags: ["survival-bracket", "variant:grassrootsTournament-survivalBracket"],
    reasons: [
      "A win-or-go-home bracket raises resilience and competitiveness signals beyond a routine local tournament round.",
    ],
  }),
  createVariantDefinition("grassrootsTournament", "fatigueAccumulation", {
    frames: ["transitionHeavy", "unstructured"],
    signal: { technical: 0.94, physical: 1.16, tactical: 0.76 },
    uncertainty: 1.24,
    misleadingRisk: 0.27,
    tags: ["fatigue-accumulation", "variant:grassrootsTournament-fatigueAccumulation"],
    reasons: [
      "Back-to-back grassroots games sharpen repeat-effort reads while making every polished action easier to over-credit.",
    ],
  }),
  createVariantDefinition("streetFootball", "winnerStays", {
    stakes: ["competitive", "selection"],
    frames: ["unstructured", "transitionHeavy"],
    signal: { technical: 1.2, mental: 1.12, tactical: 0.64 },
    uncertainty: 1.22,
    misleadingRisk: 0.24,
    tags: ["winner-stays", "variant:streetFootball-winnerStays"],
    reasons: [
      "Winner-stays rules create repeated pressure possessions that highlight courage and improvisation more than team shape.",
    ],
  }),
  createVariantDefinition("streetFootball", "olderOpponents", {
    frames: ["unstructured", "direct"],
    signal: { technical: 1.08, physical: 1.14, mental: 1.1, tactical: 0.62 },
    uncertainty: 1.34,
    misleadingRisk: 0.32,
    tags: ["older-opponents", "variant:streetFootball-olderOpponents"],
    reasons: [
      "Facing older players in an informal game stresses balance and nerve, but the age mismatch distorts true peer projection.",
    ],
  }),
  createVariantDefinition("academyTrialDay", "timedTesting", {
    frames: ["structured", "pressing"],
    signal: { tactical: 1.16, mental: 1.14, hidden: 1.08 },
    uncertainty: 0.88,
    misleadingRisk: 0.17,
    tags: ["timed-testing", "variant:academyTrialDay-timedTesting"],
    reasons: [
      "Timed academy drills and instant coaching feedback reduce ambiguity when the staff is checking role obedience directly.",
    ],
  }),
  createVariantDefinition("academyTrialDay", "smallSidedCull", {
    frames: ["pressing", "transitionHeavy"],
    signal: { technical: 1.04, physical: 1.06, mental: 1.1, tactical: 1.02 },
    uncertainty: 0.96,
    misleadingRisk: 0.24,
    tags: ["small-sided-cull", "variant:academyTrialDay-smallSidedCull"],
    reasons: [
      "A fast small-sided cull rewards quick adaptation, but the compressed sample can overstate one hot spell.",
    ],
  }),
  createVariantDefinition("youthFestival", "showcasePitch", {
    stakes: ["competitive", "careerDefining"],
    signal: { mental: 1.18, hidden: 1.1, tactical: 1 },
    uncertainty: 0.99,
    misleadingRisk: 0.16,
    tags: ["showcase-pitch", "variant:youthFestival-showcasePitch"],
    reasons: [
      "A headline festival pitch turns every action into a reputation event, improving pressure interpretation more than raw technique.",
    ],
  }),
  createVariantDefinition("youthFestival", "travelTurnaround", {
    frames: ["transitionHeavy", "unstructured"],
    signal: { physical: 1.12, mental: 1.06, tactical: 0.9 },
    uncertainty: 1.14,
    misleadingRisk: 0.22,
    tags: ["travel-turnaround", "variant:youthFestival-travelTurnaround"],
    reasons: [
      "A rushed travel turnaround exposes recovery habits and focus but makes clean tactical sequencing harder to trust.",
    ],
  }),
  createVariantDefinition("academyVisit", "closedSession", {
    frames: ["structured", "possession"],
    signal: { technical: 1.14, tactical: 1.1, mental: 0.98 },
    uncertainty: 0.86,
    misleadingRisk: 0.09,
    tags: ["closed-session", "variant:academyVisit-closedSession"],
    reasons: [
      "A closed academy session strips out crowd noise and lets the scout study repeat patterns across multiple drills.",
    ],
  }),
  createVariantDefinition("academyVisit", "scriptedDemonstration", {
    stakes: ["selection"],
    frames: ["structured"],
    signal: { tactical: 1.14, hidden: 0.9, mental: 0.96 },
    uncertainty: 0.95,
    misleadingRisk: 0.18,
    tags: ["scripted-demonstration", "variant:academyVisit-scriptedDemonstration"],
    reasons: [
      "A choreographed academy showcase explains the role clearly, but it also lets the staff hide weaker off-ball habits.",
    ],
  }),
  createVariantDefinition("youthTournament", "knockoutRematch", {
    stakes: ["knockout", "careerDefining"],
    frames: ["pressing", "structured"],
    signal: { physical: 1.1, mental: 1.14, tactical: 0.98 },
    uncertainty: 0.99,
    misleadingRisk: 0.14,
    tags: ["knockout-rematch", "variant:youthTournament-knockoutRematch"],
    reasons: [
      "A knockout rematch sharpens mentality and adjustment evidence because players must solve a familiar opponent under higher pressure.",
    ],
  }),
  createVariantDefinition("youthTournament", "groupStageRotation", {
    stakes: ["routine", "competitive"],
    frames: ["transitionHeavy", "unstructured"],
    signal: { technical: 0.96, physical: 1.04, tactical: 0.86 },
    uncertainty: 1.12,
    misleadingRisk: 0.2,
    tags: ["group-rotation", "variant:youthTournament-groupStageRotation"],
    reasons: [
      "Heavy youth-tournament rotation reveals adaptability and repeat energy, but role continuity is weaker than in a settled knockout side.",
    ],
  }),
  createVariantDefinition("followUpSession", "targetedRoleCheck", {
    stakes: ["selection", "careerDefining"],
    frames: ["structured", "pressing"],
    signal: { technical: 1.12, mental: 1.06, tactical: 1.14 },
    uncertainty: 0.84,
    misleadingRisk: 0.07,
    tags: ["targeted-role-check", "variant:followUpSession-targetedRoleCheck"],
    reasons: [
      "The follow-up was scheduled to answer one specific role-fit question, so the evidence carries less ambient noise.",
    ],
  }),
  createVariantDefinition("followUpSession", "fatigueVerification", {
    frames: ["structured", "transitionHeavy"],
    signal: { physical: 1.12, mental: 1.02, tactical: 1.02 },
    uncertainty: 0.93,
    misleadingRisk: 0.11,
    tags: ["fatigue-verification", "variant:followUpSession-fatigueVerification"],
    reasons: [
      "A fatigue-check follow-up is designed to test whether the earlier sample held once the player's legs stopped looking fresh.",
    ],
  }),
  createVariantDefinition("parentCoachMeeting", "protectiveGuardian", {
    stakes: ["selection", "careerDefining"],
    signal: { mental: 1.14, hidden: 1.2 },
    uncertainty: 1.18,
    misleadingRisk: 0.25,
    tags: ["protective-guardian", "variant:parentCoachMeeting-protectiveGuardian"],
    reasons: [
      "A protective guardian reveals support demands and pressure points, but the account can tilt toward shielding the player.",
    ],
  }),
  createVariantDefinition("parentCoachMeeting", "staffSell", {
    signal: { mental: 1.06, hidden: 1.12, tactical: 0.94 },
    uncertainty: 1.08,
    misleadingRisk: 0.22,
    tags: ["staff-sell", "variant:parentCoachMeeting-staffSell"],
    reasons: [
      "A coach trying to sell the player explains role and pathway clearly, while also introducing presentation bias into the testimony.",
    ],
  }),
  createVariantDefinition("watchVideo", "curatedHighlights", {
    levels: ["academy", "professional"],
    frames: ["direct", "transitionHeavy"],
    signal: { technical: 1.08, tactical: 0.98, physical: 0.76, hidden: 0.58 },
    uncertainty: 1.18,
    misleadingRisk: 0.26,
    tags: ["highlight-package", "variant:watchVideo-curatedHighlights"],
    reasons: [
      "A highlight reel amplifies visible upside but removes the dead possessions that usually keep projection honest.",
    ],
  }),
  createVariantDefinition("watchVideo", "fullPhaseCutup", {
    stakes: ["competitive", "selection"],
    frames: ["possession", "pressing", "structured"],
    signal: { technical: 1.04, mental: 1.02, tactical: 1.14, hidden: 0.66 },
    uncertainty: 1.04,
    misleadingRisk: 0.13,
    tags: ["phase-cutup", "variant:watchVideo-fullPhaseCutup"],
    reasons: [
      "A phase-by-phase cut-up restores sequencing and supporting actions, even though screen-based physical reads stay limited.",
    ],
  }),
];

function isSupportedActivityType(
  activityType: ActivityType,
): activityType is ObservationSituationCatalogActivityType {
  return Object.hasOwn(SUPPORTED_ACTIVITY_CONTEXTS, activityType);
}

export function hashObservationSituationSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function validateStringList(
  issues: Array<Omit<ContentValidationIssue, "packId" | "definitionId">>,
  path: string,
  values: readonly string[],
): void {
  if (values.length === 0) {
    issues.push({ path, message: "must contain at least one entry" });
    return;
  }
  if (values.some((value) => !hasNonBlankString(value))) {
    issues.push({ path, message: "must contain only non-empty strings" });
  }
}

function validateDefinition(
  definition: ObservationSituationDefinition,
): readonly Omit<ContentValidationIssue, "packId" | "definitionId">[] {
  const issues: Array<Omit<ContentValidationIssue, "packId" | "definitionId">> = [];
  const expectedContext = SUPPORTED_ACTIVITY_CONTEXTS[definition.activityType];

  if (!expectedContext) {
    issues.push({ path: "activityType", message: "must be a supported observation activity" });
  }
  if (definition.observationContext !== expectedContext) {
    issues.push({
      path: "observationContext",
      message: "must match the supported activity context for this activity",
    });
  }
  if (!definition.levels.every((level) => COMPETITION_LEVEL_SET.has(level))) {
    issues.push({ path: "levels", message: "must contain only supported competition levels" });
  }
  if (!definition.stakes.every((stake) => STAKES_SET.has(stake))) {
    issues.push({ path: "stakes", message: "must contain only supported stakes" });
  }
  if (!definition.frames.every((frame) => TACTICAL_FRAME_SET.has(frame))) {
    issues.push({ path: "frames", message: "must contain only supported tactical frames" });
  }
  validateStringList(issues, "tags", definition.tags);
  validateStringList(issues, "reasons", definition.reasons);

  for (const [domain, value] of Object.entries(definition.signal)) {
    if (!hasNonBlankString(domain)) {
      issues.push({ path: "signal", message: "must use non-empty domain keys" });
      continue;
    }
    if (!Number.isFinite(value) || value < 0.55 || value > 1.45) {
      issues.push({
        path: `signal.${domain}`,
        message: "must stay inside the visible signal bounds [0.55, 1.45]",
      });
    }
  }
  if (!Number.isFinite(definition.uncertainty) || definition.uncertainty < 0.7 || definition.uncertainty > 1.6) {
    issues.push({
      path: "uncertainty",
      message: "must stay inside the visible uncertainty bounds [0.7, 1.6]",
    });
  }
  if (
    !Number.isFinite(definition.misleadingRisk)
    || definition.misleadingRisk < 0.03
    || definition.misleadingRisk > 0.45
  ) {
    issues.push({
      path: "misleadingRisk",
      message: "must stay inside the visible misleading-risk bounds [0.03, 0.45]",
    });
  }
  if (definition.defaultBaseline) {
    if (definition.variantKey !== undefined) {
      issues.push({
        path: "variantKey",
        message: "default baselines must not declare a variant key",
      });
    }
  } else if (!hasNonBlankString(definition.variantKey)) {
    issues.push({
      path: "variantKey",
      message: "non-default variants must declare a stable variant key",
    });
  }

  return issues;
}

function validateCrossDefinitionInvariants(
  entries: readonly ObservationSituationDefinition[],
): ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [];
  const packId = "talentscout.observation-situations";

  for (const activityType of Object.keys(SUPPORTED_ACTIVITY_CONTEXTS) as ObservationSituationCatalogActivityType[]) {
    const variants = entries.filter((entry) => entry.activityType === activityType);
    const defaults = variants.filter((entry) => entry.defaultBaseline);
    if (defaults.length !== 1) {
      issues.push({
        packId,
        path: `activityType.${activityType}.defaultBaseline`,
        message: "must provide exactly one default baseline variant",
      });
    }
    if (variants.length === 0) {
      issues.push({
        packId,
        path: `activityType.${activityType}`,
        message: "must provide authored coverage for every supported activity baseline",
      });
    }
    if (CORE_YOUTH_ACTIVITY_SET.has(activityType) && variants.length < 3) {
      issues.push({
        packId,
        path: `activityType.${activityType}.variants`,
        message: "must provide at least three authored variants including the baseline",
      });
    }

    const seenVariantKeys = new Set<string>();
    for (const variant of variants.filter((entry) => !entry.defaultBaseline)) {
      if (!variant.variantKey) continue;
      if (seenVariantKeys.has(variant.variantKey)) {
        issues.push({
          packId,
          definitionId: variant.id,
          path: "variantKey",
          message: "must be unique within its activity catalog",
        });
      }
      seenVariantKeys.add(variant.variantKey);
    }
  }

  return issues;
}

const rawPack = defineContentPack({
  manifest: {
    id: "talentscout.observation-situations",
    kind: "observation-situation",
    schemaVersion: CONTENT_SCHEMA_VERSION,
    contentVersion: "observation-situations.1",
  },
  entries: OBSERVATION_SITUATION_DEFINITION_INPUTS,
  getDefinitionId: (definition) => definition.id,
  validateDefinition,
});

const crossDefinitionIssues = validateCrossDefinitionInvariants(rawPack.entries);
if (crossDefinitionIssues.length > 0) {
  throw new ContentValidationError(crossDefinitionIssues);
}

export const OBSERVATION_SITUATION_CONTENT_PACK = rawPack;
export const OBSERVATION_SITUATION_DEFINITIONS =
  OBSERVATION_SITUATION_CONTENT_PACK.entries;

const DEFINITIONS_BY_ACTIVITY = Object.freeze(
  Object.fromEntries(
    (Object.keys(SUPPORTED_ACTIVITY_CONTEXTS) as ObservationSituationCatalogActivityType[])
      .map((activityType) => [
        activityType,
        OBSERVATION_SITUATION_CONTENT_PACK.entries.filter(
          (definition) => definition.activityType === activityType,
        ),
      ]) as Array<
        [ObservationSituationCatalogActivityType, readonly ObservationSituationDefinition[]]
      >,
  ) as unknown as Record<
    ObservationSituationCatalogActivityType,
    readonly ObservationSituationDefinition[]
  >,
);

export function getObservationSituationDefinitionsForActivity(
  activityType: ActivityType,
): readonly ObservationSituationDefinition[] {
  if (!isSupportedActivityType(activityType)) return [];
  return DEFINITIONS_BY_ACTIVITY[activityType];
}

export function getDefaultObservationSituationDefinition(
  activityType: ActivityType,
): ObservationSituationDefinition | undefined {
  return getObservationSituationDefinitionsForActivity(activityType)
    .find((definition) => definition.defaultBaseline);
}

export function getObservationSituationDefinitionById(
  id: string,
): ObservationSituationDefinition | undefined {
  return OBSERVATION_SITUATION_CONTENT_PACK.byId[id];
}

export function selectObservationSituationDefinition(
  activityType: ActivityType,
  seed: string,
): ObservationSituationDefinition | undefined {
  const variants = getObservationSituationDefinitionsForActivity(activityType);
  if (variants.length === 0) return undefined;
  return variants[
    hashObservationSituationSeed(`${activityType}:${seed}:variant`)
    % variants.length
  ];
}
