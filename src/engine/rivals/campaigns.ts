import type { InboxMessage, RivalScout } from "@/engine/core/types";
import type {
  EntityRef,
  GameDate,
  Obligation,
  StakeholderMemory,
  WorldFact,
} from "@/engine/consequences/types";
import {
  createDeterministicRunId,
  createNamedRNG,
} from "@/engine/run";
import type { RivalOrganizationArchetypeId } from "./organizationTypes";

interface RivalCampaignOrganization {
  id: string;
  archetypeId: RivalOrganizationArchetypeId;
  memberRivalIds: string[];
}

interface RivalCampaignOrganizationContext {
  currentPressure: {
    sourceOrganizationId?: string;
  };
}

export type RivalCampaignTargetKind =
  | "player"
  | "contact"
  | "employee"
  | "family"
  | "journalist"
  | "club"
  | "venue"
  | "territory";

export type RivalCampaignKind =
  | "relationshipPoach"
  | "sourceLeak"
  | "territoryLock"
  | "showcaseControl"
  | "clubInfluence"
  | "mediaPressure"
  | "employeeDefection"
  | "familyAccess";

export type RivalCampaignPhase =
  | "signal"
  | "contest"
  | "response"
  | "aftermath";

export type RivalCampaignStatus =
  | "active"
  | "resolved"
  | "expired"
  | "aborted";

export type RivalCampaignResolution =
  | "success"
  | "failure"
  | "ignored"
  | "expired";

export type RivalCampaignResponseStyle =
  | "protect"
  | "counter"
  | "trade"
  | "withdraw";

export interface RivalCampaignTarget {
  entity: EntityRef;
  label: string;
  regionId?: string;
  playerId?: string;
  clubId?: string;
  notes?: string[];
}

export interface RivalCampaignDirectory {
  player?: readonly RivalCampaignTarget[];
  contact?: readonly RivalCampaignTarget[];
  employee?: readonly RivalCampaignTarget[];
  family?: readonly RivalCampaignTarget[];
  journalist?: readonly RivalCampaignTarget[];
  club?: readonly RivalCampaignTarget[];
  venue?: readonly RivalCampaignTarget[];
  territory?: readonly RivalCampaignTarget[];
}

export interface RivalCampaignCounterplayOption {
  id: string;
  label: string;
  style: RivalCampaignResponseStyle;
  successModifier: number;
  knownTradeoffs: string[];
}

export interface RivalCampaignSignal {
  headline: string;
  detail: string;
  urgency: "low" | "medium" | "high";
}

export interface RivalCampaignOperationalEffect {
  type:
    | "contactTrust"
    | "contactAccess"
    | "employeeMorale"
    | "territoryAccess"
    | "venueAccess"
    | "clubReceptiveness"
    | "rivalMomentum";
  target: EntityRef;
  delta?: number;
  note: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface RivalCampaignProvenancePacket {
  facts: WorldFact[];
  memories: StakeholderMemory[];
  obligations: Obligation[];
  operationalEffects: RivalCampaignOperationalEffect[];
}

export interface RivalCampaign {
  id: string;
  organizationId: string;
  organizationArchetypeId: RivalOrganizationArchetypeId;
  leadRivalId: string;
  kind: RivalCampaignKind;
  targetKind: RivalCampaignTargetKind;
  target: RivalCampaignTarget;
  phase: RivalCampaignPhase;
  status: RivalCampaignStatus;
  createdAt: GameDate;
  updatedAt: GameDate;
  phaseStartedAt: GameDate;
  responseDueAt?: GameDate;
  responseDecisionId?: string;
  outcomeRoll: number;
  baseSuccessChance: number;
  visibleSignals: RivalCampaignSignal[];
  responseOptions: RivalCampaignCounterplayOption[];
  subjectRefs: EntityRef[];
  relatedPlayerId?: string;
  relatedClubId?: string;
  result?: {
    resolution: RivalCampaignResolution;
    responseOptionId?: string;
    success: boolean;
    resolvedAt: GameDate;
  };
}

export interface RivalCampaignHistoryRecord {
  id: string;
  organizationId: string;
  leadRivalId: string;
  kind: RivalCampaignKind;
  targetKind: RivalCampaignTargetKind;
  targetLabel: string;
  status: RivalCampaignStatus;
  resolution?: RivalCampaignResolution;
  createdAt: GameDate;
  resolvedAt?: GameDate;
}

export interface RivalCampaignState {
  campaigns: Record<string, RivalCampaign>;
  history: RivalCampaignHistoryRecord[];
  processedWeekKeys: string[];
}

export interface DirectRivalCampaignWeekInput {
  rootSeed: string;
  season: number;
  week: number;
  seasonLength: number;
  organizationState?: RivalCampaignOrganizationContext;
  organizations: Readonly<Record<string, RivalCampaignOrganization>>;
  rivalScouts: Readonly<Record<string, RivalScout>>;
  directory: RivalCampaignDirectory;
  state?: RivalCampaignState;
  maxActiveCampaigns?: number;
  maxWeeklySpawns?: number;
  spawnChanceMultiplier?: number;
}

export interface DirectRivalCampaignWeekResult {
  state: RivalCampaignState;
  changed: boolean;
  spawned: RivalCampaign[];
  advanced: RivalCampaign[];
  resolved: RivalCampaign[];
  messages: InboxMessage[];
  provenance: RivalCampaignProvenancePacket[];
}

export interface ResolveRivalCampaignResponseInput {
  rootSeed: string;
  state: RivalCampaignState;
  campaignId: string;
  responseOptionId: string;
  date: GameDate;
  /** Deadline defaults and explicit withdrawal cannot roll into a success. */
  forcedResolution?: Extract<RivalCampaignResolution, "ignored" | "expired">;
}

export interface ResolveRivalCampaignResponseResult {
  state: RivalCampaignState;
  changed: boolean;
  campaign?: RivalCampaign;
  message?: InboxMessage;
  provenance?: RivalCampaignProvenancePacket;
  error?: string;
}

const MAX_HISTORY = 120;
const MAX_PROCESSED_WEEK_KEYS = 160;
const DEFAULT_MAX_ACTIVE_CAMPAIGNS = 6;
const DEFAULT_MAX_WEEKLY_SPAWNS = 2;

const KIND_TARGETS: Readonly<Record<RivalCampaignKind, readonly RivalCampaignTargetKind[]>> = {
  relationshipPoach: ["contact", "journalist", "employee"],
  sourceLeak: ["journalist", "contact"],
  territoryLock: ["territory", "venue", "contact"],
  showcaseControl: ["venue", "player"],
  clubInfluence: ["club", "player"],
  mediaPressure: ["journalist", "player", "club"],
  employeeDefection: ["employee", "contact"],
  familyAccess: ["family", "player", "contact"],
};

const KIND_SUCCESS_CHANCE: Readonly<Record<RivalCampaignKind, number>> = {
  relationshipPoach: 0.52,
  sourceLeak: 0.46,
  territoryLock: 0.57,
  showcaseControl: 0.6,
  clubInfluence: 0.49,
  mediaPressure: 0.43,
  employeeDefection: 0.48,
  familyAccess: 0.54,
};

const EFFECT_TYPE_BY_TARGET_KIND: Readonly<Record<
  RivalCampaignTargetKind,
  Exclude<RivalCampaignOperationalEffect["type"], "rivalMomentum">
>> = {
  contact: "contactTrust",
  journalist: "contactTrust",
  employee: "employeeMorale",
  territory: "territoryAccess",
  venue: "venueAccess",
  club: "clubReceptiveness",
  family: "contactAccess",
  player: "contactAccess",
};

const ARCHETYPE_KIND_WEIGHTS: Readonly<Record<
  RivalOrganizationArchetypeId,
  ReadonlyArray<{ kind: RivalCampaignKind; weight: number }>
>> = {
  "academy-conglomerate": [
    { kind: "showcaseControl", weight: 3 },
    { kind: "familyAccess", weight: 2 },
    { kind: "clubInfluence", weight: 1 },
  ],
  "analytics-syndicate": [
    { kind: "clubInfluence", weight: 3 },
    { kind: "mediaPressure", weight: 1 },
    { kind: "territoryLock", weight: 2 },
  ],
  "agent-black-book": [
    { kind: "relationshipPoach", weight: 3 },
    { kind: "sourceLeak", weight: 2 },
    { kind: "familyAccess", weight: 2 },
  ],
  "club-consortium": [
    { kind: "clubInfluence", weight: 3 },
    { kind: "employeeDefection", weight: 2 },
    { kind: "territoryLock", weight: 2 },
  ],
  "regional-guild": [
    { kind: "territoryLock", weight: 3 },
    { kind: "relationshipPoach", weight: 2 },
    { kind: "showcaseControl", weight: 2 },
  ],
  "global-sports-group": [
    { kind: "clubInfluence", weight: 3 },
    { kind: "mediaPressure", weight: 2 },
    { kind: "familyAccess", weight: 2 },
    { kind: "employeeDefection", weight: 1 },
  ],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function compareDate(left: GameDate, right: GameDate): number {
  return left.season - right.season || left.week - right.week;
}

function addWeeks(
  date: GameDate,
  weeks: number,
  seasonLength: number,
): GameDate {
  let season = date.season;
  let week = date.week + weeks;
  while (week > seasonLength) {
    week -= seasonLength;
    season += 1;
  }
  while (week < 1) {
    season -= 1;
    week += seasonLength;
  }
  return { season, week };
}

function createState(partial?: RivalCampaignState): RivalCampaignState {
  return {
    campaigns: { ...(partial?.campaigns ?? {}) },
    history: [...(partial?.history ?? [])].slice(-MAX_HISTORY),
    processedWeekKeys: [...(partial?.processedWeekKeys ?? [])].slice(-MAX_PROCESSED_WEEK_KEYS),
  };
}

function weekKey(season: number, week: number): string {
  return `s${season}:w${week}`;
}

function isCampaignActive(campaign: RivalCampaign): boolean {
  return campaign.status === "active";
}

function campaignEntity(campaign: RivalCampaign): EntityRef {
  return { kind: "rivalCampaign", id: campaign.id };
}

function rivalEntity(rivalId: string): EntityRef {
  return { kind: "rival", id: rivalId };
}

function organizationEntity(organizationId: string): EntityRef {
  return { kind: "rivalOrganization", id: organizationId };
}

function chooseLeadRival(
  rivalScouts: Readonly<Record<string, RivalScout>>,
  organization: RivalCampaignOrganization,
  rng: ReturnType<typeof createNamedRNG>,
): RivalScout | null {
  const members = organization.memberRivalIds
    .map((id) => rivalScouts[id])
    .filter((rival): rival is RivalScout => Boolean(rival));
  if (members.length === 0) return null;
  const weighted = members.map((rival) => ({
    item: rival,
    weight: Math.max(
      1,
      rival.reputation
        + rival.quality * 8
        + Math.round(rival.aggressiveness * 18),
    ),
  }));
  return rng.pickWeighted(weighted);
}

function campaignKindWeights(
  organization: RivalCampaignOrganization,
): ReadonlyArray<{ kind: RivalCampaignKind; weight: number }> {
  return ARCHETYPE_KIND_WEIGHTS[organization.archetypeId];
}

function compatibleTargets(
  directory: RivalCampaignDirectory,
  kind: RivalCampaignKind,
): RivalCampaignTarget[] {
  const result: RivalCampaignTarget[] = [];
  for (const targetKind of KIND_TARGETS[kind]) {
    for (const target of directory[targetKind] ?? []) {
      result.push(target);
    }
  }
  return result;
}

function inferTargetKind(target: RivalCampaignTarget): RivalCampaignTargetKind {
  return target.entity.kind as RivalCampaignTargetKind;
}

function distinctRefs(refs: readonly EntityRef[]): EntityRef[] {
  const map = new Map<string, EntityRef>();
  for (const ref of refs) {
    map.set(`${ref.kind}:${ref.id}`, ref);
  }
  return [...map.values()];
}

function buildSignals(
  kind: RivalCampaignKind,
  target: RivalCampaignTarget,
  phase: RivalCampaignPhase,
): RivalCampaignSignal[] {
  const targetLabel = target.label;
  const region = target.regionId ? ` in ${target.regionId}` : "";
  const phaseCopy: Record<RivalCampaignPhase, RivalCampaignSignal[]> = {
    signal: [{
      headline: {
        relationshipPoach: "A source is turning quiet",
        sourceLeak: "A private line is no longer private",
        territoryLock: "A market is tightening",
        showcaseControl: "Access is narrowing",
        clubInfluence: "A buyer is being worked",
        mediaPressure: "A narrative is building",
        employeeDefection: "An inside role is wobbling",
        familyAccess: "A gatekeeper is being courted",
      }[kind],
      detail: {
        relationshipPoach: `${targetLabel} is responding less freely${region}. Another desk may be building a relationship behind the scenes.`,
        sourceLeak: `Information around ${targetLabel}${region} is travelling in narrower circles than before.`,
        territoryLock: `${targetLabel}${region} is becoming harder to enter cleanly without local help.`,
        showcaseControl: `${targetLabel}${region} is drawing more controlled access than usual.`,
        clubInfluence: `${targetLabel}${region} is receiving more coordinated attention from outside recruitment desks.`,
        mediaPressure: `Discussion around ${targetLabel}${region} is accelerating in a way that may not stay private.`,
        employeeDefection: `${targetLabel}${region} looks vulnerable to an outside approach.`,
        familyAccess: `${targetLabel}${region} is being approached through trusted intermediaries.`,
      }[kind],
      urgency: "medium",
    }],
    contest: [{
      headline: {
        relationshipPoach: "A rival has made a concrete approach",
        sourceLeak: "Selective details are being moved",
        territoryLock: "Access is being boxed in",
        showcaseControl: "The event is being captured",
        clubInfluence: "Decision-makers are being pressured",
        mediaPressure: "The story is moving into public shape",
        employeeDefection: "A competing offer is active",
        familyAccess: "Another route to the family is open",
      }[kind],
      detail: {
        relationshipPoach: `A rival is trying to pull ${targetLabel} into an exclusive orbit.`,
        sourceLeak: `Private context tied to ${targetLabel} is being positioned to travel further.`,
        territoryLock: `${targetLabel}${region} is being fenced through referrals, logistics, and local promises.`,
        showcaseControl: `The access around ${targetLabel}${region} is being organized for preferred scouts first.`,
        clubInfluence: `${targetLabel}${region} is being framed for one recruitment agenda over another.`,
        mediaPressure: `The conversation around ${targetLabel}${region} is being steered toward urgency and visibility.`,
        employeeDefection: `${targetLabel}${region} now has a live competing offer or invitation.`,
        familyAccess: `A rival has found a trusted path into ${targetLabel}${region}.`,
      }[kind],
      urgency: "high",
    }],
    response: [{
      headline: "A response is required",
      detail: `You need to decide how to handle the pressure around ${targetLabel}. Waiting will concede the initiative.`,
      urgency: "high",
    }],
    aftermath: [{
      headline: "The campaign leaves a scar",
      detail: `The result around ${targetLabel} will shape who shares access, credit, and trust next time.`,
      urgency: "low",
    }],
  };
  return phaseCopy[phase];
}

function buildResponseOptions(kind: RivalCampaignKind): RivalCampaignCounterplayOption[] {
  const options: Record<RivalCampaignKind, RivalCampaignCounterplayOption[]> = {
    relationshipPoach: [
      {
        id: "protect-source",
        label: "Protect the source",
        style: "protect",
        successModifier: 0.08,
        knownTradeoffs: ["Costs attention this week", "You may need to share future discretion"],
      },
      {
        id: "trade-credit",
        label: "Trade some credit for access",
        style: "trade",
        successModifier: 0.14,
        knownTradeoffs: ["Preserves the channel", "Weakens your visible claim"],
      },
      {
        id: "walk-away",
        label: "Walk away cleanly",
        style: "withdraw",
        successModifier: -0.18,
        knownTradeoffs: ["Avoids escalation", "Likely cedes the relationship"],
      },
    ],
    sourceLeak: [
      {
        id: "tighten-discretion",
        label: "Tighten discretion",
        style: "protect",
        successModifier: 0.1,
        knownTradeoffs: ["Protects future trust", "Reduces short-term information flow"],
      },
      {
        id: "counter-brief",
        label: "Counter-brief the situation",
        style: "counter",
        successModifier: 0.04,
        knownTradeoffs: ["Can neutralize the leak", "Risks drawing more attention"],
      },
      {
        id: "let-it-pass",
        label: "Let it pass",
        style: "withdraw",
        successModifier: -0.15,
        knownTradeoffs: ["Preserves your time", "You lose control of the story"],
      },
    ],
    territoryLock: [
      {
        id: "reinforce-local-bridge",
        label: "Reinforce a local bridge",
        style: "protect",
        successModifier: 0.12,
        knownTradeoffs: ["Creates obligations", "Improves future access if it works"],
      },
      {
        id: "force-entry",
        label: "Force entry anyway",
        style: "counter",
        successModifier: -0.02,
        knownTradeoffs: ["Can keep you present", "Can burn the territory harder if it fails"],
      },
      {
        id: "pivot-market",
        label: "Pivot to another market",
        style: "withdraw",
        successModifier: -0.2,
        knownTradeoffs: ["Preserves resources", "Concedes this territory in the short term"],
      },
    ],
    showcaseControl: [
      {
        id: "secure-host",
        label: "Secure a local host",
        style: "protect",
        successModifier: 0.11,
        knownTradeoffs: ["Costs a favor", "Creates future access if it lands"],
      },
      {
        id: "compete-openly",
        label: "Compete openly",
        style: "counter",
        successModifier: 0.03,
        knownTradeoffs: ["Keeps you visible", "Raises rivalry heat immediately"],
      },
      {
        id: "skip-showcase",
        label: "Skip the showcase",
        style: "withdraw",
        successModifier: -0.22,
        knownTradeoffs: ["Saves time", "Likely loses the access battle"],
      },
    ],
    clubInfluence: [
      {
        id: "back-your-case",
        label: "Back your case harder",
        style: "counter",
        successModifier: 0.09,
        knownTradeoffs: ["Improves your chance", "Costs credibility if the club disagrees"],
      },
      {
        id: "protect-relationship",
        label: "Protect the long relationship",
        style: "protect",
        successModifier: 0.02,
        knownTradeoffs: ["Keeps trust steadier", "May lose this immediate race"],
      },
      {
        id: "withdraw-recommendation",
        label: "Withdraw from the fight",
        style: "withdraw",
        successModifier: -0.16,
        knownTradeoffs: ["Avoids a political loss", "Concedes the buyer's attention"],
      },
    ],
    mediaPressure: [
      {
        id: "shape-the-story",
        label: "Shape the story",
        style: "counter",
        successModifier: 0.06,
        knownTradeoffs: ["Can stabilize the narrative", "Makes you more visible in the dispute"],
      },
      {
        id: "insist-on-privacy",
        label: "Insist on privacy",
        style: "protect",
        successModifier: 0.1,
        knownTradeoffs: ["Protects trust with quieter stakeholders", "May antagonize the press"],
      },
      {
        id: "ignore-coverage",
        label: "Ignore the coverage",
        style: "withdraw",
        successModifier: -0.18,
        knownTradeoffs: ["Saves time", "Lets the rival define momentum"],
      },
    ],
    employeeDefection: [
      {
        id: "retain-publicly",
        label: "Retain publicly",
        style: "protect",
        successModifier: 0.13,
        knownTradeoffs: ["Strengthens internal trust", "Raises your operating cost later"],
      },
      {
        id: "challenge-the-offer",
        label: "Challenge the offer",
        style: "counter",
        successModifier: 0.02,
        knownTradeoffs: ["Can keep capacity in-house", "Escalates the rivalry directly"],
      },
      {
        id: "let-them-go",
        label: "Let them go",
        style: "withdraw",
        successModifier: -0.2,
        knownTradeoffs: ["Avoids a bidding war", "Likely loses knowledge and continuity"],
      },
    ],
    familyAccess: [
      {
        id: "protect-pathway",
        label: "Protect the pathway",
        style: "protect",
        successModifier: 0.12,
        knownTradeoffs: ["Builds family trust", "Can slow the move now"],
      },
      {
        id: "match-urgency",
        label: "Match the urgency",
        style: "counter",
        successModifier: 0.04,
        knownTradeoffs: ["Keeps you in the race", "Can damage trust if the player is not ready"],
      },
      {
        id: "step-back",
        label: "Step back",
        style: "withdraw",
        successModifier: -0.18,
        knownTradeoffs: ["Avoids overpromising", "Likely loses access to the family channel"],
      },
    ],
  };
  return options[kind];
}

function buildSubjectRefs(
  organization: RivalCampaignOrganization,
  leadRival: RivalScout,
  target: RivalCampaignTarget,
): EntityRef[] {
  return distinctRefs([
    organizationEntity(organization.id),
    rivalEntity(leadRival.id),
    target.entity,
    ...(target.playerId ? [{ kind: "player", id: target.playerId }] : []),
    ...(target.clubId ? [{ kind: "club", id: target.clubId }] : []),
  ]);
}

function createCampaign(
  input: {
    rootSeed: string;
    organization: RivalCampaignOrganization;
    leadRival: RivalScout;
    target: RivalCampaignTarget;
    kind: RivalCampaignKind;
    now: GameDate;
    seasonLength: number;
  },
): RivalCampaign {
  const { rootSeed, organization, leadRival, target, kind, now, seasonLength } = input;
  const id = createDeterministicRunId(
    "rival_campaign",
    rootSeed,
    organization.id,
    leadRival.id,
    kind,
    target.entity.kind,
    target.entity.id,
    now.season,
    now.week,
  );
  return {
    id,
    organizationId: organization.id,
    organizationArchetypeId: organization.archetypeId,
    leadRivalId: leadRival.id,
    kind,
    targetKind: inferTargetKind(target),
    target,
    phase: "signal",
    status: "active",
    createdAt: now,
    updatedAt: now,
    phaseStartedAt: now,
    outcomeRoll: createNamedRNG(rootSeed, "rival-campaign-roll", id).next(),
    baseSuccessChance: KIND_SUCCESS_CHANCE[kind],
    visibleSignals: buildSignals(kind, target, "signal"),
    responseOptions: buildResponseOptions(kind),
    subjectRefs: buildSubjectRefs(organization, leadRival, target),
    relatedPlayerId: target.playerId,
    relatedClubId: target.clubId,
    responseDueAt: addWeeks(now, 3, seasonLength),
  };
}

function toHistoryRecord(campaign: RivalCampaign): RivalCampaignHistoryRecord {
  return {
    id: campaign.id,
    organizationId: campaign.organizationId,
    leadRivalId: campaign.leadRivalId,
    kind: campaign.kind,
    targetKind: campaign.targetKind,
    targetLabel: campaign.target.label,
    status: campaign.status,
    resolution: campaign.result?.resolution,
    createdAt: campaign.createdAt,
    resolvedAt: campaign.result?.resolvedAt,
  };
}

function historyFor(
  history: readonly RivalCampaignHistoryRecord[],
  campaigns: Readonly<Record<string, RivalCampaign>>,
): RivalCampaignHistoryRecord[] {
  const terminal = Object.values(campaigns)
    .filter((campaign) => campaign.status !== "active")
    .map(toHistoryRecord);
  const merged = [...history, ...terminal];
  const deduped = new Map<string, RivalCampaignHistoryRecord>();
  for (const item of merged) {
    deduped.set(item.id, item);
  }
  return [...deduped.values()]
    .sort((left, right) =>
      right.createdAt.season - left.createdAt.season
      || right.createdAt.week - left.createdAt.week
      || left.id.localeCompare(right.id))
    .slice(0, MAX_HISTORY);
}

function advanceCampaign(
  campaign: RivalCampaign,
  now: GameDate,
  seasonLength: number,
): { campaign: RivalCampaign; message?: InboxMessage } {
  if (!isCampaignActive(campaign)) return { campaign };
  const age = (now.season - campaign.phaseStartedAt.season) * seasonLength
    + (now.week - campaign.phaseStartedAt.week);
  if (campaign.phase === "signal" && age >= 1) {
    const advanced: RivalCampaign = {
      ...campaign,
      phase: "contest",
      updatedAt: now,
      phaseStartedAt: now,
      visibleSignals: buildSignals(campaign.kind, campaign.target, "contest"),
    };
    return {
      campaign: advanced,
      message: {
        id: `campaign-contest-${campaign.id}-${now.season}-${now.week}`,
        week: now.week,
        season: now.season,
        type: "warning",
        title: advanced.visibleSignals[0]?.headline ?? "Rival contest escalates",
        body: advanced.visibleSignals[0]?.detail ?? "A rival contest has escalated.",
        read: false,
        actionRequired: false,
        relatedId: campaign.id,
      },
    };
  }
  if (campaign.phase === "contest" && age >= 1) {
    const decisionId = createDeterministicRunId(
      "rival_campaign_decision",
      campaign.id,
      now.season,
      now.week,
    );
    const advanced: RivalCampaign = {
      ...campaign,
      phase: "response",
      updatedAt: now,
      phaseStartedAt: now,
      responseDecisionId: decisionId,
      visibleSignals: buildSignals(campaign.kind, campaign.target, "response"),
      responseDueAt: campaign.responseDueAt ?? addWeeks(now, 2, seasonLength),
    };
    return {
      campaign: advanced,
      message: {
        id: `campaign-response-${campaign.id}-${now.season}-${now.week}`,
        week: now.week,
        season: now.season,
        type: "event",
        title: advanced.visibleSignals[0]?.headline ?? "A rival move needs a response",
        body: advanced.visibleSignals[0]?.detail ?? "A rival move needs a response.",
        read: false,
        actionRequired: true,
        relatedId: campaign.id,
      },
    };
  }
  return { campaign };
}

function buildResolutionProvenance(
  campaign: RivalCampaign,
  resolution: RivalCampaignResolution,
  responseOption: RivalCampaignCounterplayOption,
  date: GameDate,
): RivalCampaignProvenancePacket {
  const campaignRef = campaignEntity(campaign);
  const rivalRef = rivalEntity(campaign.leadRivalId);
  const stakeholder = campaign.target.entity;
  const sourceDecisionId = campaign.responseDecisionId;
  const protectedResult = resolution === "success";
  const rivalMomentumDelta = protectedResult ? -6 : 6;
  const relationshipDelta = protectedResult ? 8 : -10;
  const accessDelta = protectedResult ? 1 : -1;
  const resolutionLabel = protectedResult ? "protected" : "conceded";
  const factId = `fact:${campaign.id}:${date.season}:${date.week}`;
  const memoryId = `memory:${campaign.id}:${stakeholder.kind}:${stakeholder.id}:${date.season}:${date.week}`;
  const obligationId = `obligation:${campaign.id}:${stakeholder.kind}:${stakeholder.id}:${date.season}:${date.week}`;
  const relationshipEffectType = EFFECT_TYPE_BY_TARGET_KIND[campaign.targetKind];

  const facts: WorldFact[] = [{
    id: factId,
    kind: "rivalCampaignResolved",
    subject: campaignRef,
    value: {
      campaignKind: campaign.kind,
      targetKind: campaign.targetKind,
      targetId: campaign.target.entity.id,
      response: responseOption.id,
      resolution,
      success: protectedResult,
    },
    observedAt: date,
    visibility: "stakeholders",
    sourceDecisionId,
    metadata: {
      organizationId: campaign.organizationId,
      rivalId: campaign.leadRivalId,
    },
  }];

  const memories: StakeholderMemory[] = [{
    id: memoryId,
    stakeholder,
    subject: rivalRef,
    tags: [
      "rivalCampaign",
      campaign.kind,
      resolutionLabel,
      responseOption.style,
    ],
    valence: protectedResult ? 18 : -22,
    intensity: protectedResult ? 64 : 78,
    salience: protectedResult ? 56 : 82,
    visibility: "private",
    createdAt: date,
    sourceDecisionId,
    metadata: {
      campaignId: campaign.id,
      targetLabel: campaign.target.label,
      responseOptionId: responseOption.id,
    },
  }];

  const obligations: Obligation[] = responseOption.style === "protect"
    || responseOption.style === "trade"
    ? [{
        id: obligationId,
        debtor: { kind: "scout", id: "player-scout" },
        creditor: stakeholder,
        kind: protectedResult ? "discretionFollowThrough" : "apologyDebt",
        terms: protectedResult
          ? `Honor the protection promised around ${campaign.target.label}.`
          : `Repair the damage caused around ${campaign.target.label}.`,
        status: "active",
        createdAt: date,
        dueAt: addWeeks(date, 6, 38),
        sourceDecisionId: sourceDecisionId ?? campaign.id,
        metadata: {
          campaignId: campaign.id,
          campaignKind: campaign.kind,
          responseOptionId: responseOption.id,
        },
      }]
    : [];

  const operationalEffects: RivalCampaignOperationalEffect[] = [
    {
      type: relationshipEffectType,
      target: stakeholder,
      delta: relationshipDelta,
      note: protectedResult
        ? `${campaign.target.label} is more likely to trust the scout's protection.`
        : `${campaign.target.label} is less likely to trust the scout after the rival campaign.`,
      metadata: {
        campaignId: campaign.id,
        responseOptionId: responseOption.id,
      },
    },
    {
      type: "rivalMomentum",
      target: rivalRef,
      delta: rivalMomentumDelta,
      note: protectedResult
        ? "The rival lost traction in this contest."
        : "The rival gained momentum from the unresolved contest.",
      metadata: {
        campaignId: campaign.id,
        organizationId: campaign.organizationId,
      },
    },
    {
      type: campaign.targetKind === "territory" ? "territoryAccess" : "contactAccess",
      target: stakeholder,
      delta: accessDelta,
      note: protectedResult
        ? `Access around ${campaign.target.label} held.`
        : `Access around ${campaign.target.label} weakened.`,
      metadata: {
        campaignId: campaign.id,
        resolution,
      },
    },
  ];

  return {
    facts,
    memories,
    obligations,
    operationalEffects,
  };
}

function resolveCampaign(
  state: RivalCampaignState,
  campaign: RivalCampaign,
  responseOption: RivalCampaignCounterplayOption,
  date: GameDate,
  resolution: RivalCampaignResolution,
): { state: RivalCampaignState; campaign: RivalCampaign; provenance: RivalCampaignProvenancePacket; message: InboxMessage } {
  const success = resolution === "success"
    || (resolution !== "ignored" && resolution !== "expired"
      && campaign.outcomeRoll < clamp(
        campaign.baseSuccessChance + responseOption.successModifier,
        0.1,
        0.9,
      ));
  const finalResolution: RivalCampaignResolution = resolution === "ignored" || resolution === "expired"
    ? resolution
    : success ? "success" : "failure";
  const resolvedCampaign: RivalCampaign = {
    ...campaign,
    phase: "aftermath",
    status: finalResolution === "expired" ? "expired" : "resolved",
    updatedAt: date,
    phaseStartedAt: date,
    visibleSignals: buildSignals(campaign.kind, campaign.target, "aftermath"),
    result: {
      resolution: finalResolution,
      responseOptionId: responseOption.id,
      success,
      resolvedAt: date,
    },
  };
  const updatedCampaigns = {
    ...state.campaigns,
    [campaign.id]: resolvedCampaign,
  };
  const nextState: RivalCampaignState = {
    ...state,
    campaigns: updatedCampaigns,
    history: historyFor(state.history, updatedCampaigns),
  };
  const provenance = buildResolutionProvenance(
    resolvedCampaign,
    finalResolution,
    responseOption,
    date,
  );
  const message: InboxMessage = {
    id: `campaign-outcome-${campaign.id}-${date.season}-${date.week}`,
    week: date.week,
    season: date.season,
    type: "event",
    title: finalResolution === "success"
      ? "Rival campaign contained"
      : finalResolution === "failure"
        ? "Rival campaign breaks against you"
        : finalResolution === "expired"
          ? "Rival campaign window expired"
          : "Rival campaign ignored",
    body: finalResolution === "success"
      ? `Your response around ${campaign.target.label} held. The rival did not get a clean win.`
      : finalResolution === "failure"
        ? `The rival gained ground around ${campaign.target.label}. The consequences will linger.`
        : finalResolution === "expired"
          ? `The response window around ${campaign.target.label} closed before you acted.`
          : `You let the pressure around ${campaign.target.label} pass. The rival kept the initiative.`,
    read: false,
    actionRequired: false,
    relatedId: campaign.id,
  };
  return { state: nextState, campaign: resolvedCampaign, provenance, message };
}

function expiredOption(campaign: RivalCampaign): RivalCampaignCounterplayOption {
  return campaign.responseOptions.find((option) => option.style === "withdraw")
    ?? campaign.responseOptions[0];
}

export function createRivalCampaignState(
  partial?: RivalCampaignState,
): RivalCampaignState {
  return createState(partial);
}

export function directRivalCampaignWeek(
  input: DirectRivalCampaignWeekInput,
): DirectRivalCampaignWeekResult {
  const {
    rootSeed,
    season,
    week,
    seasonLength,
    organizations,
    rivalScouts,
    directory,
  } = input;
  const maxActive = input.maxActiveCampaigns ?? DEFAULT_MAX_ACTIVE_CAMPAIGNS;
  const maxWeeklySpawns = input.maxWeeklySpawns ?? DEFAULT_MAX_WEEKLY_SPAWNS;
  const spawnChanceMultiplier = input.spawnChanceMultiplier ?? 1;
  const now = { season, week };
  const key = weekKey(season, week);
  let state = createState(input.state);
  if (state.processedWeekKeys.includes(key)) {
    return {
      state,
      changed: false,
      spawned: [],
      advanced: [],
      resolved: [],
      messages: [],
      provenance: [],
    };
  }

  const activeCampaigns = Object.values(state.campaigns).filter(isCampaignActive);
  const messages: InboxMessage[] = [];
  const provenance: RivalCampaignProvenancePacket[] = [];
  const advanced: RivalCampaign[] = [];
  const resolved: RivalCampaign[] = [];

  for (const campaign of Object.values(state.campaigns)) {
    if (!isCampaignActive(campaign)) continue;
    if (
      campaign.phase === "response"
      && campaign.responseDueAt
      && compareDate(now, campaign.responseDueAt) > 0
    ) {
      const result = resolveCampaign(
        state,
        campaign,
        expiredOption(campaign),
        now,
        "expired",
      );
      state = result.state;
      resolved.push(result.campaign);
      provenance.push(result.provenance);
      messages.push(result.message);
      continue;
    }
    const next = advanceCampaign(campaign, now, seasonLength);
    if (next.campaign !== campaign) {
      state = {
        ...state,
        campaigns: {
          ...state.campaigns,
          [campaign.id]: next.campaign,
        },
      };
      advanced.push(next.campaign);
      if (next.message) messages.push(next.message);
    }
  }

  const currentActiveCount = Object.values(state.campaigns).filter(isCampaignActive).length;
  const spawnBudget = Math.max(0, Math.min(maxWeeklySpawns, maxActive - currentActiveCount));
  const spawned: RivalCampaign[] = [];
  if (spawnBudget > 0) {
    const orderedOrganizations = Object.values(organizations)
      .filter((organization) => organization.memberRivalIds.length > 0)
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const organization of orderedOrganizations) {
      if (spawned.length >= spawnBudget) break;
      const hasActive = Object.values(state.campaigns).some((campaign) =>
        campaign.organizationId === organization.id && isCampaignActive(campaign),
      );
      if (hasActive) continue;
      const spawnRng = createNamedRNG(
        rootSeed,
        "rival-campaign-spawn",
        organization.id,
        season,
        week,
      );
      const pressureBoost = input.organizationState?.currentPressure.sourceOrganizationId === organization.id
        ? 0.12
        : 0;
      const chance = clamp((0.34 + pressureBoost) * spawnChanceMultiplier, 0, 0.95);
      if (!spawnRng.chance(chance)) continue;
      const leadRival = chooseLeadRival(rivalScouts, organization, spawnRng);
      if (!leadRival) continue;
      const kind = spawnRng.pickWeighted(
        campaignKindWeights(organization).map((entry) => ({
          item: entry.kind,
          weight: entry.weight,
        })),
      );
      const targets = compatibleTargets(directory, kind);
      if (targets.length === 0) continue;
      const target = spawnRng.pick(targets);
      const campaign = createCampaign({
        rootSeed,
        organization,
        leadRival,
        target,
        kind,
        now,
        seasonLength,
      });
      state = {
        ...state,
        campaigns: {
          ...state.campaigns,
          [campaign.id]: campaign,
        },
      };
      spawned.push(campaign);
      messages.push({
        id: `campaign-signal-${campaign.id}`,
        week,
        season,
        type: "news",
        title: campaign.visibleSignals[0]?.headline ?? "A rival campaign begins",
        body: campaign.visibleSignals[0]?.detail ?? "A rival campaign begins to move quietly.",
        read: false,
        actionRequired: false,
        relatedId: campaign.id,
      });
    }
  }

  state = {
    ...state,
    processedWeekKeys: [...state.processedWeekKeys, key].slice(-MAX_PROCESSED_WEEK_KEYS),
    history: historyFor(state.history, state.campaigns),
  };

  return {
    state,
    changed: spawned.length > 0 || advanced.length > 0 || resolved.length > 0,
    spawned,
    advanced,
    resolved,
    messages,
    provenance,
  };
}

export function resolveRivalCampaignResponse(
  input: ResolveRivalCampaignResponseInput,
): ResolveRivalCampaignResponseResult {
  const { rootSeed, campaignId, responseOptionId, date } = input;
  const state = createState(input.state);
  void rootSeed;
  const campaign = state.campaigns[campaignId];
  if (!campaign) {
    return { state, changed: false, error: `Unknown rival campaign: ${campaignId}` };
  }
  if (campaign.status !== "active" || campaign.phase !== "response") {
    return {
      state,
      changed: false,
      error: `Rival campaign ${campaignId} is not awaiting a response`,
    };
  }
  const responseOption = campaign.responseOptions.find((option) => option.id === responseOptionId);
  if (!responseOption) {
    return {
      state,
      changed: false,
      error: `Unknown rival campaign response: ${responseOptionId}`,
    };
  }
  const result = resolveCampaign(
    state,
    campaign,
    responseOption,
    date,
    input.forcedResolution ?? "failure",
  );
  return {
    state: result.state,
    changed: true,
    campaign: result.campaign,
    message: result.message,
    provenance: result.provenance,
  };
}
