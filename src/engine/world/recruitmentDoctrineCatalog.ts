import {
  CONTENT_SCHEMA_VERSION,
  ContentValidationError,
  defineContentPack,
  hasNonBlankString,
  type ContentValidationIssue,
} from "@/engine/content/contracts";
import type {
  ScoutingPhilosophy,
  Specialization,
  YouthBriefPriority,
} from "@/engine/core/types";

export type RecruitmentEvidencePreference = "live" | "data" | "network" | "balanced";
export type RecruitmentRiskTolerance = "low" | "medium" | "high";
export type RecruitmentReach = "local" | "regional" | "international" | "global";
export type RecruitmentFocus = YouthBriefPriority;

export type ClubRecruitmentExpressionId =
  | "academyLocalRoots"
  | "academyMentorLadder"
  | "academyPathwayWorkbench"
  | "academyCommunityAnchor"
  | "academyScholarBridge"
  | "winNowPromotionSiege"
  | "winNowSpineStabilizer"
  | "winNowTacticalLock"
  | "winNowLoanStrike"
  | "winNowVeteranPatch"
  | "marketSmartArbitrageCycle"
  | "marketSmartContractExpiryHunt"
  | "marketSmartSellOnWorkshop"
  | "marketSmartMinutesMarketplace"
  | "marketSmartRoleConversionDesk"
  | "globalDiasporaMesh"
  | "globalSatelliteBridge"
  | "globalPassportPortfolio"
  | "globalPermitChessboard"
  | "globalShowcaseCircuit";

export interface DoctrineBase {
  preferredSeniorAgeRange: [number, number];
  academyIntakeAgeRange: [number, number];
  evidencePreference: RecruitmentEvidencePreference;
  riskTolerance: RecruitmentRiskTolerance;
  geographicReach: RecruitmentReach;
  adaptationTolerance: number;
  pathwayPatience: number;
  tacticalRoleRigidity: number;
  sellingPressure: number;
  managerInfluence: number;
  specializationAffinity: Specialization[];
}

export interface DoctrineExpression {
  id: ClubRecruitmentExpressionId;
  label: string;
  overrides: Partial<DoctrineBase>;
  objectiveWeights?: Partial<Record<RecruitmentFocus, number>>;
  reason: string;
}

export interface RecruitmentDoctrineFamilyDefinition {
  family: ScoutingPhilosophy;
  doctrineFamilyVersion: 1;
  base: DoctrineBase;
  expressions: readonly DoctrineExpression[];
}

const PHILOSOPHY_ORDER: readonly ScoutingPhilosophy[] = [
  "academyFirst",
  "winNow",
  "marketSmart",
  "globalRecruiter",
];

const FOCUS_ORDER: readonly RecruitmentFocus[] = [
  "highCeiling",
  "earlyReadiness",
  "resale",
  "character",
];

const EVIDENCE_PREFERENCES = new Set<RecruitmentEvidencePreference>([
  "live",
  "data",
  "network",
  "balanced",
]);

const RISK_TOLERANCES = new Set<RecruitmentRiskTolerance>([
  "low",
  "medium",
  "high",
]);

const REACH_VALUES = new Set<RecruitmentReach>([
  "local",
  "regional",
  "international",
  "global",
]);

const SPECIALIZATIONS = new Set<Specialization>([
  "youth",
  "firstTeam",
  "regional",
  "data",
]);

function pushTraitIssue(
  issues: Array<Omit<ContentValidationIssue, "packId" | "definitionId">>,
  path: string,
  value: number | undefined,
): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    issues.push({
      path,
      message: "must be a finite doctrine trait between 0 and 100",
    });
  }
}

function pushAgeRangeIssue(
  issues: Array<Omit<ContentValidationIssue, "packId" | "definitionId">>,
  path: string,
  range: [number, number] | undefined,
): void {
  if (!range) return;
  const [minimum, maximum] = range;
  if (
    !Number.isInteger(minimum)
    || !Number.isInteger(maximum)
    || minimum < 14
    || maximum > 40
    || minimum > maximum
  ) {
    issues.push({
      path,
      message: "must be an integer age range between 14 and 40 with min <= max",
    });
  }
}

function pushSpecializationIssues(
  issues: Array<Omit<ContentValidationIssue, "packId" | "definitionId">>,
  path: string,
  affinities: readonly Specialization[] | undefined,
): void {
  if (!affinities) return;
  if (affinities.length === 0) {
    issues.push({ path, message: "must contain at least one specialization" });
    return;
  }
  if (affinities.some((value) => !SPECIALIZATIONS.has(value))) {
    issues.push({ path, message: "must contain only supported specializations" });
  }
  if (new Set(affinities).size !== affinities.length) {
    issues.push({ path, message: "must not contain duplicate specializations" });
  }
}

function pushBaseIssues(
  issues: Array<Omit<ContentValidationIssue, "packId" | "definitionId">>,
  base: Partial<DoctrineBase>,
  pathPrefix: string,
): void {
  pushAgeRangeIssue(issues, `${pathPrefix}.preferredSeniorAgeRange`, base.preferredSeniorAgeRange);
  pushAgeRangeIssue(issues, `${pathPrefix}.academyIntakeAgeRange`, base.academyIntakeAgeRange);
  if (base.evidencePreference !== undefined && !EVIDENCE_PREFERENCES.has(base.evidencePreference)) {
    issues.push({
      path: `${pathPrefix}.evidencePreference`,
      message: "must be a supported evidence preference",
    });
  }
  if (base.riskTolerance !== undefined && !RISK_TOLERANCES.has(base.riskTolerance)) {
    issues.push({
      path: `${pathPrefix}.riskTolerance`,
      message: "must be a supported risk tolerance",
    });
  }
  if (base.geographicReach !== undefined && !REACH_VALUES.has(base.geographicReach)) {
    issues.push({
      path: `${pathPrefix}.geographicReach`,
      message: "must be a supported recruitment reach",
    });
  }
  pushTraitIssue(issues, `${pathPrefix}.adaptationTolerance`, base.adaptationTolerance);
  pushTraitIssue(issues, `${pathPrefix}.pathwayPatience`, base.pathwayPatience);
  pushTraitIssue(issues, `${pathPrefix}.tacticalRoleRigidity`, base.tacticalRoleRigidity);
  pushTraitIssue(issues, `${pathPrefix}.sellingPressure`, base.sellingPressure);
  pushTraitIssue(issues, `${pathPrefix}.managerInfluence`, base.managerInfluence);
  pushSpecializationIssues(issues, `${pathPrefix}.specializationAffinity`, base.specializationAffinity);
}

function pushObjectiveWeightIssues(
  issues: Array<Omit<ContentValidationIssue, "packId" | "definitionId">>,
  expression: DoctrineExpression,
  index: number,
): void {
  if (!expression.objectiveWeights) return;
  const entries = Object.entries(expression.objectiveWeights);
  if (entries.length === 0) {
    issues.push({
      path: `expressions[${index}].objectiveWeights`,
      message: "must contain at least one weighted focus when provided",
    });
  }
  for (const [focus, weight] of entries) {
    if (!FOCUS_ORDER.includes(focus as RecruitmentFocus)) {
      issues.push({
        path: `expressions[${index}].objectiveWeights.${focus}`,
        message: "must target a supported recruitment focus",
      });
      continue;
    }
    if (!Number.isFinite(weight) || weight < 0 || weight > 10) {
      issues.push({
        path: `expressions[${index}].objectiveWeights.${focus}`,
        message: "must be a finite weight between 0 and 10",
      });
    }
  }
}

function validateRecruitmentDoctrineFamily(
  definition: RecruitmentDoctrineFamilyDefinition,
): readonly Omit<ContentValidationIssue, "packId" | "definitionId">[] {
  const issues: Array<Omit<ContentValidationIssue, "packId" | "definitionId">> = [];

  if (!PHILOSOPHY_ORDER.includes(definition.family)) {
    issues.push({
      path: "family",
      message: "must be a supported scouting philosophy",
    });
  }
  if (definition.doctrineFamilyVersion !== 1) {
    issues.push({
      path: "doctrineFamilyVersion",
      message: "must remain version 1 for save-compatible authored doctrine families",
    });
  }

  pushBaseIssues(issues, definition.base, "base");

  if (definition.expressions.length < 5) {
    issues.push({
      path: "expressions",
      message: "must contain at least five authored expressions per philosophy",
    });
  }

  const seenIds = new Set<string>();
  definition.expressions.forEach((expression, index) => {
    if (!hasNonBlankString(expression.id)) {
      issues.push({
        path: `expressions[${index}].id`,
        message: "must be a non-empty stable expression id",
      });
    }
    if (seenIds.has(expression.id)) {
      issues.push({
        path: `expressions[${index}].id`,
        message: "must be unique within its doctrine family",
      });
    }
    seenIds.add(expression.id);
    if (!hasNonBlankString(expression.label)) {
      issues.push({
        path: `expressions[${index}].label`,
        message: "must be a non-empty player-facing label",
      });
    }
    if (!hasNonBlankString(expression.reason)) {
      issues.push({
        path: `expressions[${index}].reason`,
        message: "must be a non-empty explanation",
      });
    }
    pushBaseIssues(issues, expression.overrides, `expressions[${index}].overrides`);
    pushObjectiveWeightIssues(issues, expression, index);
  });

  return issues;
}

const RECRUITMENT_DOCTRINE_FAMILY_ENTRIES: readonly RecruitmentDoctrineFamilyDefinition[] = [
  {
    family: "academyFirst",
    doctrineFamilyVersion: 1,
    base: {
      preferredSeniorAgeRange: [17, 23],
      academyIntakeAgeRange: [14, 16],
      evidencePreference: "live",
      riskTolerance: "high",
      geographicReach: "regional",
      adaptationTolerance: 62,
      pathwayPatience: 86,
      tacticalRoleRigidity: 38,
      sellingPressure: 34,
      managerInfluence: 44,
      specializationAffinity: ["youth", "regional"],
    },
    expressions: [
      {
        id: "academyLocalRoots",
        label: "Local roots network",
        overrides: {
          preferredSeniorAgeRange: [17, 22],
          academyIntakeAgeRange: [14, 15],
          evidencePreference: "live",
          geographicReach: "local",
          adaptationTolerance: 54,
          pathwayPatience: 90,
          tacticalRoleRigidity: 34,
          sellingPressure: 28,
          managerInfluence: 40,
          specializationAffinity: ["youth", "regional"],
        },
        objectiveWeights: { highCeiling: 6, character: 3 },
        reason: "The club trusts local pathway familiarity and accepts slower integration to protect academy continuity.",
      },
      {
        id: "academyMentorLadder",
        label: "Mentor ladder",
        overrides: {
          preferredSeniorAgeRange: [18, 24],
          academyIntakeAgeRange: [15, 16],
          evidencePreference: "balanced",
          geographicReach: "regional",
          adaptationTolerance: 68,
          pathwayPatience: 82,
          tacticalRoleRigidity: 42,
          sellingPressure: 30,
          managerInfluence: 50,
          specializationAffinity: ["youth", "firstTeam"],
        },
        objectiveWeights: { highCeiling: 5, earlyReadiness: 3 },
        reason: "The academy is built to hand prospects to senior mentors faster without abandoning developmental patience.",
      },
      {
        id: "academyPathwayWorkbench",
        label: "Pathway workbench",
        overrides: {
          preferredSeniorAgeRange: [17, 23],
          academyIntakeAgeRange: [14, 16],
          evidencePreference: "data",
          geographicReach: "regional",
          adaptationTolerance: 64,
          pathwayPatience: 78,
          tacticalRoleRigidity: 48,
          sellingPressure: 42,
          managerInfluence: 46,
          specializationAffinity: ["youth", "data", "regional"],
        },
        objectiveWeights: { highCeiling: 4, resale: 3, character: 2 },
        reason: "The club measures pathway decisions aggressively and tolerates more structured role planning inside the academy.",
      },
      {
        id: "academyCommunityAnchor",
        label: "Community anchor",
        overrides: {
          preferredSeniorAgeRange: [16, 21],
          academyIntakeAgeRange: [14, 15],
          evidencePreference: "live",
          geographicReach: "local",
          adaptationTolerance: 46,
          pathwayPatience: 94,
          tacticalRoleRigidity: 28,
          sellingPressure: 22,
          managerInfluence: 36,
          specializationAffinity: ["youth", "regional"],
        },
        objectiveWeights: { highCeiling: 4, character: 4, earlyReadiness: 1 },
        reason: "The pathway is treated as a community institution first, keeping intake hyper-local and minimizing disruption even when the upside matures slowly.",
      },
      {
        id: "academyScholarBridge",
        label: "Scholar bridge",
        overrides: {
          preferredSeniorAgeRange: [18, 23],
          academyIntakeAgeRange: [15, 17],
          evidencePreference: "balanced",
          geographicReach: "international",
          adaptationTolerance: 74,
          pathwayPatience: 66,
          tacticalRoleRigidity: 58,
          sellingPressure: 38,
          managerInfluence: 58,
          specializationAffinity: ["youth", "data", "firstTeam"],
        },
        objectiveWeights: { highCeiling: 3, earlyReadiness: 4, character: 2 },
        reason: "The club builds a faster bridge from scholarship intake to senior football, expanding search range when structured support can accelerate adaptation.",
      },
    ],
  },
  {
    family: "winNow",
    doctrineFamilyVersion: 1,
    base: {
      preferredSeniorAgeRange: [24, 31],
      academyIntakeAgeRange: [16, 17],
      evidencePreference: "live",
      riskTolerance: "low",
      geographicReach: "international",
      adaptationTolerance: 36,
      pathwayPatience: 22,
      tacticalRoleRigidity: 78,
      sellingPressure: 18,
      managerInfluence: 72,
      specializationAffinity: ["firstTeam", "data"],
    },
    expressions: [
      {
        id: "winNowPromotionSiege",
        label: "Promotion siege",
        overrides: {
          preferredSeniorAgeRange: [23, 30],
          academyIntakeAgeRange: [16, 17],
          evidencePreference: "live",
          riskTolerance: "low",
          geographicReach: "international",
          adaptationTolerance: 30,
          pathwayPatience: 18,
          tacticalRoleRigidity: 82,
          sellingPressure: 14,
          managerInfluence: 78,
          specializationAffinity: ["firstTeam", "regional"],
        },
        objectiveWeights: { earlyReadiness: 6, character: 2 },
        reason: "Short-term pressure compresses integration time and raises demand for immediate tactical trust.",
      },
      {
        id: "winNowSpineStabilizer",
        label: "Spine stabilizer",
        overrides: {
          preferredSeniorAgeRange: [24, 32],
          academyIntakeAgeRange: [15, 17],
          evidencePreference: "balanced",
          riskTolerance: "low",
          geographicReach: "international",
          adaptationTolerance: 40,
          pathwayPatience: 24,
          tacticalRoleRigidity: 74,
          sellingPressure: 20,
          managerInfluence: 68,
          specializationAffinity: ["firstTeam", "data"],
        },
        objectiveWeights: { earlyReadiness: 5, resale: 2 },
        reason: "The squad wants dependable central pieces more than pure upside, so role clarity outranks experimentation.",
      },
      {
        id: "winNowTacticalLock",
        label: "Tactical lock",
        overrides: {
          preferredSeniorAgeRange: [22, 29],
          academyIntakeAgeRange: [16, 17],
          evidencePreference: "data",
          riskTolerance: "medium",
          geographicReach: "international",
          adaptationTolerance: 34,
          pathwayPatience: 20,
          tacticalRoleRigidity: 88,
          sellingPressure: 16,
          managerInfluence: 80,
          specializationAffinity: ["firstTeam", "data", "regional"],
        },
        objectiveWeights: { earlyReadiness: 5 },
        reason: "The manager wants plug-in tactical certainty, so evidence standards rise even while patience collapses.",
      },
      {
        id: "winNowLoanStrike",
        label: "Loan strike",
        overrides: {
          preferredSeniorAgeRange: [21, 27],
          academyIntakeAgeRange: [16, 17],
          evidencePreference: "balanced",
          riskTolerance: "medium",
          geographicReach: "regional",
          adaptationTolerance: 48,
          pathwayPatience: 16,
          tacticalRoleRigidity: 84,
          sellingPressure: 26,
          managerInfluence: 84,
          specializationAffinity: ["firstTeam", "regional"],
        },
        objectiveWeights: { earlyReadiness: 5, resale: 3 },
        reason: "This desk raids short-term loan and distressed minutes markets, trading long integration windows for players who can solve this month's problem immediately.",
      },
      {
        id: "winNowVeteranPatch",
        label: "Veteran patch",
        overrides: {
          preferredSeniorAgeRange: [27, 33],
          academyIntakeAgeRange: [16, 17],
          evidencePreference: "live",
          riskTolerance: "low",
          geographicReach: "regional",
          adaptationTolerance: 26,
          pathwayPatience: 12,
          tacticalRoleRigidity: 64,
          sellingPressure: 10,
          managerInfluence: 70,
          specializationAffinity: ["firstTeam", "regional"],
        },
        objectiveWeights: { earlyReadiness: 4, character: 4 },
        reason: "The club patches experience gaps with trusted veterans, valuing dressing-room certainty and readiness over future margin.",
      },
    ],
  },
  {
    family: "marketSmart",
    doctrineFamilyVersion: 1,
    base: {
      preferredSeniorAgeRange: [21, 27],
      academyIntakeAgeRange: [15, 17],
      evidencePreference: "data",
      riskTolerance: "medium",
      geographicReach: "international",
      adaptationTolerance: 58,
      pathwayPatience: 61,
      tacticalRoleRigidity: 45,
      sellingPressure: 88,
      managerInfluence: 38,
      specializationAffinity: ["data", "regional", "firstTeam"],
    },
    expressions: [
      {
        id: "marketSmartArbitrageCycle",
        label: "Arbitrage cycle",
        overrides: {
          preferredSeniorAgeRange: [20, 26],
          academyIntakeAgeRange: [15, 16],
          evidencePreference: "data",
          geographicReach: "international",
          adaptationTolerance: 56,
          pathwayPatience: 58,
          tacticalRoleRigidity: 42,
          sellingPressure: 92,
          managerInfluence: 36,
          specializationAffinity: ["data", "regional", "firstTeam"],
        },
        objectiveWeights: { resale: 6, highCeiling: 2 },
        reason: "The recruitment desk is optimizing valuation cycles and expects exits to be part of the pathway.",
      },
      {
        id: "marketSmartContractExpiryHunt",
        label: "Contract-expiry hunt",
        overrides: {
          preferredSeniorAgeRange: [22, 28],
          academyIntakeAgeRange: [16, 17],
          evidencePreference: "balanced",
          geographicReach: "international",
          adaptationTolerance: 62,
          pathwayPatience: 52,
          tacticalRoleRigidity: 44,
          sellingPressure: 82,
          managerInfluence: 34,
          specializationAffinity: ["data", "firstTeam"],
        },
        objectiveWeights: { resale: 5, earlyReadiness: 3 },
        reason: "The club chases cost-controlled windows and is willing to accept older academy entrants if the market opportunity is clean.",
      },
      {
        id: "marketSmartSellOnWorkshop",
        label: "Sell-on workshop",
        overrides: {
          preferredSeniorAgeRange: [19, 25],
          academyIntakeAgeRange: [15, 17],
          evidencePreference: "data",
          riskTolerance: "high",
          geographicReach: "global",
          adaptationTolerance: 66,
          pathwayPatience: 64,
          tacticalRoleRigidity: 40,
          sellingPressure: 96,
          managerInfluence: 32,
          specializationAffinity: ["data", "regional", "youth"],
        },
        objectiveWeights: { resale: 6, character: 2, highCeiling: 3 },
        reason: "Future resale is the dominant thesis, so the club tolerates more adaptation risk and younger arbitrage bets.",
      },
      {
        id: "marketSmartMinutesMarketplace",
        label: "Minutes marketplace",
        overrides: {
          preferredSeniorAgeRange: [20, 25],
          academyIntakeAgeRange: [16, 17],
          evidencePreference: "balanced",
          geographicReach: "regional",
          adaptationTolerance: 48,
          pathwayPatience: 46,
          tacticalRoleRigidity: 54,
          sellingPressure: 84,
          managerInfluence: 44,
          specializationAffinity: ["data", "firstTeam", "regional"],
        },
        objectiveWeights: { resale: 4, earlyReadiness: 4 },
        reason: "The club shops for underused players whose current minutes are discounted, prioritizing immediate contribution only when it still preserves a resale lane.",
      },
      {
        id: "marketSmartRoleConversionDesk",
        label: "Role conversion desk",
        overrides: {
          preferredSeniorAgeRange: [18, 24],
          academyIntakeAgeRange: [15, 16],
          evidencePreference: "data",
          riskTolerance: "high",
          geographicReach: "global",
          adaptationTolerance: 74,
          pathwayPatience: 68,
          tacticalRoleRigidity: 36,
          sellingPressure: 90,
          managerInfluence: 28,
          specializationAffinity: ["data", "youth", "regional"],
        },
        objectiveWeights: { highCeiling: 4, resale: 5, character: 2 },
        reason: "This staff hunts role-change upside, accepting noisier evidence when a converted pathway could create the next major value gap.",
      },
    ],
  },
  {
    family: "globalRecruiter",
    doctrineFamilyVersion: 1,
    base: {
      preferredSeniorAgeRange: [19, 29],
      academyIntakeAgeRange: [14, 17],
      evidencePreference: "network",
      riskTolerance: "medium",
      geographicReach: "global",
      adaptationTolerance: 84,
      pathwayPatience: 54,
      tacticalRoleRigidity: 34,
      sellingPressure: 55,
      managerInfluence: 48,
      specializationAffinity: ["regional", "data", "firstTeam"],
    },
    expressions: [
      {
        id: "globalDiasporaMesh",
        label: "Diaspora mesh",
        overrides: {
          preferredSeniorAgeRange: [18, 28],
          academyIntakeAgeRange: [14, 16],
          evidencePreference: "network",
          geographicReach: "global",
          adaptationTolerance: 88,
          pathwayPatience: 56,
          tacticalRoleRigidity: 32,
          sellingPressure: 52,
          managerInfluence: 44,
          specializationAffinity: ["regional", "youth", "firstTeam"],
        },
        objectiveWeights: { character: 5, highCeiling: 3 },
        reason: "Existing relationship networks reduce uncertainty around travel, adaptation, and family relocation.",
      },
      {
        id: "globalSatelliteBridge",
        label: "Satellite bridge",
        overrides: {
          preferredSeniorAgeRange: [19, 27],
          academyIntakeAgeRange: [15, 17],
          evidencePreference: "balanced",
          geographicReach: "global",
          adaptationTolerance: 80,
          pathwayPatience: 50,
          tacticalRoleRigidity: 38,
          sellingPressure: 58,
          managerInfluence: 50,
          specializationAffinity: ["regional", "data", "firstTeam"],
        },
        objectiveWeights: { character: 4, earlyReadiness: 3, resale: 2 },
        reason: "The club uses bridge destinations and partner knowledge to accelerate cross-border placements.",
      },
      {
        id: "globalPassportPortfolio",
        label: "Passport portfolio",
        overrides: {
          preferredSeniorAgeRange: [20, 29],
          academyIntakeAgeRange: [15, 17],
          evidencePreference: "network",
          riskTolerance: "high",
          geographicReach: "global",
          adaptationTolerance: 90,
          pathwayPatience: 48,
          tacticalRoleRigidity: 30,
          sellingPressure: 62,
          managerInfluence: 46,
          specializationAffinity: ["regional", "data", "youth"],
        },
        objectiveWeights: { character: 4, resale: 3, highCeiling: 2 },
        reason: "Recruitment explicitly values mobility leverage and accepts more variance when passports expand future routes.",
      },
      {
        id: "globalPermitChessboard",
        label: "Permit chessboard",
        overrides: {
          preferredSeniorAgeRange: [19, 28],
          academyIntakeAgeRange: [15, 17],
          evidencePreference: "network",
          geographicReach: "global",
          adaptationTolerance: 92,
          pathwayPatience: 42,
          tacticalRoleRigidity: 28,
          sellingPressure: 66,
          managerInfluence: 42,
          specializationAffinity: ["regional", "data", "firstTeam"],
        },
        objectiveWeights: { character: 4, resale: 4, earlyReadiness: 1 },
        reason: "The network is optimized around work permits, dual-nationality routes, and staging plans that keep multiple borders open at once.",
      },
      {
        id: "globalShowcaseCircuit",
        label: "Showcase circuit",
        overrides: {
          preferredSeniorAgeRange: [20, 27],
          academyIntakeAgeRange: [16, 17],
          evidencePreference: "live",
          geographicReach: "international",
          adaptationTolerance: 76,
          pathwayPatience: 38,
          tacticalRoleRigidity: 46,
          sellingPressure: 60,
          managerInfluence: 58,
          specializationAffinity: ["regional", "firstTeam", "data"],
        },
        objectiveWeights: { earlyReadiness: 4, character: 3, highCeiling: 1 },
        reason: "The club chases tournament and showcase windows where staff can combine trusted contacts with direct live conviction before moving fast.",
      },
    ],
  },
];

export const RECRUITMENT_DOCTRINE_CONTENT_PACK = defineContentPack({
  manifest: {
    id: "talentscout.recruitment-doctrines",
    kind: "recruitment-doctrine",
    schemaVersion: CONTENT_SCHEMA_VERSION,
    contentVersion: "recruitment-doctrines.1",
  },
  entries: RECRUITMENT_DOCTRINE_FAMILY_ENTRIES,
  getDefinitionId: (definition) => definition.family,
  validateDefinition: validateRecruitmentDoctrineFamily,
});

const authoredFamilies = RECRUITMENT_DOCTRINE_CONTENT_PACK.entries.map((entry) => entry.family);
const missingFamilies = PHILOSOPHY_ORDER.filter((family) => !authoredFamilies.includes(family));
const unexpectedFamilies = authoredFamilies.filter((family) => !PHILOSOPHY_ORDER.includes(family));

const duplicateExpressionIds = RECRUITMENT_DOCTRINE_CONTENT_PACK.entries.flatMap((entry) => {
  const seen = new Set<string>();
  return entry.expressions.flatMap((expression) => {
    if (seen.has(expression.id)) return [expression.id];
    seen.add(expression.id);
    return [];
  });
});

const globalExpressionCounts = RECRUITMENT_DOCTRINE_CONTENT_PACK.entries.flatMap((entry) =>
  entry.expressions.map((expression) => expression.id),
).reduce<Record<string, number>>((counts, id) => {
  counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}, {});

const crossFamilyDuplicateExpressionIds = Object.entries(globalExpressionCounts)
  .filter(([, count]) => count > 1)
  .map(([id]) => id);

if (
  missingFamilies.length > 0
  || unexpectedFamilies.length > 0
  || duplicateExpressionIds.length > 0
  || crossFamilyDuplicateExpressionIds.length > 0
) {
  throw new ContentValidationError([
    ...missingFamilies.map((family) => ({
      packId: RECRUITMENT_DOCTRINE_CONTENT_PACK.manifest.id,
      definitionId: family,
      path: "family",
      message: "is missing an authored recruitment doctrine family",
    })),
    ...unexpectedFamilies.map((family) => ({
      packId: RECRUITMENT_DOCTRINE_CONTENT_PACK.manifest.id,
      definitionId: family,
      path: "family",
      message: "is not a supported scouting philosophy",
    })),
    ...duplicateExpressionIds.map((expressionId) => ({
      packId: RECRUITMENT_DOCTRINE_CONTENT_PACK.manifest.id,
      definitionId: expressionId,
      path: "expressions.id",
      message: "must not be duplicated within a doctrine family",
    })),
    ...crossFamilyDuplicateExpressionIds.map((expressionId) => ({
      packId: RECRUITMENT_DOCTRINE_CONTENT_PACK.manifest.id,
      definitionId: expressionId,
      path: "expressions.id",
      message: "must remain globally unique across doctrine families",
    })),
  ]);
}

export const DOCTRINE_BASES_BY_FAMILY = Object.freeze(
  Object.fromEntries(
    RECRUITMENT_DOCTRINE_CONTENT_PACK.entries.map((entry) => [entry.family, entry.base]),
  ) as Record<ScoutingPhilosophy, DoctrineBase>,
);

export const DOCTRINE_EXPRESSIONS_BY_FAMILY = Object.freeze(
  Object.fromEntries(
    RECRUITMENT_DOCTRINE_CONTENT_PACK.entries.map((entry) => [entry.family, entry.expressions]),
  ) as Record<ScoutingPhilosophy, readonly DoctrineExpression[]>,
);

export function listRecruitmentDoctrineExpressions(): Array<{
  id: ClubRecruitmentExpressionId;
  label: string;
  family: ScoutingPhilosophy;
}> {
  return RECRUITMENT_DOCTRINE_CONTENT_PACK.entries.flatMap((entry) =>
    entry.expressions.map((expression) => ({
      id: expression.id,
      label: expression.label,
      family: entry.family,
    })),
  );
}
