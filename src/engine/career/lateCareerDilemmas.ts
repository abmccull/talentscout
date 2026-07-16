import type {
  BoardPersonality,
  CareerPath,
  CareerTier,
  ScoutingPreference,
  Specialization,
} from "../core/types";

export type LateCareerDilemmaId =
  | "clubDoctrineCollision"
  | "departmentSuccession"
  | "agencyIndependenceCrossroads"
  | "reputationMortgage"
  | "youthGuardianship"
  | "dataModelCrisis"
  | "regionalLoyalty"
  | "firstTeamPanic";

export type LateCareerStakeholderKind =
  | "board"
  | "manager"
  | "employee"
  | "client"
  | "agent"
  | "family"
  | "journalist"
  | "rival";

export type LateCareerOutcomeTag =
  | "budget"
  | "trust"
  | "influence"
  | "access"
  | "staffMorale"
  | "reputation"
  | "publicNarrative"
  | "scoutingDoctrine"
  | "clientConflict"
  | "playerWelfare";

export interface LateCareerDilemmaOption {
  id: string;
  label: string;
  description: string;
  knownTradeoffs: string[];
  immediateOutcomeTags: LateCareerOutcomeTag[];
  delayedOutcomeTags: LateCareerOutcomeTag[];
  recoveryTags: string[];
}

export interface LateCareerDilemmaStage {
  id: "opening" | "reckoning" | "callback";
  delayWeeks: number;
  purpose: string;
}

export interface LateCareerDilemmaDefinition {
  id: LateCareerDilemmaId;
  title: string;
  premise: string;
  minTier: CareerTier;
  path: CareerPath | "any";
  specialization?: Specialization;
  requiresStaff?: boolean;
  stakeholders: LateCareerStakeholderKind[];
  options: LateCareerDilemmaOption[];
  stages: LateCareerDilemmaStage[];
}

export interface LateCareerDilemmaContext {
  careerTier: CareerTier;
  careerPath: CareerPath;
  specialization: Specialization;
  staffCount: number;
  seasonsCompleted: number;
  boardPersonality?: BoardPersonality;
  managerPreference?: ScoutingPreference;
}

const STANDARD_STAGES: LateCareerDilemmaStage[] = [
  { id: "opening", delayWeeks: 0, purpose: "Expose the conflict and lock the accountable choice." },
  { id: "reckoning", delayWeeks: 8, purpose: "Show the first operational cost without declaring the final verdict." },
  { id: "callback", delayWeeks: 52, purpose: "Return with a career-level consequence grounded in world evidence." },
];

export const LATE_CAREER_DILEMMAS: readonly LateCareerDilemmaDefinition[] = [
  {
    id: "clubDoctrineCollision",
    title: "Whose recruitment department is this?",
    premise: "The manager wants immediate athleticism. The board wants resale value. Your evidence says both briefs miss the best available player.",
    minTier: 5,
    path: "club",
    stakeholders: ["board", "manager", "employee"],
    stages: STANDARD_STAGES,
    options: [
      {
        id: "backManager",
        label: "Back the manager",
        description: "Rebuild the shortlist around the manager's immediate tactical need.",
        knownTradeoffs: ["Manager influence rises", "Board patience falls if resale value disappoints", "Staff abandon part of the existing work"],
        immediateOutcomeTags: ["influence", "staffMorale"],
        delayedOutcomeTags: ["budget", "trust", "scoutingDoctrine"],
        recoveryTags: ["managerBacked", "boardConflict"],
      },
      {
        id: "obeyBoard",
        label: "Obey the board",
        description: "Prioritise age, value growth, and a future sale over immediate tactical fit.",
        knownTradeoffs: ["Board satisfaction rises", "Manager trust is at risk", "The player may lack an immediate pathway"],
        immediateOutcomeTags: ["trust", "budget"],
        delayedOutcomeTags: ["playerWelfare", "publicNarrative"],
        recoveryTags: ["boardBacked", "managerConflict"],
      },
      {
        id: "brokerCompromise",
        label: "Broker a compromise",
        description: "Ask both sides to accept a narrower hybrid brief and stake your influence on it.",
        knownTradeoffs: ["Consumes political capital with both sides", "Preserves more of the evidence", "A mediocre outcome satisfies nobody"],
        immediateOutcomeTags: ["influence", "scoutingDoctrine"],
        delayedOutcomeTags: ["trust", "reputation"],
        recoveryTags: ["compromiseOwned"],
      },
      {
        id: "threatenExit",
        label: "Put your position on the line",
        description: "Refuse both briefs and make continued employment conditional on recruitment autonomy.",
        knownTradeoffs: ["Maximum autonomy upside", "Immediate firing risk", "The dispute becomes part of your public reputation"],
        immediateOutcomeTags: ["trust", "publicNarrative"],
        delayedOutcomeTags: ["scoutingDoctrine", "reputation"],
        recoveryTags: ["principledExit", "publicDispute"],
      },
    ],
  },
  {
    id: "departmentSuccession",
    title: "Choose who carries the notebook next",
    premise: "Your department has outgrown personal control. A loyal internal scout and a brilliant external rival both expect authority.",
    minTier: 4,
    path: "any",
    requiresStaff: true,
    stakeholders: ["employee", "rival"],
    stages: STANDARD_STAGES,
    options: [
      {
        id: "promoteLoyalist",
        label: "Promote the loyalist",
        description: "Reward institutional memory and accept a lower immediate ceiling.",
        knownTradeoffs: ["Morale and loyalty rise", "External expertise is lost", "Your existing biases may persist"],
        immediateOutcomeTags: ["staffMorale", "trust"],
        delayedOutcomeTags: ["scoutingDoctrine", "reputation"],
        recoveryTags: ["loyalSuccession"],
      },
      {
        id: "hireRival",
        label: "Recruit the rival",
        description: "Buy elite expertise and give an outsider influence over your methods.",
        knownTradeoffs: ["Higher performance ceiling", "Existing staff may leave", "The rival can claim future successes"],
        immediateOutcomeTags: ["staffMorale", "budget"],
        delayedOutcomeTags: ["publicNarrative", "scoutingDoctrine"],
        recoveryTags: ["rivalSuccession"],
      },
      {
        id: "splitAuthority",
        label: "Split the mandate",
        description: "Create complementary domains and personally arbitrate disputes.",
        knownTradeoffs: ["Retains both candidates", "Consumes weekly leadership attention", "Conflicting reports become more likely"],
        immediateOutcomeTags: ["staffMorale", "scoutingDoctrine"],
        delayedOutcomeTags: ["trust", "reputation"],
        recoveryTags: ["sharedSuccession"],
      },
    ],
  },
  {
    id: "agencyIndependenceCrossroads",
    title: "The offer that changes the agency",
    premise: "A major investor offers global reach in exchange for exclusivity, targets, and influence over which clients receive your best work.",
    minTier: 5,
    path: "independent",
    requiresStaff: true,
    stakeholders: ["client", "employee", "journalist"],
    stages: STANDARD_STAGES,
    options: [
      {
        id: "sellStake",
        label: "Sell a minority stake",
        description: "Take the capital and accept formal growth targets.",
        knownTradeoffs: ["Immediate expansion capital", "New recurring obligations", "Client selection becomes politically constrained"],
        immediateOutcomeTags: ["budget", "clientConflict"],
        delayedOutcomeTags: ["staffMorale", "publicNarrative"],
        recoveryTags: ["investorBacked"],
      },
      {
        id: "exclusiveClub",
        label: "Choose one elite client",
        description: "Reject the investor but sign an exclusive long-term club partnership.",
        knownTradeoffs: ["Stable high income", "Marketplace freedom disappears", "Rival clubs remember the exclusivity"],
        immediateOutcomeTags: ["budget", "access"],
        delayedOutcomeTags: ["clientConflict", "reputation"],
        recoveryTags: ["exclusiveAgency"],
      },
      {
        id: "stayBoutique",
        label: "Stay independent",
        description: "Protect judgment and grow only from retained earnings.",
        knownTradeoffs: ["No new obligations", "Slower geographic expansion", "Employees may doubt the ceiling"],
        immediateOutcomeTags: ["trust", "staffMorale"],
        delayedOutcomeTags: ["access", "reputation"],
        recoveryTags: ["independenceProtected"],
      },
    ],
  },
  {
    id: "reputationMortgage",
    title: "The recommendation everyone will remember",
    premise: "The market is moving on an expensive player before the evidence is complete. Decision-makers want your verdict now.",
    minTier: 4,
    path: "any",
    stakeholders: ["board", "manager", "client", "journalist"],
    stages: STANDARD_STAGES,
    options: [
      {
        id: "publicConviction",
        label: "Stake your name publicly",
        description: "Make the strongest possible recommendation and accept ownership of the result.",
        knownTradeoffs: ["Can define a career", "Failure becomes public", "Waiting is no longer possible"],
        immediateOutcomeTags: ["reputation", "publicNarrative"],
        delayedOutcomeTags: ["trust", "budget", "reputation"],
        recoveryTags: ["publicConviction"],
      },
      {
        id: "privateRecommendation",
        label: "Recommend privately",
        description: "Support the move while clearly preserving uncertainty and risk.",
        knownTradeoffs: ["Lower reputational upside", "Decision-makers may view caution as weakness", "The written risks remain auditable"],
        immediateOutcomeTags: ["trust"],
        delayedOutcomeTags: ["reputation", "publicNarrative"],
        recoveryTags: ["calibratedConviction"],
      },
      {
        id: "demandMoreEvidence",
        label: "Demand another look",
        description: "Refuse the deadline and spend scarce time testing the weakest assumptions.",
        knownTradeoffs: ["Improves evidence quality", "The opportunity may disappear", "Other assignments lose attention"],
        immediateOutcomeTags: ["trust", "access"],
        delayedOutcomeTags: ["reputation"],
        recoveryTags: ["evidenceBeforeSpeed"],
      },
    ],
  },
  {
    id: "youthGuardianship",
    title: "The prospect is not a commodity",
    premise: "A family wants patience, an agent wants a fast move, and the club wants an answer before the player is ready.",
    minTier: 4,
    path: "any",
    specialization: "youth",
    stakeholders: ["family", "agent", "manager"],
    stages: STANDARD_STAGES,
    options: [
      {
        id: "protectPlayer",
        label: "Protect the development path",
        description: "Recommend waiting and define evidence-based milestones for reconsideration.",
        knownTradeoffs: ["Family trust rises", "Agent access may close", "The club can sign an alternative"],
        immediateOutcomeTags: ["playerWelfare", "trust"],
        delayedOutcomeTags: ["access", "reputation"],
        recoveryTags: ["playerFirst"],
      },
      {
        id: "backMove",
        label: "Back the immediate move",
        description: "Argue that the destination environment justifies the adaptation risk.",
        knownTradeoffs: ["Club and agent support rise", "Family trust is at risk", "Adaptation becomes part of your verdict"],
        immediateOutcomeTags: ["access", "trust"],
        delayedOutcomeTags: ["playerWelfare", "publicNarrative"],
        recoveryTags: ["acceleratedPath"],
      },
      {
        id: "independentPlan",
        label: "Broker a staged plan",
        description: "Tie the move to education, minutes, housing, and review clauses.",
        knownTradeoffs: ["Hardest agreement to secure", "Uses relationship capital", "Creates measurable obligations for everyone"],
        immediateOutcomeTags: ["trust", "playerWelfare"],
        delayedOutcomeTags: ["clientConflict", "reputation"],
        recoveryTags: ["stagedDevelopment"],
      },
    ],
  },
  {
    id: "dataModelCrisis",
    title: "Your model missed what the eye test saw",
    premise: "A costly recommendation exposed a repeatable blind spot. Staff want a quiet patch; stakeholders want an explanation.",
    minTier: 4,
    path: "any",
    specialization: "data",
    stakeholders: ["employee", "manager", "journalist"],
    stages: STANDARD_STAGES,
    options: [
      {
        id: "publishFailure",
        label: "Publish the failure analysis",
        description: "Explain the blind spot and invite scrutiny of the revised method.",
        knownTradeoffs: ["Calibration reputation can rise", "Competitors learn from your method", "The original miss returns to the news"],
        immediateOutcomeTags: ["publicNarrative", "reputation"],
        delayedOutcomeTags: ["trust", "scoutingDoctrine"],
        recoveryTags: ["transparentModel"],
      },
      {
        id: "quietPatch",
        label: "Patch it internally",
        description: "Protect the competitive edge and make the correction without publicity.",
        knownTradeoffs: ["Method remains private", "Stakeholders receive less accountability", "A second similar miss becomes severe"],
        immediateOutcomeTags: ["scoutingDoctrine"],
        delayedOutcomeTags: ["trust", "publicNarrative"],
        recoveryTags: ["privateModelRepair"],
      },
      {
        id: "hybridReview",
        label: "Give dissent formal power",
        description: "Require a live-scout challenge before high-conviction model recommendations.",
        knownTradeoffs: ["Reduces model autonomy", "Consumes staff time", "Conflicting evidence becomes visible rather than suppressed"],
        immediateOutcomeTags: ["staffMorale", "scoutingDoctrine"],
        delayedOutcomeTags: ["reputation", "trust"],
        recoveryTags: ["hybridDoctrine"],
      },
    ],
  },
  {
    id: "regionalLoyalty",
    title: "The region that made your name",
    premise: "A global assignment would accelerate your career, but accepting it means abandoning a local network during its most important window.",
    minTier: 4,
    path: "any",
    specialization: "regional",
    stakeholders: ["client", "family", "employee"],
    stages: STANDARD_STAGES,
    options: [
      {
        id: "stayLocal",
        label: "Keep the local promise",
        description: "Decline the global assignment and protect the relationships that built your access.",
        knownTradeoffs: ["Local loyalty deepens", "Global access is delayed", "Your employer may question ambition"],
        immediateOutcomeTags: ["trust", "access"],
        delayedOutcomeTags: ["reputation", "publicNarrative"],
        recoveryTags: ["localLoyalty"],
      },
      {
        id: "goGlobal",
        label: "Take the global assignment",
        description: "Delegate local obligations and pursue the highest-upside opportunity.",
        knownTradeoffs: ["Global access rises", "Delegated failures remain yours", "Local contacts can feel used"],
        immediateOutcomeTags: ["access", "staffMorale"],
        delayedOutcomeTags: ["trust", "reputation"],
        recoveryTags: ["globalLeap"],
      },
      {
        id: "buildBridge",
        label: "Build a two-region partnership",
        description: "Share credit and access with another scout rather than choosing one network.",
        knownTradeoffs: ["Creates future reciprocal access", "A rival gains visibility into your network", "Short-term coverage is thinner"],
        immediateOutcomeTags: ["access", "trust"],
        delayedOutcomeTags: ["publicNarrative", "scoutingDoctrine"],
        recoveryTags: ["regionalAlliance"],
      },
    ],
  },
  {
    id: "firstTeamPanic",
    title: "Deadline night is not an excuse",
    premise: "Results have collapsed. The club wants an available veteran; your report says the price and tactical fit are wrong.",
    minTier: 4,
    path: "club",
    specialization: "firstTeam",
    stakeholders: ["board", "manager", "agent", "journalist"],
    stages: STANDARD_STAGES,
    options: [
      {
        id: "approveVeteran",
        label: "Approve the emergency signing",
        description: "Prioritise immediate availability and make the risks explicit.",
        knownTradeoffs: ["Manager trust rises", "Fee and wages become part of your verdict", "The alternative shortlist closes"],
        immediateOutcomeTags: ["trust", "budget"],
        delayedOutcomeTags: ["reputation", "publicNarrative"],
        recoveryTags: ["winNowOwned"],
      },
      {
        id: "blockDeal",
        label: "Block the deal",
        description: "Stand behind the fit assessment despite the results crisis.",
        knownTradeoffs: ["Protects recruitment discipline", "A continuing losing run is blamed on you", "Agent access falls"],
        immediateOutcomeTags: ["scoutingDoctrine", "access"],
        delayedOutcomeTags: ["trust", "reputation"],
        recoveryTags: ["disciplineOverPanic"],
      },
      {
        id: "loanCompromise",
        label: "Propose a reversible loan",
        description: "Accept short-term help only with a controlled exit and no mandatory purchase.",
        knownTradeoffs: ["Limits financial downside", "May secure a weaker player", "Negotiation can fail before the deadline"],
        immediateOutcomeTags: ["budget", "trust"],
        delayedOutcomeTags: ["reputation"],
        recoveryTags: ["reversiblePanic"],
      },
    ],
  },
] as const;

function isEligible(
  definition: LateCareerDilemmaDefinition,
  context: LateCareerDilemmaContext,
): boolean {
  return context.careerTier >= definition.minTier
    && (definition.path === "any" || definition.path === context.careerPath)
    && (!definition.specialization || definition.specialization === context.specialization)
    && (!definition.requiresStaff || context.staffCount > 0);
}

export function getEligibleLateCareerDilemmas(
  context: LateCareerDilemmaContext,
  seenIds: ReadonlySet<string> = new Set(),
): LateCareerDilemmaDefinition[] {
  return LATE_CAREER_DILEMMAS.filter((definition) =>
    isEligible(definition, context) && !seenIds.has(definition.id),
  );
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic content selection; resolution randomness remains in the consequence engine. */
export function selectLateCareerDilemma(input: {
  rootSeed: string;
  season: number;
  week: number;
  context: LateCareerDilemmaContext;
  seenIds?: ReadonlySet<string>;
}): LateCareerDilemmaDefinition | undefined {
  const eligible = getEligibleLateCareerDilemmas(input.context, input.seenIds);
  if (eligible.length === 0) return undefined;
  const index = stableHash(
    `late-career:v1:${input.rootSeed}:s${input.season}:w${input.week}:${input.context.careerPath}:${input.context.specialization}`,
  ) % eligible.length;
  return eligible[index];
}
