import { createNamedRNG } from "@/engine/run";
import type {
  ConsequenceEffect,
  DecisionOption,
  DecisionRecord,
  GameDate,
  JsonValue,
} from "@/engine/consequences/types";
import type { StoryCandidateV2 } from "@/engine/events/storyDirectorV2";
import type {
  WorldConditionInstance,
  WorldConditionModifiers,
} from "./worldConditionTypes";

export const WORLD_CONDITION_ARC_STATE_VERSION = 1 as const;
export const WORLD_CONDITION_ARC_COMPLETED_LIMIT = 48;

export type WorldConditionArcPhase = "signal" | "decision" | "aftermath";

export interface WorldConditionArcChoiceDefinition {
  id: string;
  label: string;
  knownTradeoffs: readonly string[];
  fatigueDelta: number;
  reputationDelta: number;
  modifiers: Partial<WorldConditionModifiers>;
}

export interface WorldConditionArcDefinition {
  id: string;
  conditionDefinitionId: string;
  title: string;
  signalTitle: string;
  signalBody: string;
  decisionTitle: string;
  decisionBody: string;
  aftermathTitle: string;
  aftermathByChoice: Readonly<Record<string, string>>;
  decisionDelayWeeks: number;
  aftermathDelayWeeks: number;
  defaultChoiceId: string;
  choices: readonly WorldConditionArcChoiceDefinition[];
}

export interface WorldConditionArcInstance {
  id: string;
  definitionId: string;
  conditionInstanceId: string;
  conditionDefinitionId: string;
  countryId?: string;
  season: number;
  startedAt: GameDate;
  decisionAt: GameDate;
  phase: WorldConditionArcPhase;
  emittedBeatIds: string[];
  outcomeRoll: number;
  selectedChoiceId?: string;
  selectedAt?: GameDate;
  aftermathAt?: GameDate;
  completedAt?: GameDate;
}

export interface WorldConditionArcState {
  version: typeof WORLD_CONDITION_ARC_STATE_VERSION;
  active: Record<string, WorldConditionArcInstance>;
  completed: WorldConditionArcInstance[];
}

export interface DueWorldConditionArcBeat {
  arc: WorldConditionArcInstance;
  beatId: string;
  phase: WorldConditionArcPhase;
  title: string;
  body: string;
  candidate: StoryCandidateV2;
  decision?: DecisionRecord;
}

const ARC_DEFINITIONS: readonly WorldConditionArcDefinition[] = [
  {
    id: "academy-wave-access-race",
    conditionDefinitionId: "academy-investment-wave",
    title: "The Academy Access Race",
    signalTitle: "New Money, New Gatekeepers",
    signalBody: "Academies are expanding quickly, but the most interesting sessions are becoming invitation-only. The first scouts to choose a credible route in will shape the market.",
    decisionTitle: "Choose Your Academy Route",
    decisionBody: "You cannot cover every expanding academy. Decide whether to embed locally, verify prospects independently, or build an evidence-led partnership.",
    aftermathTitle: "An Academy Network Takes Shape",
    aftermathByChoice: {
      "embed-locally": "Your regular presence opens early sessions, but rival scouts now know exactly where you are concentrating.",
      "independent-circuit": "You preserve a wider view of the region, at the cost of slower access to the most protected prospects.",
      "evidence-partnership": "Academies share more structured evidence with you, while informal discoveries arrive less often.",
    },
    decisionDelayWeeks: 2,
    aftermathDelayWeeks: 5,
    defaultChoiceId: "independent-circuit",
    choices: [
      {
        id: "embed-locally",
        label: "Embed in two academies",
        knownTradeoffs: ["Improves early discovery access", "Increases workload and rival attention"],
        fatigueDelta: 5,
        reputationDelta: 2,
        modifiers: { discoveryMultiplier: 1.12, rivalPressureMultiplier: 1.12 },
      },
      {
        id: "independent-circuit",
        label: "Keep an independent circuit",
        knownTradeoffs: ["Preserves broad opportunity coverage", "Raises travel cost and slows protected access"],
        fatigueDelta: 3,
        reputationDelta: 1,
        modifiers: { opportunityMultiplier: 1.08, travelCostMultiplier: 1.08 },
      },
      {
        id: "evidence-partnership",
        label: "Offer an evidence partnership",
        knownTradeoffs: ["Improves observation confidence", "Reduces speculative discovery volume"],
        fatigueDelta: 6,
        reputationDelta: 2,
        modifiers: { observationConfidenceMultiplier: 1.08, discoveryMultiplier: 0.94 },
      },
    ],
  },
  {
    id: "data-rights-response",
    conditionDefinitionId: "data-rights-dispute",
    title: "The Data Rights Dispute",
    signalTitle: "The Feed Goes Dark",
    signalBody: "A rights dispute has removed familiar youth data feeds. Clubs and scouts are scrambling to decide which evidence they can still trust.",
    decisionTitle: "Replace the Missing Evidence",
    decisionBody: "Choose whether to license a limited feed, rebuild around live contacts, or wait for the dispute to settle.",
    aftermathTitle: "A New Evidence Habit",
    aftermathByChoice: {
      "license-feed": "The licensed feed restores consistency, but buyers know your evidence now carries a recurring market cost.",
      "live-network": "Your live network produces distinctive evidence and an exhausting travel schedule.",
      "wait-dispute": "You preserve energy while the market settles, but several early opportunities move without you.",
    },
    decisionDelayWeeks: 1,
    aftermathDelayWeeks: 4,
    defaultChoiceId: "wait-dispute",
    choices: [
      {
        id: "license-feed",
        label: "License the limited feed",
        knownTradeoffs: ["Restores evidence confidence", "Reduces report-market margin"],
        fatigueDelta: 1,
        reputationDelta: 1,
        modifiers: { observationConfidenceMultiplier: 1.07, marketplaceValueMultiplier: 0.94 },
      },
      {
        id: "live-network",
        label: "Rebuild through live contacts",
        knownTradeoffs: ["Creates distinctive discovery intelligence", "Adds travel cost and fatigue"],
        fatigueDelta: 7,
        reputationDelta: 2,
        modifiers: { discoveryMultiplier: 1.06, travelCostMultiplier: 1.12 },
      },
      {
        id: "wait-dispute",
        label: "Wait for the dispute to settle",
        knownTradeoffs: ["Recovers personal capacity", "Misses time-sensitive opportunities"],
        fatigueDelta: -3,
        reputationDelta: 0,
        modifiers: { opportunityMultiplier: 0.86 },
      },
    ],
  },
  {
    id: "recession-local-commitment",
    conditionDefinitionId: "local-football-recession",
    title: "Stay or Retreat",
    signalTitle: "A Region Loses Its Safety Net",
    signalBody: "Local clubs are cutting travel, coaching and showcase budgets. Several prospects may disappear from organized football before the market notices them.",
    decisionTitle: "Set Your Commitment to the Region",
    decisionBody: "Choose whether to sustain a local circuit, concentrate on the surviving clubs, or withdraw until the market recovers.",
    aftermathTitle: "The Region Remembers",
    aftermathByChoice: {
      "sustain-circuit": "Local organizers remember who kept arriving when fixtures and funding disappeared.",
      "focus-survivors": "Your narrower club network stays productive, while overlooked communities become rival territory.",
      "withdraw-region": "Your costs fall, but the region's next discoveries will begin with somebody else's relationships.",
    },
    decisionDelayWeeks: 2,
    aftermathDelayWeeks: 6,
    defaultChoiceId: "focus-survivors",
    choices: [
      {
        id: "sustain-circuit",
        label: "Sustain the local circuit",
        knownTradeoffs: ["Improves discovery and regional standing", "Consumes heavy time with weaker short-term revenue"],
        fatigueDelta: 8,
        reputationDelta: 3,
        modifiers: { discoveryMultiplier: 1.08, marketplaceValueMultiplier: 0.9 },
      },
      {
        id: "focus-survivors",
        label: "Focus on resilient clubs",
        knownTradeoffs: ["Preserves viable opportunity flow", "Concentrates rivals around the same clubs"],
        fatigueDelta: 3,
        reputationDelta: 1,
        modifiers: { opportunityMultiplier: 1.03, rivalPressureMultiplier: 1.1 },
      },
      {
        id: "withdraw-region",
        label: "Withdraw until recovery",
        knownTradeoffs: ["Cuts travel and workload", "Damages discovery coverage and local memory"],
        fatigueDelta: -4,
        reputationDelta: -2,
        modifiers: { discoveryMultiplier: 0.8, travelCostMultiplier: 0.9 },
      },
    ],
  },
  {
    id: "agent-exclusivity-choice",
    conditionDefinitionId: "agent-exclusivity-wave",
    title: "The Exclusivity Wave",
    signalTitle: "Access Is Being Packaged",
    signalBody: "Agents are bundling access to youth prospects into exclusive relationships. Independent scouts must decide how much control they are willing to trade for an earlier look.",
    decisionTitle: "Choose an Access Model",
    decisionBody: "Commit to one agency, build a slower coalition of smaller contacts, or refuse the exclusivity market.",
    aftermathTitle: "Your Access Model Becomes Known",
    aftermathByChoice: {
      "agency-exclusive": "One agency opens its protected list to you, and its competitors begin closing theirs.",
      "contact-coalition": "A wider coalition shares fragments of intelligence, demanding constant relationship work.",
      "remain-independent": "Your reports retain visible independence, though the earliest invitations go elsewhere.",
    },
    decisionDelayWeeks: 1,
    aftermathDelayWeeks: 5,
    defaultChoiceId: "remain-independent",
    choices: [
      {
        id: "agency-exclusive",
        label: "Accept one agency's exclusivity",
        knownTradeoffs: ["Improves immediate opportunity access", "Raises rival pressure and dependence"],
        fatigueDelta: 2,
        reputationDelta: 1,
        modifiers: { opportunityMultiplier: 1.12, rivalPressureMultiplier: 1.18 },
      },
      {
        id: "contact-coalition",
        label: "Build a contact coalition",
        knownTradeoffs: ["Broadens discovery sources", "Requires substantial relationship maintenance"],
        fatigueDelta: 7,
        reputationDelta: 2,
        modifiers: { discoveryMultiplier: 1.06, opportunityMultiplier: 1.04 },
      },
      {
        id: "remain-independent",
        label: "Refuse exclusivity",
        knownTradeoffs: ["Improves perceived evidence independence", "Reduces early opportunity access"],
        fatigueDelta: 1,
        reputationDelta: 0,
        modifiers: { observationConfidenceMultiplier: 1.05, opportunityMultiplier: 0.92 },
      },
    ],
  },
  {
    id: "integrity-crackdown-response",
    conditionDefinitionId: "scouting-integrity-crackdown",
    title: "The Integrity Response",
    signalTitle: "Informal Shortcuts Are Closing",
    signalBody: "Access audits and safeguarding checks are changing how scouts get near young players. Fast, informal routes still exist, but the football world is starting to punish anyone who relies on them.",
    decisionTitle: "Choose Your Access Standard",
    decisionBody: "Decide whether to build a fully compliant access network, lean on trusted local gatekeepers, or reduce speculative coverage until the crackdown settles.",
    aftermathTitle: "Your Access Standards Become Visible",
    aftermathByChoice: {
      "compliance-network": "Your evidence now carries stronger institutional trust, but every week of compliant access costs more time and money.",
      "local-gatekeepers": "Trusted local intermediaries keep you moving, though your network becomes narrower and more politically exposed.",
      "slow-the-circuit": "You avoid the worst access mistakes, but several early pathways move without your name attached.",
    },
    decisionDelayWeeks: 1,
    aftermathDelayWeeks: 4,
    defaultChoiceId: "local-gatekeepers",
    choices: [
      {
        id: "compliance-network",
        label: "Build a compliance-first access network",
        knownTradeoffs: ["Improves evidence credibility and verified access", "Adds operating cost and weekly workload"],
        fatigueDelta: 4,
        reputationDelta: 3,
        modifiers: {
          observationConfidenceMultiplier: 1.1,
          opportunityMultiplier: 0.92,
          seasonalFinanceAdjustment: -650,
        },
      },
      {
        id: "local-gatekeepers",
        label: "Work through trusted local gatekeepers",
        knownTradeoffs: ["Preserves practical access", "Raises rival and relationship pressure around a smaller channel set"],
        fatigueDelta: 2,
        reputationDelta: 1,
        modifiers: {
          discoveryMultiplier: 0.96,
          opportunityMultiplier: 0.98,
          rivalPressureMultiplier: 1.08,
        },
      },
      {
        id: "slow-the-circuit",
        label: "Slow the speculative circuit",
        knownTradeoffs: ["Protects you from bad access decisions", "Reduces timely opportunities and market relevance"],
        fatigueDelta: -3,
        reputationDelta: -1,
        modifiers: {
          opportunityMultiplier: 0.84,
          travelCostMultiplier: 0.94,
          rivalPressureMultiplier: 0.92,
        },
      },
    ],
  },
  {
    id: "role-revolution-adaptation",
    conditionDefinitionId: "tactical-role-revolution",
    title: "The Role Revolution",
    signalTitle: "Yesterday's Position Labels No Longer Hold",
    signalBody: "Clubs are reinterpreting familiar roles. The same player can now be praised as a tactical solution by one staff and dismissed as a misfit by another.",
    decisionTitle: "Choose How You Read the Shift",
    decisionBody: "Commit to deeper role-based analysis, keep a broad live comparison circuit, or package players around explicit club-fit briefs.",
    aftermathTitle: "Your Reading Model Shapes Demand",
    aftermathByChoice: {
      "role-laboratory": "Your reports become more precise about tactical role, but you cover fewer players each month.",
      "broad-comparison-circuit": "You keep a wide market picture, though noisy role interpretation makes strong conclusions harder to defend.",
      "club-fit-briefs": "Decision-makers value your contextual presentations, but your work becomes less portable across buyers.",
    },
    decisionDelayWeeks: 2,
    aftermathDelayWeeks: 5,
    defaultChoiceId: "club-fit-briefs",
    choices: [
      {
        id: "role-laboratory",
        label: "Build a role-analysis laboratory",
        knownTradeoffs: ["Improves tactical-role confidence", "Reduces weekly breadth and immediate opportunity flow"],
        fatigueDelta: 5,
        reputationDelta: 2,
        modifiers: {
          observationConfidenceMultiplier: 1.1,
          developmentMultiplier: 1.04,
          opportunityMultiplier: 0.94,
        },
      },
      {
        id: "broad-comparison-circuit",
        label: "Keep a broad comparison circuit",
        knownTradeoffs: ["Preserves discovery breadth and optionality", "Makes role interpretation noisier and more vulnerable to misses"],
        fatigueDelta: 3,
        reputationDelta: 0,
        modifiers: {
          discoveryMultiplier: 1.08,
          opportunityMultiplier: 1.08,
          observationConfidenceMultiplier: 0.9,
        },
      },
      {
        id: "club-fit-briefs",
        label: "Sell players through club-fit briefs",
        knownTradeoffs: ["Improves buyer receptiveness and report value", "Makes your work less reusable outside a specific pathway"],
        fatigueDelta: 4,
        reputationDelta: 1,
        modifiers: {
          recruitmentScoreAdjustment: 4,
          marketplaceValueMultiplier: 1.06,
          discoveryMultiplier: 0.94,
        },
      },
    ],
  },
  {
    id: "agency-consolidation-positioning",
    conditionDefinitionId: "agency-consolidation",
    title: "The Consolidated Agency Market",
    signalTitle: "More Doors Are Controlled by Fewer Phones",
    signalBody: "Large agencies are clustering information, clients, and buyer access. Independent scouts can still operate, but the shape of the market is becoming more concentrated.",
    decisionTitle: "Choose Your Agency Position",
    decisionBody: "Decide whether to anchor yourself to one major intermediary, spread work across independent sources, or concentrate on buyer-side retainers and formal briefs.",
    aftermathTitle: "The Market Learns Your Position",
    aftermathByChoice: {
      "anchor-partnership": "A powerful intermediary accelerates your access, while rival pressure follows the same obvious channels.",
      "independent-web": "You keep multiple smaller routes alive, but constant maintenance work reduces margin and energy.",
      "buyer-retainers": "Clubs value your cleaner process and willingness to challenge agency noise, though fewer speculative leads reach your desk first.",
    },
    decisionDelayWeeks: 1,
    aftermathDelayWeeks: 5,
    defaultChoiceId: "buyer-retainers",
    choices: [
      {
        id: "anchor-partnership",
        label: "Anchor to one major intermediary",
        knownTradeoffs: ["Improves immediate access and opportunities", "Increases dependence and rival pressure on visible channels"],
        fatigueDelta: 2,
        reputationDelta: 1,
        modifiers: {
          opportunityMultiplier: 1.12,
          discoveryMultiplier: 0.94,
          rivalPressureMultiplier: 1.16,
        },
      },
      {
        id: "independent-web",
        label: "Maintain an independent source web",
        knownTradeoffs: ["Improves discovery resilience", "Consumes time and lowers short-term commercial efficiency"],
        fatigueDelta: 7,
        reputationDelta: 2,
        modifiers: {
          discoveryMultiplier: 1.08,
          marketplaceValueMultiplier: 0.94,
          travelCostMultiplier: 1.06,
        },
      },
      {
        id: "buyer-retainers",
        label: "Concentrate on buyer-side retainers",
        knownTradeoffs: ["Raises buyer trust and report value", "Reduces first-look speculative access"],
        fatigueDelta: 3,
        reputationDelta: 2,
        modifiers: {
          recruitmentScoreAdjustment: 4,
          marketplaceValueMultiplier: 1.1,
          opportunityMultiplier: 0.92,
        },
      },
    ],
  },
  {
    id: "grassroots-collapse-triage",
    conditionDefinitionId: "grassroots-funding-collapse",
    title: "The Grassroots Triage",
    signalTitle: "Community Football Is Losing Its Anchors",
    signalBody: "Fixtures, coaches, and safe venues are disappearing across the local grassroots game. The best prospects may still be there, but the evidence arrives through unstable environments.",
    decisionTitle: "Choose a Triage Model",
    decisionBody: "Sustain a community circuit, concentrate on academy triage, or step back and wait for stronger structures to return.",
    aftermathTitle: "Your Triage Model Leaves a Mark",
    aftermathByChoice: {
      "community-circuit": "Organizers remember who kept showing up, even as short-term commercial returns weaken.",
      "academy-triage": "Your evidence becomes cleaner around the surviving institutions, while overlooked neighborhoods become somebody else's territory.",
      "wait-for-rebuild": "You avoid noisy reads and burnout, but the first trusted local callbacks now belong to other scouts.",
    },
    decisionDelayWeeks: 2,
    aftermathDelayWeeks: 6,
    defaultChoiceId: "academy-triage",
    choices: [
      {
        id: "community-circuit",
        label: "Sustain the community circuit",
        knownTradeoffs: ["Preserves hidden-player discovery and local trust", "Adds fatigue while lowering near-term commercial efficiency"],
        fatigueDelta: 8,
        reputationDelta: 3,
        modifiers: {
          discoveryMultiplier: 1.06,
          travelCostMultiplier: 1.04,
          marketplaceValueMultiplier: 0.9,
        },
      },
      {
        id: "academy-triage",
        label: "Concentrate on academy triage",
        knownTradeoffs: ["Improves evidence clarity around surviving pathways", "Narrows your view and increases rivalry around the same institutions"],
        fatigueDelta: 4,
        reputationDelta: 1,
        modifiers: {
          observationConfidenceMultiplier: 1.08,
          developmentMultiplier: 0.92,
          rivalPressureMultiplier: 1.12,
        },
      },
      {
        id: "wait-for-rebuild",
        label: "Wait for stronger structures to return",
        knownTradeoffs: ["Protects capacity and costs", "Misses fragile but valuable early stories"],
        fatigueDelta: -4,
        reputationDelta: -2,
        modifiers: {
          opportunityMultiplier: 0.82,
          travelCostMultiplier: 0.92,
          rivalPressureMultiplier: 0.94,
        },
      },
    ],
  },
  {
    id: "coaching-exodus-response",
    conditionDefinitionId: "elite-coaching-exodus",
    title: "The Coaching Exodus",
    signalTitle: "The Region's Teachers Are Moving On",
    signalBody: "Respected youth coaches are leaving the region. Development environments are becoming less stable, but their departures are also redrawing who can move players and who can still judge them well.",
    decisionTitle: "Choose a Coaching Response",
    decisionBody: "Follow displaced coaches into new environments, back the remaining clubs and staff, or build an export watchlist before the market reacts.",
    aftermathTitle: "Your Coaching Map Changes",
    aftermathByChoice: {
      "follow-coaches": "You track players through changing environments, though every useful lead now carries a heavier travel and relationship cost.",
      "back-remainers": "The remaining clubs trust your persistence, but you tie your reputation to weaker environments with fewer immediate breakthroughs.",
      "export-watchlist": "Buyers appreciate your relocation timing, while your local read becomes thinner and more market-driven.",
    },
    decisionDelayWeeks: 2,
    aftermathDelayWeeks: 5,
    defaultChoiceId: "export-watchlist",
    choices: [
      {
        id: "follow-coaches",
        label: "Follow displaced coaches",
        knownTradeoffs: ["Preserves strong developmental context around key players", "Raises travel cost and weekly complexity"],
        fatigueDelta: 6,
        reputationDelta: 2,
        modifiers: {
          observationConfidenceMultiplier: 1.06,
          opportunityMultiplier: 1.04,
          travelCostMultiplier: 1.1,
        },
      },
      {
        id: "back-remainers",
        label: "Back the remaining clubs",
        knownTradeoffs: ["Strengthens local trust and continuity", "Accepts weaker breakthrough environments"],
        fatigueDelta: 4,
        reputationDelta: 2,
        modifiers: {
          discoveryMultiplier: 1.02,
          breakthroughMultiplier: 0.9,
          rivalPressureMultiplier: 0.96,
        },
      },
      {
        id: "export-watchlist",
        label: "Build an export watchlist",
        knownTradeoffs: ["Improves buyer timing and relocation pathways", "Makes live environmental reads less complete"],
        fatigueDelta: 3,
        reputationDelta: 1,
        modifiers: {
          recruitmentScoreAdjustment: 4,
          opportunityMultiplier: 1.08,
          observationConfidenceMultiplier: 0.92,
        },
      },
    ],
  },
  {
    id: "diaspora-corridor-strategy",
    conditionDefinitionId: "diaspora-return-corridor",
    title: "The Diaspora Corridor",
    signalTitle: "Two Markets Are Starting to Speak to Each Other",
    signalBody: "Family ties, academy links, and returning staff are creating a genuine corridor between this region and overseas clubs. Access is improving, but so is the complexity of every pathway.",
    decisionTitle: "Choose a Corridor Strategy",
    decisionBody: "Invest in family liaison work, map club-to-club pathways, or sweep the bridge market speculatively before the corridor fully matures.",
    aftermathTitle: "The Corridor Responds to Your Approach",
    aftermathByChoice: {
      "family-liaison": "Families trust your timing and discretion more, though each case now demands more personal attention.",
      "pathway-mapping": "Your club-facing advice becomes more credible and transferable, but the setup work delays quick wins.",
      "bridge-market-sweep": "You surface more leads early, while noisy context makes every strong conclusion harder to defend.",
    },
    decisionDelayWeeks: 1,
    aftermathDelayWeeks: 5,
    defaultChoiceId: "pathway-mapping",
    choices: [
      {
        id: "family-liaison",
        label: "Invest in family liaison work",
        knownTradeoffs: ["Improves trusted cross-border access", "Consumes time and increases personal casework"],
        fatigueDelta: 6,
        reputationDelta: 2,
        modifiers: {
          opportunityMultiplier: 1.1,
          rivalPressureMultiplier: 1.08,
          travelFatigueMultiplier: 1.06,
        },
      },
      {
        id: "pathway-mapping",
        label: "Map club-to-club pathways",
        knownTradeoffs: ["Improves club fit and pathway credibility", "Requires upfront travel and slower early returns"],
        fatigueDelta: 4,
        reputationDelta: 2,
        modifiers: {
          observationConfidenceMultiplier: 1.05,
          recruitmentScoreAdjustment: 4,
          travelCostMultiplier: 1.08,
        },
      },
      {
        id: "bridge-market-sweep",
        label: "Sweep the bridge market early",
        knownTradeoffs: ["Raises discovery and opportunity volume", "Creates noisier evidence and more rival convergence"],
        fatigueDelta: 5,
        reputationDelta: 0,
        modifiers: {
          discoveryMultiplier: 1.12,
          opportunityMultiplier: 1.12,
          observationConfidenceMultiplier: 0.9,
        },
      },
    ],
  },
  {
    id: "welfare-reform-implementation",
    conditionDefinitionId: "youth-welfare-reform",
    title: "The Welfare Implementation",
    signalTitle: "The Rules Are Better and the Access Is Harder",
    signalBody: "Education, safeguarding, and registration reforms are improving long-term pathways, but they are also reducing casual access to players and their environments.",
    decisionTitle: "Choose a Welfare Implementation Model",
    decisionBody: "Commit to welfare-first partnerships, build a heavier documentation desk, or trim speculative coverage until the new regime settles.",
    aftermathTitle: "Your Welfare Standards Are Noticed",
    aftermathByChoice: {
      "welfare-partnerships": "Players and staff trust your process more, though every credible route takes longer to establish.",
      "documentation-desk": "Your reports carry better institutional weight, while flexible discovery work becomes less central to the week.",
      "trim-speculation": "You preserve capacity and avoid preventable mistakes, but more early pathways form without your involvement.",
    },
    decisionDelayWeeks: 2,
    aftermathDelayWeeks: 5,
    defaultChoiceId: "documentation-desk",
    choices: [
      {
        id: "welfare-partnerships",
        label: "Commit to welfare-first partnerships",
        knownTradeoffs: ["Improves development trust and evidence quality", "Reduces short-notice opportunities"],
        fatigueDelta: 4,
        reputationDelta: 3,
        modifiers: {
          observationConfidenceMultiplier: 1.08,
          developmentMultiplier: 1.08,
          opportunityMultiplier: 0.92,
        },
      },
      {
        id: "documentation-desk",
        label: "Build a stronger documentation desk",
        knownTradeoffs: ["Improves institutional acceptance and auditability", "Adds recurring cost and lowers speculative discovery"],
        fatigueDelta: 2,
        reputationDelta: 2,
        modifiers: {
          recruitmentScoreAdjustment: 4,
          seasonalFinanceAdjustment: -500,
          discoveryMultiplier: 0.92,
        },
      },
      {
        id: "trim-speculation",
        label: "Trim speculative coverage",
        knownTradeoffs: ["Protects capacity and avoids risky shortcuts", "Leaves fewer early stories on your desk"],
        fatigueDelta: -3,
        reputationDelta: -1,
        modifiers: {
          opportunityMultiplier: 0.84,
          rivalPressureMultiplier: 0.9,
          travelCostMultiplier: 0.94,
        },
      },
    ],
  },
  {
    id: "media-scrutiny-posture",
    conditionDefinitionId: "local-media-scrutiny",
    title: "The Media Posture",
    signalTitle: "Every Youth Lead Is Suddenly a Headline",
    signalBody: "Local media are following youth recruitment closely. Public attention can open doors and market demand, but leaks, family pressure, and rival interference are rising with it.",
    decisionTitle: "Choose a Media Posture",
    decisionBody: "Go quiet and protect sources, shape a controlled public signal, or invest directly in family briefings to keep cases stable under scrutiny.",
    aftermathTitle: "The Region Learns Your Posture",
    aftermathByChoice: {
      "protect-sources": "Your cases stay calmer and more private, though public momentum and open-market pricing cool.",
      "controlled-publicity": "The market notices your players earlier, and rivals follow the same trail with greater force.",
      "family-briefings": "Families trust your intentions more, but the work is personal, tiring, and slower to scale.",
    },
    decisionDelayWeeks: 1,
    aftermathDelayWeeks: 4,
    defaultChoiceId: "family-briefings",
    choices: [
      {
        id: "protect-sources",
        label: "Go quiet and protect sources",
        knownTradeoffs: ["Reduces leaks and rival visibility", "Lowers public demand and commercial heat"],
        fatigueDelta: 2,
        reputationDelta: 1,
        modifiers: {
          observationConfidenceMultiplier: 1.04,
          marketplaceValueMultiplier: 0.94,
          rivalPressureMultiplier: 0.88,
        },
      },
      {
        id: "controlled-publicity",
        label: "Shape controlled publicity",
        knownTradeoffs: ["Raises demand and opportunity flow", "Invites stronger rival pressure and noisier reads"],
        fatigueDelta: 4,
        reputationDelta: 1,
        modifiers: {
          opportunityMultiplier: 1.1,
          marketplaceValueMultiplier: 1.1,
          rivalPressureMultiplier: 1.18,
        },
      },
      {
        id: "family-briefings",
        label: "Invest in direct family briefings",
        knownTradeoffs: ["Improves trust and pathway stability", "Consumes time and reduces weekly breadth"],
        fatigueDelta: 6,
        reputationDelta: 2,
        modifiers: {
          observationConfidenceMultiplier: 1.06,
          recruitmentScoreAdjustment: 3,
          discoveryMultiplier: 0.94,
        },
      },
    ],
  },
];

const DEFINITION_BY_CONDITION = new Map(
  ARC_DEFINITIONS.map((definition) => [definition.conditionDefinitionId, definition]),
);
const DEFINITION_BY_ID = new Map(
  ARC_DEFINITIONS.map((definition) => [definition.id, definition]),
);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function absoluteWeek(date: GameDate, seasonLength: number): number {
  return (Math.max(1, date.season) - 1) * seasonLength + Math.max(0, date.week - 1);
}

function fromAbsoluteWeek(value: number, seasonLength: number): GameDate {
  const safe = Math.max(0, Math.floor(value));
  return {
    season: Math.floor(safe / seasonLength) + 1,
    week: (safe % seasonLength) + 1,
  };
}

function addWeeks(date: GameDate, weeks: number, seasonLength: number): GameDate {
  return fromAbsoluteWeek(absoluteWeek(date, seasonLength) + Math.max(0, weeks), seasonLength);
}

function isDue(now: GameDate, dueAt: GameDate, seasonLength: number): boolean {
  return absoluteWeek(now, seasonLength) >= absoluteWeek(dueAt, seasonLength);
}

function safeDate(value: unknown): GameDate | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const date = value as Partial<GameDate>;
  if (!Number.isFinite(date.week) || !Number.isFinite(date.season)) return undefined;
  return {
    week: Math.max(1, Math.floor(date.week!)),
    season: Math.max(1, Math.floor(date.season!)),
  };
}

function safeArc(value: unknown): WorldConditionArcInstance | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const arc = value as Partial<WorldConditionArcInstance>;
  const startedAt = safeDate(arc.startedAt);
  const decisionAt = safeDate(arc.decisionAt);
  if (
    typeof arc.id !== "string"
    || typeof arc.definitionId !== "string"
    || typeof arc.conditionInstanceId !== "string"
    || typeof arc.conditionDefinitionId !== "string"
    || !DEFINITION_BY_ID.has(arc.definitionId)
    || !startedAt
    || !decisionAt
    || !["signal", "decision", "aftermath"].includes(arc.phase ?? "")
  ) return undefined;
  const definition = DEFINITION_BY_ID.get(arc.definitionId);
  const selectedChoiceId = typeof arc.selectedChoiceId === "string"
    && definition?.choices.some((choice) => choice.id === arc.selectedChoiceId)
      ? arc.selectedChoiceId
      : undefined;
  return {
    id: arc.id,
    definitionId: arc.definitionId,
    conditionInstanceId: arc.conditionInstanceId,
    conditionDefinitionId: arc.conditionDefinitionId,
    countryId: typeof arc.countryId === "string" ? arc.countryId : undefined,
    season: Number.isFinite(arc.season) ? Math.max(1, Math.floor(arc.season!)) : startedAt.season,
    startedAt,
    decisionAt,
    phase: arc.phase as WorldConditionArcPhase,
    emittedBeatIds: Array.isArray(arc.emittedBeatIds)
      ? [...new Set(arc.emittedBeatIds.filter((id): id is string => typeof id === "string"))]
      : [],
    outcomeRoll: Number.isFinite(arc.outcomeRoll) ? clamp(arc.outcomeRoll!, 0, 1) : 0,
    selectedChoiceId,
    selectedAt: safeDate(arc.selectedAt),
    aftermathAt: safeDate(arc.aftermathAt),
    completedAt: safeDate(arc.completedAt),
  };
}

export function createWorldConditionArcState(
  raw?: unknown,
  eligibleCountries?: readonly string[],
): WorldConditionArcState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { version: WORLD_CONDITION_ARC_STATE_VERSION, active: {}, completed: [] };
  }
  const candidate = raw as Partial<WorldConditionArcState>;
  const eligible = eligibleCountries && eligibleCountries.length > 0
    ? new Set(eligibleCountries)
    : undefined;
  const active = candidate.active && typeof candidate.active === "object" && !Array.isArray(candidate.active)
    ? Object.fromEntries(Object.values(candidate.active).flatMap((value) => {
        const arc = safeArc(value);
        return arc
          && !arc.completedAt
          && (!arc.countryId || !eligible || eligible.has(arc.countryId))
          ? [[arc.id, arc]]
          : [];
      }))
    : {};
  const completed = Array.isArray(candidate.completed)
    ? candidate.completed.flatMap((value) => {
        const arc = safeArc(value);
        return arc?.completedAt ? [arc] : [];
      }).sort((left, right) =>
        absoluteWeek(left.completedAt!, 38) - absoluteWeek(right.completedAt!, 38),
      ).slice(-WORLD_CONDITION_ARC_COMPLETED_LIMIT)
    : [];
  return { version: WORLD_CONDITION_ARC_STATE_VERSION, active, completed };
}

export function startWorldConditionArcs(input: {
  state: WorldConditionArcState;
  rootSeed: string;
  conditions: readonly WorldConditionInstance[];
  now: GameDate;
  seasonLength?: number;
}): WorldConditionArcState {
  const seasonLength = Math.max(1, Math.floor(input.seasonLength ?? 38));
  const seenConditions = new Set([
    ...Object.values(input.state.active).map((arc) => arc.conditionInstanceId),
    ...input.state.completed.map((arc) => arc.conditionInstanceId),
  ]);
  // Arc copy is authored as a once-per-career turning point. A recurring
  // seasonal condition may return later, but replaying the same three beats
  // would both contradict the story director's career limit and create a
  // repetitive decision grind.
  const seenDefinitions = new Set([
    ...Object.values(input.state.active).map((arc) => arc.definitionId),
    ...input.state.completed.map((arc) => arc.definitionId),
  ]);
  const active = { ...input.state.active };
  for (const condition of [...input.conditions].sort((left, right) => left.id.localeCompare(right.id))) {
    const definition = DEFINITION_BY_CONDITION.get(condition.definitionId);
    if (
      !definition
      || seenConditions.has(condition.id)
      || seenDefinitions.has(definition.id)
    ) continue;
    const id = `world-arc:${condition.id}:${definition.id}`;
    const rng = createNamedRNG(input.rootSeed, "world-condition-arc", id);
    active[id] = {
      id,
      definitionId: definition.id,
      conditionInstanceId: condition.id,
      conditionDefinitionId: condition.definitionId,
      countryId: condition.countryId,
      season: condition.season,
      startedAt: { ...input.now },
      decisionAt: addWeeks(input.now, definition.decisionDelayWeeks, seasonLength),
      phase: "signal",
      emittedBeatIds: [],
      outcomeRoll: rng.next(),
    };
    seenConditions.add(condition.id);
    seenDefinitions.add(definition.id);
  }
  return { ...input.state, active };
}

function choiceEffects(
  arc: WorldConditionArcInstance,
  choice: WorldConditionArcChoiceDefinition,
  now: GameDate,
): ConsequenceEffect[] {
  const effects: ConsequenceEffect[] = [{
    id: `effect:${arc.id}:${choice.id}:strategy`,
    type: "recordFact",
    fact: {
      id: `fact:${arc.id}:strategy`,
      kind: "worldConditionArcStrategy",
      subject: { kind: "worldCondition", id: arc.conditionInstanceId },
      value: choice.id,
      observedAt: { ...now },
      visibility: "public",
      sourceDecisionId: `decision:${arc.id}`,
      metadata: {
        arcId: arc.id,
        countryId: arc.countryId ?? "global",
        modifiers: choice.modifiers as unknown as JsonValue,
      },
    },
  }];
  if (choice.fatigueDelta !== 0) effects.push({
    id: `effect:${arc.id}:${choice.id}:fatigue`,
    type: "adjustMetric",
    metricKey: "scout:fatigue",
    delta: choice.fatigueDelta,
    min: 0,
    max: 100,
  });
  if (choice.reputationDelta !== 0) effects.push({
    id: `effect:${arc.id}:${choice.id}:reputation`,
    type: "adjustMetric",
    metricKey: "scout:reputation",
    delta: choice.reputationDelta,
    min: 0,
    max: 100,
  });
  return effects;
}

export function materializeWorldConditionArcDecision(
  arc: WorldConditionArcInstance,
  now: GameDate,
  seasonLength = 38,
): DecisionRecord | undefined {
  const definition = DEFINITION_BY_ID.get(arc.definitionId);
  if (!definition) return undefined;
  const options: DecisionOption[] = definition.choices.map((choice) => ({
    id: choice.id,
    label: choice.label,
    knownTradeoffs: [...choice.knownTradeoffs],
    immediateEffects: choiceEffects(arc, choice, now),
    scheduledConsequences: [],
  }));
  return {
    id: `decision:${arc.id}`,
    source: { kind: "worldConditionArc", id: arc.id },
    offeredAt: { ...now },
    deadlineAt: addWeeks(now, 2, Math.max(1, seasonLength)),
    status: "offered",
    visibility: "public",
    stakeholders: [{ kind: "worldCondition", id: arc.conditionInstanceId }],
    options,
    defaultOptionId: definition.defaultChoiceId,
    outcomeRoll: arc.outcomeRoll,
    consequenceIds: [],
    metadata: {
      title: definition.decisionTitle,
      premise: definition.decisionBody,
      arcId: arc.id,
      definitionId: definition.id,
      conditionDefinitionId: arc.conditionDefinitionId,
      countryId: arc.countryId ?? "global",
      semanticSignature: `world-arc:${arc.conditionDefinitionId}`,
    },
  };
}

export function getDueWorldConditionArcBeats(input: {
  state: WorldConditionArcState;
  now: GameDate;
  seasonLength?: number;
}): DueWorldConditionArcBeat[] {
  const seasonLength = Math.max(1, Math.floor(input.seasonLength ?? 38));
  return Object.values(input.state.active).sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((arc) => {
      const definition = DEFINITION_BY_ID.get(arc.definitionId);
      if (!definition) return [];
      const signalBeatId = `${arc.id}:signal`;
      const signalEmitted = arc.emittedBeatIds.includes(signalBeatId);
      const decisionReady = isDue(input.now, arc.decisionAt, seasonLength);
      // Never jump straight from an unseen signal to its choice. If another
      // opening won the early weekly slot, the overdue signal becomes a due
      // continuation and the decision follows on the next weekly pass.
      const phase = arc.selectedChoiceId
        ? "aftermath"
        : !signalEmitted
          ? "signal"
          : decisionReady
            ? "decision"
            : "signal";
      const dueAt = phase === "signal"
        ? arc.startedAt
        : phase === "decision"
          ? arc.decisionAt
          : arc.aftermathAt;
      if (!dueAt || !isDue(input.now, dueAt, seasonLength)) return [];
      const beatId = `${arc.id}:${phase}`;
      if (arc.emittedBeatIds.includes(beatId)) return [];
      const choice = definition.choices.find((candidate) => candidate.id === arc.selectedChoiceId);
      const title = phase === "signal"
        ? definition.signalTitle
        : phase === "decision"
          ? definition.decisionTitle
          : definition.aftermathTitle;
      const body = phase === "signal"
        ? definition.signalBody
        : phase === "decision"
          ? definition.decisionBody
          : definition.aftermathByChoice[choice?.id ?? definition.defaultChoiceId];
      return [{
        arc,
        beatId,
        phase,
        title,
        body,
        candidate: {
          id: beatId,
          templateId: definition.id,
          kind: "worldArc",
          category: arc.conditionDefinitionId,
          semanticSignature: `world-arc:${arc.conditionDefinitionId}:${phase}`,
          baseWeight: 1,
          cast: [],
          topics: [{ kind: "worldCondition", id: arc.conditionInstanceId }],
          continuation: phase !== "signal" || decisionReady,
          requiresChoice: phase === "decision",
          careerLimit: phase === "signal" ? 1 : undefined,
        },
        ...(phase === "decision"
          ? { decision: materializeWorldConditionArcDecision(arc, input.now, seasonLength) }
          : {}),
      }];
    });
}

export function recordWorldConditionArcBeat(
  state: WorldConditionArcState,
  arcId: string,
  phase: WorldConditionArcPhase,
  now: GameDate,
): WorldConditionArcState {
  const arc = state.active[arcId];
  if (!arc) return state;
  const beatId = `${arc.id}:${phase}`;
  if (arc.emittedBeatIds.includes(beatId)) return state;
  const updated: WorldConditionArcInstance = {
    ...arc,
    phase,
    emittedBeatIds: [...arc.emittedBeatIds, beatId],
    ...(phase === "aftermath" ? { completedAt: { ...now } } : {}),
  };
  if (phase !== "aftermath") {
    return { ...state, active: { ...state.active, [arcId]: updated } };
  }
  const { [arcId]: removed, ...active } = state.active;
  void removed;
  return {
    ...state,
    active,
    completed: [...state.completed, updated].sort((left, right) =>
      absoluteWeek(left.completedAt!, 38) - absoluteWeek(right.completedAt!, 38),
    ).slice(-WORLD_CONDITION_ARC_COMPLETED_LIMIT),
  };
}

export function applyWorldConditionArcDecision(input: {
  state: WorldConditionArcState;
  decision: DecisionRecord;
  now: GameDate;
  seasonLength?: number;
}): WorldConditionArcState {
  const arcId = typeof input.decision.metadata?.arcId === "string"
    ? input.decision.metadata.arcId
    : input.decision.source.kind === "worldConditionArc"
      ? input.decision.source.id
      : undefined;
  if (!arcId || !input.decision.selectedOptionId) return input.state;
  const arc = input.state.active[arcId];
  const definition = arc ? DEFINITION_BY_ID.get(arc.definitionId) : undefined;
  if (!arc || !definition?.choices.some((choice) => choice.id === input.decision.selectedOptionId)) {
    return input.state;
  }
  if (arc.selectedChoiceId) return input.state;
  const seasonLength = Math.max(1, Math.floor(input.seasonLength ?? 38));
  // Default decisions are selected at their inclusive deadline and may only be
  // reconciled on the next weekly tick. Anchor the aftermath to the persisted
  // selection date so a save/reload or batch boundary cannot delay the arc.
  const selectedAt = input.decision.selectedAt ?? input.now;
  return {
    ...input.state,
    active: {
      ...input.state.active,
      [arcId]: {
        ...arc,
        phase: "aftermath",
        selectedChoiceId: input.decision.selectedOptionId,
        selectedAt: { ...selectedAt },
        aftermathAt: addWeeks(selectedAt, definition.aftermathDelayWeeks, seasonLength),
      },
    },
  };
}

/**
 * Reconcile decisions selected by the player, a deadline default, or a loaded
 * save into the persisted arc state. Reapplying is intentionally idempotent.
 */
export function reconcileWorldConditionArcDecisions(input: {
  state: WorldConditionArcState;
  decisions: Readonly<Record<string, DecisionRecord>>;
  now: GameDate;
  seasonLength?: number;
}): WorldConditionArcState {
  let state = input.state;
  for (const decision of Object.values(input.decisions)
    .filter((candidate) =>
      candidate.source.kind === "worldConditionArc"
      && typeof candidate.selectedOptionId === "string",
    )
    .sort((left, right) => left.id.localeCompare(right.id))) {
    state = applyWorldConditionArcDecision({
      state,
      decision,
      now: input.now,
      seasonLength: input.seasonLength,
    });
  }
  return state;
}

/** Close malformed save prompts whose owning arc no longer exists. */
export function closeOrphanedWorldConditionArcDecisions(input: {
  state: WorldConditionArcState;
  decisions: Readonly<Record<string, DecisionRecord>>;
  now: GameDate;
}): {
  decisions: Record<string, DecisionRecord>;
  closedDecisionIds: string[];
} {
  const activeArcIds = new Set(Object.keys(input.state.active));
  const closedDecisionIds: string[] = [];
  let decisions = input.decisions as Record<string, DecisionRecord>;
  for (const decision of Object.values(input.decisions)
    .filter((candidate) =>
      candidate.source.kind === "worldConditionArc"
      && candidate.status === "offered"
      && !activeArcIds.has(candidate.source.id),
    )
    .sort((left, right) => left.id.localeCompare(right.id))) {
    if (decisions === input.decisions) decisions = { ...input.decisions };
    decisions[decision.id] = {
      ...decision,
      status: "expired",
      selectionKind: "system",
      expiredAt: { ...input.now },
      resolvedAt: { ...input.now },
    };
    closedDecisionIds.push(decision.id);
  }
  return { decisions, closedDecisionIds };
}

const NEUTRAL_MODIFIERS: WorldConditionModifiers = {
  discoveryMultiplier: 1,
  observationConfidenceMultiplier: 1,
  opportunityMultiplier: 1,
  developmentMultiplier: 1,
  breakthroughMultiplier: 1,
  recruitmentScoreAdjustment: 0,
  travelCostMultiplier: 1,
  travelDurationDelta: 0,
  travelFatigueMultiplier: 1,
  marketplaceValueMultiplier: 1,
  rivalPressureMultiplier: 1,
  seasonalFinanceAdjustment: 0,
};

/** Modifiers from live arc choices, ready to layer onto worldConditions. */
export function getWorldConditionArcModifiers(
  state: WorldConditionArcState,
  countryId?: string,
): WorldConditionModifiers {
  const result = { ...NEUTRAL_MODIFIERS };
  const arcs = Object.values(state.active)
    .filter((arc) =>
      arc.selectedChoiceId
      && (!arc.countryId || (countryId !== undefined && arc.countryId === countryId)),
    );
  for (const arc of arcs) {
    const definition = DEFINITION_BY_ID.get(arc.definitionId);
    const choice = definition?.choices.find((candidate) => candidate.id === arc.selectedChoiceId);
    if (!choice) continue;
    const modifiers = choice.modifiers;
    result.discoveryMultiplier *= modifiers.discoveryMultiplier ?? 1;
    result.observationConfidenceMultiplier *= modifiers.observationConfidenceMultiplier ?? 1;
    result.opportunityMultiplier *= modifiers.opportunityMultiplier ?? 1;
    result.developmentMultiplier *= modifiers.developmentMultiplier ?? 1;
    result.breakthroughMultiplier *= modifiers.breakthroughMultiplier ?? 1;
    result.recruitmentScoreAdjustment += modifiers.recruitmentScoreAdjustment ?? 0;
    result.travelCostMultiplier *= modifiers.travelCostMultiplier ?? 1;
    result.travelDurationDelta += modifiers.travelDurationDelta ?? 0;
    result.travelFatigueMultiplier *= modifiers.travelFatigueMultiplier ?? 1;
    result.marketplaceValueMultiplier *= modifiers.marketplaceValueMultiplier ?? 1;
    result.rivalPressureMultiplier *= modifiers.rivalPressureMultiplier ?? 1;
    result.seasonalFinanceAdjustment += modifiers.seasonalFinanceAdjustment ?? 0;
  }
  return {
    discoveryMultiplier: clamp(result.discoveryMultiplier, 0.7, 1.35),
    observationConfidenceMultiplier: clamp(result.observationConfidenceMultiplier, 0.75, 1.25),
    opportunityMultiplier: clamp(result.opportunityMultiplier, 0.7, 1.4),
    developmentMultiplier: clamp(result.developmentMultiplier, 0.8, 1.25),
    breakthroughMultiplier: clamp(result.breakthroughMultiplier, 0.8, 1.25),
    recruitmentScoreAdjustment: clamp(result.recruitmentScoreAdjustment, -8, 8),
    travelCostMultiplier: clamp(result.travelCostMultiplier, 0.75, 1.35),
    travelDurationDelta: Math.round(clamp(result.travelDurationDelta, -1, 1)),
    travelFatigueMultiplier: clamp(result.travelFatigueMultiplier, 0.8, 1.3),
    marketplaceValueMultiplier: clamp(result.marketplaceValueMultiplier, 0.75, 1.25),
    rivalPressureMultiplier: clamp(result.rivalPressureMultiplier, 0.75, 1.4),
    seasonalFinanceAdjustment: Math.round(clamp(result.seasonalFinanceAdjustment, -1_500, 1_500)),
  };
}

export function getWorldConditionArcDefinitions(): readonly WorldConditionArcDefinition[] {
  return ARC_DEFINITIONS;
}

export function getWorldConditionArcContentDefinitionIds(): string[] {
  return ARC_DEFINITIONS.map((definition) =>
    `world-condition-arc:${definition.id}`
  ).sort();
}
