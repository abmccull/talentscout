/**
 * Pure, player-facing youth mobility assessment.
 *
 * This module deliberately models registration and work-permit friction as a
 * bounded game abstraction. It does not encode or claim to reproduce real
 * immigration, employment, safeguarding, or football-registration law.
 *
 * Every input is an observable field already present in the game. In
 * particular, the prospect type excludes ability, potential, attributes, and
 * hidden personality, so this assessment cannot leak talent truth.
 */

import type {
  Club,
  League,
  Player,
  RegionalKnowledge,
  UnsignedYouth,
} from "@/engine/core/types";
import type { PlayerDevelopmentEnvironmentProjection } from "@/engine/world/developmentEnvironment";
import { getTransferFlowProbability } from "@/engine/world/transfers";
import type { WorldConditionModifiers } from "@/engine/world/worldConditionTypes";
import {
  countryKeyFromNationality,
  getCountryDisplayName,
  normalizeCountryKey,
} from "@/lib/country";

export type YouthMobilityStatus = "clear" | "conditional" | "blocked";
export type YouthMobilityRiskBand = "low" | "guarded" | "high" | "severe";
export type YouthMobilityConfidenceBand = "limited" | "working" | "strong";
export type YouthMobilityRouteFamiliarity =
  | "domestic"
  | "established"
  | "familiar"
  | "uncommon";

export type YouthMobilityDimensionId =
  | "registration"
  | "adaptation"
  | "familyEducation"
  | "pathwaySupport";

export type YouthMobilityProspect = Pick<UnsignedYouth, "id" | "country"> & {
  player: Pick<Player, "id" | "age" | "nationality">;
};

export type YouthMobilityTargetClub = Pick<
  Club,
  | "id"
  | "name"
  | "leagueId"
  | "reputation"
  | "youthAcademyRating"
  | "scoutingPhilosophy"
  | "playerIds"
  | "academyPlayerIds"
>;

export type YouthMobilityTargetLeague = Pick<League, "id" | "country" | "tier">;

export type YouthMobilityRegionalKnowledge = Pick<
  RegionalKnowledge,
  "countryId" | "knowledgeLevel" | "culturalInsights" | "localContacts"
>;

export type YouthMobilityWorldContext = Partial<
  Pick<
    WorldConditionModifiers,
    | "developmentMultiplier"
    | "opportunityMultiplier"
    | "travelDurationDelta"
    | "travelFatigueMultiplier"
  >
>;

export interface YouthMobilityAssessmentInput {
  youth: YouthMobilityProspect;
  targetClub: YouthMobilityTargetClub;
  targetLeague: YouthMobilityTargetLeague;
  /** Target-country dossier only. A mismatched country is ignored safely. */
  targetRegionalKnowledge?: YouthMobilityRegionalKnowledge;
  /** Public, already-resolved seasonal modifiers for the target country. */
  worldContext?: YouthMobilityWorldContext;
  /** Optional player-safe projection from developmentEnvironment.ts. */
  developmentEnvironment?: Pick<
    PlayerDevelopmentEnvironmentProjection,
    "score" | "band" | "factors"
  >;
}

export interface YouthMobilityDimension {
  id: YouthMobilityDimensionId;
  label: string;
  /** Visible friction/risk from 0 (none) to 100 (maximum). */
  riskScore: number;
  status: YouthMobilityStatus;
  summary: string;
  reasons: string[];
  mitigationActions: string[];
}

export interface YouthMobilityConfidence {
  score: number;
  band: YouthMobilityConfidenceBand;
  summary: string;
}

export interface YouthMobilityClubDecisionAdjustment {
  /**
   * Small additive nudge for the academy decision score. This is deliberately
   * bounded to [-12, 3] so mobility context can matter without overpowering
   * the report, brief fit, affordability, or club relationship.
   */
  score: number;
  summary: string;
}

export interface YouthMobilityAssessment {
  prospectId: string;
  playerId: string;
  originCountry: { key: string; label: string };
  targetCountry: { key: string; label: string };
  crossBorder: boolean;
  routeFamiliarity: YouthMobilityRouteFamiliarity;
  status: YouthMobilityStatus;
  overallRiskScore: number;
  riskBand: YouthMobilityRiskBand;
  confidence: YouthMobilityConfidence;
  clubDecisionAdjustment: YouthMobilityClubDecisionAdjustment;
  dimensions: Record<YouthMobilityDimensionId, YouthMobilityDimension>;
  visibleReasons: string[];
  suggestedMitigationActions: string[];
  modelNotice: string;
}

export const YOUTH_MOBILITY_MODEL_NOTICE =
  "Gameplay abstraction only: registration/work-permit status is not a statement of real-world law or a player's actual eligibility.";

type LanguageKey =
  | "arabic"
  | "english"
  | "french"
  | "german"
  | "japanese"
  | "korean"
  | "mandarin"
  | "portuguese"
  | "spanish";

type LanguageFamily = "germanic" | "romance";

interface CountryMobilityProfile {
  languages: readonly LanguageKey[];
  languageFamily?: LanguageFamily;
  culturalArea: string;
  macroRegion: string;
}

/**
 * Coarse game-content bridges for bundled countries. These describe likely
 * support needs, never an individual player's identity, fluency, or values.
 * Unknown/modded countries use a conservative fallback instead of guessing.
 */
const COUNTRY_PROFILES: Readonly<Record<string, CountryMobilityProfile>> = {
  argentina: { languages: ["spanish"], languageFamily: "romance", culturalArea: "latin-america", macroRegion: "americas" },
  australia: { languages: ["english"], languageFamily: "germanic", culturalArea: "oceania", macroRegion: "oceania" },
  brazil: { languages: ["portuguese"], languageFamily: "romance", culturalArea: "latin-america", macroRegion: "americas" },
  cameroon: { languages: ["french", "english"], languageFamily: "romance", culturalArea: "west-central-africa", macroRegion: "africa" },
  canada: { languages: ["english", "french"], languageFamily: "germanic", culturalArea: "north-america", macroRegion: "americas" },
  china: { languages: ["mandarin"], culturalArea: "east-asia", macroRegion: "east-asia" },
  egypt: { languages: ["arabic"], culturalArea: "north-africa", macroRegion: "africa" },
  england: { languages: ["english"], languageFamily: "germanic", culturalArea: "british-isles", macroRegion: "europe" },
  france: { languages: ["french"], languageFamily: "romance", culturalArea: "western-europe", macroRegion: "europe" },
  germany: { languages: ["german"], languageFamily: "germanic", culturalArea: "central-europe", macroRegion: "europe" },
  ghana: { languages: ["english"], languageFamily: "germanic", culturalArea: "west-africa", macroRegion: "africa" },
  ivorycoast: { languages: ["french"], languageFamily: "romance", culturalArea: "west-africa", macroRegion: "africa" },
  japan: { languages: ["japanese"], culturalArea: "east-asia", macroRegion: "east-asia" },
  mexico: { languages: ["spanish"], languageFamily: "romance", culturalArea: "latin-america", macroRegion: "americas" },
  newzealand: { languages: ["english"], languageFamily: "germanic", culturalArea: "oceania", macroRegion: "oceania" },
  nigeria: { languages: ["english"], languageFamily: "germanic", culturalArea: "west-africa", macroRegion: "africa" },
  saudiarabia: { languages: ["arabic"], culturalArea: "gulf", macroRegion: "middle-east" },
  senegal: { languages: ["french"], languageFamily: "romance", culturalArea: "west-africa", macroRegion: "africa" },
  southafrica: { languages: ["english"], languageFamily: "germanic", culturalArea: "southern-africa", macroRegion: "africa" },
  southkorea: { languages: ["korean"], culturalArea: "east-asia", macroRegion: "east-asia" },
  spain: { languages: ["spanish"], languageFamily: "romance", culturalArea: "southern-europe", macroRegion: "europe" },
  usa: { languages: ["english"], languageFamily: "germanic", culturalArea: "north-america", macroRegion: "americas" },
};

const DEFAULT_WORLD_CONTEXT: Required<YouthMobilityWorldContext> = {
  developmentMultiplier: 1,
  opportunityMultiplier: 1,
  travelDurationDelta: 0,
  travelFatigueMultiplier: 1,
};

interface MobilityGeography {
  originKey: string;
  originLabel: string;
  targetKey: string;
  targetLabel: string;
  crossBorder: boolean;
  routeFamiliarity: YouthMobilityRouteFamiliarity;
  originProfile?: CountryMobilityProfile;
  targetProfile?: CountryMobilityProfile;
  sharedLanguage: boolean;
  relatedLanguage: boolean;
  sameCulturalArea: boolean;
  sameMacroRegion: boolean;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function score(value: number): number {
  return Math.round(clamp(Number.isFinite(value) ? value : 50, 0, 100));
}

function compactCountry(value?: string): string | undefined {
  const compact = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return compact || undefined;
}

function resolveOriginCountry(country: string, nationality: string): string {
  return (
    normalizeCountryKey(country)
    ?? countryKeyFromNationality(country)
    ?? normalizeCountryKey(nationality)
    ?? countryKeyFromNationality(nationality)
    ?? compactCountry(country)
    ?? compactCountry(nationality)
    ?? "unknown"
  );
}

function resolveTargetCountry(country: string): string {
  return normalizeCountryKey(country) ?? compactCountry(country) ?? "unknown";
}

function routeFamiliarity(
  originCountry: string,
  targetCountry: string,
  crossBorder: boolean,
): YouthMobilityRouteFamiliarity {
  if (!crossBorder) return "domestic";
  const flow = getTransferFlowProbability(originCountry, targetCountry);
  if (flow >= 0.12) return "established";
  if (flow >= 0.05) return "familiar";
  return "uncommon";
}

function buildGeography(input: YouthMobilityAssessmentInput): MobilityGeography {
  const originKey = resolveOriginCountry(
    input.youth.country,
    input.youth.player.nationality,
  );
  const targetKey = resolveTargetCountry(input.targetLeague.country);
  const crossBorder = originKey !== targetKey;
  const originProfile = COUNTRY_PROFILES[originKey];
  const targetProfile = COUNTRY_PROFILES[targetKey];
  const sharedLanguage = !!originProfile && !!targetProfile
    && originProfile.languages.some((language) => targetProfile.languages.includes(language));
  const relatedLanguage = !!originProfile?.languageFamily
    && originProfile.languageFamily === targetProfile?.languageFamily;

  return {
    originKey,
    originLabel: getCountryDisplayName(originKey),
    targetKey,
    targetLabel: getCountryDisplayName(targetKey),
    crossBorder,
    routeFamiliarity: routeFamiliarity(originKey, targetKey, crossBorder),
    originProfile,
    targetProfile,
    sharedLanguage,
    relatedLanguage,
    sameCulturalArea: !!originProfile && !!targetProfile
      && originProfile.culturalArea === targetProfile.culturalArea,
    sameMacroRegion: !!originProfile && !!targetProfile
      && originProfile.macroRegion === targetProfile.macroRegion,
  };
}

function worldContext(input: YouthMobilityAssessmentInput): Required<YouthMobilityWorldContext> {
  return {
    developmentMultiplier: finiteOr(
      input.worldContext?.developmentMultiplier,
      DEFAULT_WORLD_CONTEXT.developmentMultiplier,
    ),
    opportunityMultiplier: finiteOr(
      input.worldContext?.opportunityMultiplier,
      DEFAULT_WORLD_CONTEXT.opportunityMultiplier,
    ),
    travelDurationDelta: finiteOr(
      input.worldContext?.travelDurationDelta,
      DEFAULT_WORLD_CONTEXT.travelDurationDelta,
    ),
    travelFatigueMultiplier: finiteOr(
      input.worldContext?.travelFatigueMultiplier,
      DEFAULT_WORLD_CONTEXT.travelFatigueMultiplier,
    ),
  };
}

function travelPressure(context: Required<YouthMobilityWorldContext>): number {
  return clamp(
    (context.travelFatigueMultiplier - 1) * 18 + context.travelDurationDelta * 2,
    -6,
    12,
  );
}

function routeReduction(route: YouthMobilityRouteFamiliarity): number {
  if (route === "established") return 10;
  if (route === "familiar") return 5;
  return 0;
}

function dimensionStatus(riskScore: number): YouthMobilityStatus {
  return riskScore >= 40 ? "conditional" : "clear";
}

function registrationDimension(
  input: YouthMobilityAssessmentInput,
  geography: MobilityGeography,
): YouthMobilityDimension {
  const age = Number.isFinite(input.youth.player.age)
    ? Math.max(0, Math.floor(input.youth.player.age))
    : 18;

  if (!geography.crossBorder) {
    return {
      id: "registration",
      label: "Registration and work-permit friction",
      riskScore: 2,
      status: "clear",
      summary: `This is a domestic move inside ${geography.targetLabel}, so the game applies no cross-border registration gate.`,
      reasons: ["Origin and destination resolve to the same canonical country."],
      mitigationActions: [],
    };
  }

  if (age < 16) {
    return {
      id: "registration",
      label: "Registration and work-permit friction",
      riskScore: 96,
      status: "blocked",
      summary: "The game blocks this cross-border youth placement until an age-eligible or domestic route is available.",
      reasons: [
        `The prospect is ${age}; the Youth Scout model blocks cross-border placements below 16.`,
        `The ${geography.originLabel} to ${geography.targetLabel} route is ${geography.routeFamiliarity}, but route familiarity never overrides the age gate.`,
      ],
      mitigationActions: [
        "Keep the prospect on a domestic development pathway and review the move after their 16th birthday.",
        "Do not progress the cross-border placement until the in-game registration gate clears.",
      ],
    };
  }

  let risk = age <= 17 ? 63 : 34;
  risk -= routeReduction(geography.routeFamiliarity);
  if (geography.sameMacroRegion) risk -= 6;
  if (input.targetClub.scoutingPhilosophy === "globalRecruiter") risk -= 3;
  const riskScore = score(risk);
  const status: YouthMobilityStatus = age <= 17
    ? "conditional"
    : dimensionStatus(riskScore);

  return {
    id: "registration",
    label: "Registration and work-permit friction",
    riskScore,
    status,
    summary: age <= 17
      ? "The game requires youth-registration, guardian, and education clearance before this cross-border move can complete."
      : "The game requires a cross-border registration/work-permit check before commitment; route familiarity can lower, but not erase, that work.",
    reasons: [
      `The prospect is ${age}, moving from ${geography.originLabel} to ${geography.targetLabel}.`,
      `The existing transfer-flow model treats this route as ${geography.routeFamiliarity}.`,
    ],
    mitigationActions: [
      "Record in-game registration/work-permit clearance before making a final commitment.",
      ...(age <= 17
        ? ["Confirm the guardian, education, and safeguarding plan before the placement advances."]
        : []),
    ],
  };
}

function adaptationDimension(
  input: YouthMobilityAssessmentInput,
  geography: MobilityGeography,
  context: Required<YouthMobilityWorldContext>,
): YouthMobilityDimension {
  if (!geography.crossBorder) {
    return {
      id: "adaptation",
      label: "Language and cultural adaptation",
      riskScore: 4,
      status: "clear",
      summary: "A domestic move carries minimal modeled language and cultural transition.",
      reasons: ["The prospect remains in the same country context."],
      mitigationActions: [],
    };
  }

  const languageRisk = geography.sharedLanguage
    ? 8
    : geography.relatedLanguage
      ? 25
      : geography.originProfile && geography.targetProfile
        ? 58
        : 48;
  const cultureRisk = geography.sameCulturalArea
    ? 8
    : geography.sameMacroRegion
      ? 24
      : geography.originProfile && geography.targetProfile
        ? 52
        : 44;
  const age = input.youth.player.age;
  const agePressure = age < 16 ? 10 : age <= 17 ? 5 : 0;
  const academySupport = input.targetClub.youthAcademyRating >= 16
    ? 6
    : input.targetClub.youthAcademyRating >= 12
      ? 3
      : 0;
  const riskScore = score(
    languageRisk * 0.58
      + cultureRisk * 0.42
      + agePressure
      + travelPressure(context)
      - routeReduction(geography.routeFamiliarity) * 0.7
      - academySupport,
  );
  const reasons = [
    geography.sharedLanguage
      ? "The game geography has a shared football-language bridge between origin and destination."
      : geography.relatedLanguage
        ? "The modeled language groups are related, but structured language support is still warranted."
        : geography.originProfile && geography.targetProfile
          ? "No shared language bridge is represented for this route."
          : "At least one country lacks an authored mobility profile, so the model does not guess at fluency.",
    geography.sameCulturalArea
      ? "Origin and destination share the same broad adaptation area in the game model."
      : geography.sameMacroRegion
        ? "The move remains inside one broad world region, limiting some transition pressure."
        : "The move crosses broad world regions, increasing day-to-day adjustment needs.",
  ];
  if (Math.abs(travelPressure(context)) >= 1) {
    reasons.push(
      travelPressure(context) > 0
        ? "Current public world conditions add travel and settling pressure."
        : "Current public world conditions modestly ease travel and settling pressure.",
    );
  }

  return {
    id: "adaptation",
    label: "Language and cultural adaptation",
    riskScore,
    status: dimensionStatus(riskScore),
    summary: `The ${geography.originLabel} to ${geography.targetLabel} move carries ${riskScore >= 60 ? "substantial" : riskScore >= 40 ? "material" : "manageable"} modeled adaptation work.`,
    reasons,
    mitigationActions: riskScore >= 40
      ? [
          "Provide structured language support from arrival through the first pathway review.",
          "Assign a club mentor or player liaison with clear settling responsibilities.",
        ]
      : ["Check adaptation at the first 6-week pathway review."],
  };
}

function familyEducationDimension(
  input: YouthMobilityAssessmentInput,
  geography: MobilityGeography,
  context: Required<YouthMobilityWorldContext>,
): YouthMobilityDimension {
  if (!geography.crossBorder) {
    return {
      id: "familyEducation",
      label: "Family relocation and education pressure",
      riskScore: 5,
      status: "clear",
      summary: "No international family relocation is required by this domestic pathway.",
      reasons: ["The modeled move stays inside the prospect's origin country."],
      mitigationActions: ["Keep education and travel commitments in the normal pathway review."],
    };
  }

  const age = input.youth.player.age;
  const distanceRisk = geography.sameCulturalArea
    ? 35
    : geography.sameMacroRegion
      ? 48
      : geography.originProfile && geography.targetProfile
        ? 64
        : 58;
  const agePressure = age < 16 ? 18 : age <= 17 ? 10 : 0;
  const academySupport = input.targetClub.youthAcademyRating >= 16
    ? 8
    : input.targetClub.youthAcademyRating >= 12
      ? 4
      : 0;
  const philosophySupport = input.targetClub.scoutingPhilosophy === "academyFirst" ? 4 : 0;
  const riskScore = score(
    distanceRisk
      + agePressure
      + travelPressure(context)
      - routeReduction(geography.routeFamiliarity) * 0.8
      - academySupport
      - philosophySupport,
  );

  return {
    id: "familyEducation",
    label: "Family relocation and education pressure",
    riskScore,
    status: dimensionStatus(riskScore),
    summary: age < 18
      ? "An international move at this age requires a credible guardian, housing, education, and family-contact plan."
      : "The move requires a credible housing, education/training, and personal support plan.",
    reasons: [
      `At age ${Math.floor(age)}, relocation continuity matters alongside the football pathway.`,
      geography.sameMacroRegion
        ? "The destination is in the same broad region, reducing but not removing relocation pressure."
        : "The destination crosses broad regions, increasing travel and family-contact pressure.",
      "No individual family preference is inferred; this score flags planning questions that must be verified.",
    ],
    mitigationActions: age < 18
      ? [
          "Hold a parent/guardian meeting and record consent, concerns, and non-negotiables.",
          "Document guardianship, housing, education continuity, travel home, and emergency support before approval.",
        ]
      : [
          "Document housing, education/training continuity, travel home, and the local support network.",
          "Use a staged visit before commitment when the move crosses broad regions.",
        ],
  };
}

function philosophySupport(philosophy: Club["scoutingPhilosophy"]): number {
  if (philosophy === "academyFirst") return 12;
  if (philosophy === "globalRecruiter") return 7;
  if (philosophy === "marketSmart") return 2;
  return -8;
}

function visibleClubSupportScore(input: YouthMobilityAssessmentInput): number {
  const academyRating = clamp(input.targetClub.youthAcademyRating, 0, 20);
  let support = 50 + (academyRating - 10) * 3;
  support += philosophySupport(input.targetClub.scoutingPhilosophy);

  if (input.targetLeague.tier >= 2) support += 5;
  if (input.targetLeague.tier === 1 && input.targetClub.reputation >= 75) support -= 7;

  const seniorSize = input.targetClub.playerIds.length;
  const academySize = input.targetClub.academyPlayerIds?.length ?? 0;
  if (seniorSize >= 28) support -= 8;
  else if (seniorSize >= 24) support -= 4;
  if (academySize >= 24) support -= 8;
  else if (academySize >= 16) support -= 4;

  return score(support);
}

function pathwaySupportDimension(
  input: YouthMobilityAssessmentInput,
  context: Required<YouthMobilityWorldContext>,
): YouthMobilityDimension {
  const projection = input.developmentEnvironment;
  let supportScore = projection
    ? score(projection.score)
    : visibleClubSupportScore(input);
  supportScore = score(
    supportScore
      + (context.developmentMultiplier - 1) * 50
      + (context.opportunityMultiplier - 1) * 25,
  );
  const riskScore = 100 - supportScore;
  const pathwayFactor = projection?.factors.find((factor) => factor.id === "playing-pathway");
  const academyFactor = projection?.factors.find((factor) => factor.id === "academy");
  const reasons = projection
    ? [
        `The player-safe development projection rates the destination ${projection.score}/100 (${projection.band}).`,
        ...(pathwayFactor ? [pathwayFactor.summary] : academyFactor ? [academyFactor.summary] : []),
      ]
    : [
        `${input.targetClub.name} has a visible ${input.targetClub.youthAcademyRating}/20 academy and an ${input.targetClub.scoutingPhilosophy.replace(/([A-Z])/g, " $1").toLowerCase()} recruitment philosophy.`,
        `Broad capacity is ${input.targetClub.playerIds.length} senior players and ${input.targetClub.academyPlayerIds?.length ?? 0} academy players; this does not infer position-specific competition.`,
      ];
  if (context.developmentMultiplier !== 1 || context.opportunityMultiplier !== 1) {
    reasons.push(
      context.developmentMultiplier + context.opportunityMultiplier >= 2
        ? "Current public world conditions support development continuity and opportunity."
        : "Current public world conditions weaken development continuity or opportunity.",
    );
  }

  const mitigationActions: string[] = [];
  if (riskScore >= 40) {
    mitigationActions.push(
      "Agree the initial training group, expected match level, and fallback pathway before placement.",
    );
  }
  if (input.targetClub.youthAcademyRating < 12) {
    mitigationActions.push(
      "Require a named coaching and education support package or compare a stronger academy destination.",
    );
  }
  mitigationActions.push(
    "Set 6- and 12-week reviews for training access, education continuity, adaptation, and match exposure.",
  );

  return {
    id: "pathwaySupport",
    label: "Pathway and support quality",
    riskScore,
    status: dimensionStatus(riskScore),
    summary: `${input.targetClub.name} currently offers a ${supportScore >= 70 ? "strong" : supportScore >= 55 ? "workable" : "fragile"} visible support proposition (${supportScore}/100).`,
    reasons,
    mitigationActions,
  };
}

function assessmentConfidence(
  input: YouthMobilityAssessmentInput,
  geography: MobilityGeography,
): YouthMobilityConfidence {
  const knowledge = input.targetRegionalKnowledge;
  const knowledgeCountry = knowledge
    ? resolveTargetCountry(knowledge.countryId)
    : undefined;
  const matched = !!knowledge && knowledgeCountry === geography.targetKey;
  const confidenceScore = matched
    ? score(
        20
          + clamp(knowledge.knowledgeLevel, 0, 100) * 0.65
          + Math.min(4, knowledge.culturalInsights.length) * 3
          + Math.min(3, knowledge.localContacts.length) * 4,
      )
    : 20;
  const band: YouthMobilityConfidenceBand = confidenceScore >= 75
    ? "strong"
    : confidenceScore >= 45
      ? "working"
      : "limited";

  return {
    score: confidenceScore,
    band,
    summary: matched
      ? `${geography.targetLabel} dossier knowledge is ${Math.round(clamp(knowledge.knowledgeLevel, 0, 100))}/100, giving this assessment ${band} local context.`
      : knowledge
        ? `The supplied regional dossier covers ${getCountryDisplayName(knowledgeCountry)}, not ${geography.targetLabel}; it is not used as target-country evidence.`
        : `No ${geography.targetLabel} regional dossier was supplied, so local-context confidence is limited.`,
  };
}

function riskBand(scoreValue: number): YouthMobilityRiskBand {
  if (scoreValue < 25) return "low";
  if (scoreValue < 45) return "guarded";
  if (scoreValue < 70) return "high";
  return "severe";
}

function clubDecisionAdjustment(
  status: YouthMobilityStatus,
  overallRiskScore: number,
): YouthMobilityClubDecisionAdjustment {
  if (status === "blocked") {
    return {
      score: -12,
      summary: "The in-game mobility gate is blocked. The score penalty is only explanatory; the placement must not proceed until the gate clears.",
    };
  }

  const rawAdjustment = Math.round((32 - overallRiskScore) / 5);
  const scoreAdjustment = clamp(
    status === "conditional" ? Math.min(0, rawAdjustment) : rawAdjustment,
    -12,
    3,
  );

  return {
    score: scoreAdjustment,
    summary: scoreAdjustment > 0
      ? `The visible mobility plan modestly supports the club's decision (+${scoreAdjustment}).`
      : scoreAdjustment < 0
        ? `The visible mobility risks add caution to the club's decision (${scoreAdjustment}).`
        : status === "conditional"
          ? "The route remains conditional; mitigation and verification are required before commitment."
          : "The visible mobility context is neutral in the club's decision.",
  };
}

function unique(values: readonly string[], limit: number): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].slice(0, limit);
}

/**
 * Assess one visible youth-to-club route. The function is deterministic,
 * side-effect free, and stable for identical inputs.
 */
export function assessYouthMobility(
  input: YouthMobilityAssessmentInput,
): YouthMobilityAssessment {
  const geography = buildGeography(input);
  const context = worldContext(input);
  const confidence = assessmentConfidence(input, geography);
  const registration = registrationDimension(input, geography);
  const adaptation = adaptationDimension(input, geography, context);
  const familyEducation = familyEducationDimension(input, geography, context);
  const pathwaySupport = pathwaySupportDimension(input, context);
  const dimensions: YouthMobilityAssessment["dimensions"] = {
    registration,
    adaptation,
    familyEducation,
    pathwaySupport,
  };
  const uncertaintyPenalty = confidence.band === "limited"
    ? 8
    : confidence.band === "working"
      ? 3
      : 0;
  let overallRiskScore = score(
    registration.riskScore * 0.32
      + adaptation.riskScore * 0.2
      + familyEducation.riskScore * 0.22
      + pathwaySupport.riskScore * 0.26
      + uncertaintyPenalty,
  );
  if (registration.status === "blocked") {
    overallRiskScore = Math.max(70, overallRiskScore);
  }
  const status: YouthMobilityStatus = registration.status === "blocked"
    ? "blocked"
    : Object.values(dimensions).some((dimension) => dimension.status === "conditional")
      ? "conditional"
      : "clear";
  const decisionAdjustment = clubDecisionAdjustment(status, overallRiskScore);
  const orderedByRisk = Object.values(dimensions)
    .map((dimension, index) => ({ dimension, index }))
    .sort((a, b) => b.dimension.riskScore - a.dimension.riskScore || a.index - b.index)
    .map(({ dimension }) => `${dimension.label}: ${dimension.summary}`);
  const confidenceMitigation = confidence.band === "limited"
    ? ["Use a target-country visit or local contact to validate registration, education, and club-support assumptions."]
    : [];

  return {
    prospectId: input.youth.id,
    playerId: input.youth.player.id,
    originCountry: { key: geography.originKey, label: geography.originLabel },
    targetCountry: { key: geography.targetKey, label: geography.targetLabel },
    crossBorder: geography.crossBorder,
    routeFamiliarity: geography.routeFamiliarity,
    status,
    overallRiskScore,
    riskBand: riskBand(overallRiskScore),
    confidence,
    clubDecisionAdjustment: decisionAdjustment,
    dimensions,
    visibleReasons: unique([...orderedByRisk, confidence.summary], 5),
    suggestedMitigationActions: unique([
      ...registration.mitigationActions,
      ...familyEducation.mitigationActions,
      ...adaptation.mitigationActions,
      ...pathwaySupport.mitigationActions,
      ...confidenceMitigation,
    ], 8),
    modelNotice: YOUTH_MOBILITY_MODEL_NOTICE,
  };
}
