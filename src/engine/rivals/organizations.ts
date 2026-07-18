/**
 * Persistent rival scouting organizations.
 *
 * Individual rival scouts create local competition. Organizations give that
 * competition memory and a long-term direction: they accumulate resources,
 * advance an agenda, create temporary pressure, and expose openings that the
 * player can eventually exploit. Everything in this module is deterministic
 * from the run seed and game date and is safe to persist verbatim.
 */

import type { GameState, InboxMessage, RivalScout } from "@/engine/core/types";
import type { WorldFact } from "@/engine/consequences/types";
import { gameWeeksBetween, isGameDateAtOrAfter } from "@/engine/core/gameDate";
import type { TransferAgreementProposal } from "@/engine/transfers/transferAgreement";
import {
  createDeterministicRunId,
  createNamedRNG,
} from "@/engine/run/runManifest";
import { getEffectiveRivalPlayerEvidence } from "./rivalEvidence";

export type RivalOrganizationArchetypeId =
  | "academy-conglomerate"
  | "analytics-syndicate"
  | "agent-black-book"
  | "club-consortium"
  | "regional-guild"
  | "global-sports-group";

export type RivalOrganizationAgendaId =
  | "control-youth-pathways"
  | "win-information-arbitrage"
  | "monopolize-private-access"
  | "pool-recruitment-power"
  | "protect-regional-territory"
  | "capture-elite-prospects";

export type RivalOrganizationActionKind =
  | "academy-sweep"
  | "showcase-capture"
  | "data-mapping"
  | "model-sale"
  | "access-lockdown"
  | "whisper-campaign"
  | "market-blitz"
  | "resource-pool"
  | "regional-rush"
  | "poach-relay"
  | "prestige-push"
  | "global-trial-network"
  | "regroup";

export type RivalOrganizationOpportunityKind =
  | "counter-scouting-window"
  | "insider-intelligence"
  | "open-showcase"
  | "relationship-defection";

export interface RivalOrganizationPressure {
  discoveryChanceMultiplier: number;
  poachChanceMultiplier: number;
  signingChanceMultiplier: number;
  /** Extra youth scouting progress applied to an organization-backed rival. */
  youthProgressBonus: number;
  sourceOrganizationId?: string;
  sourceAction?: RivalOrganizationActionKind;
}

export type RivalMarketPressureBand =
  | "uncontested"
  | "watched"
  | "contested"
  | "closing";

export type RivalInformationExposureBand =
  | "contained"
  | "circulating"
  | "leaking";

export type FamilyMarketPreference =
  | "unverified"
  | "prefers-stability"
  | "open-to-move"
  | "club-specific";

export interface RivalMarketWatcher {
  rivalId: string;
  rivalName: string;
  clubId: string;
  organizationId?: string;
  scoutingProgress: number;
  evidenceConfidence: number;
  evidenceAgeWeeks?: number;
  urgency: number;
}

export interface FamilyMarketSignal {
  preference: FamilyMarketPreference;
  /** Only a canonical consequence fact can move this away from unverified. */
  sourceFactId?: string;
  explanation: string;
}

/**
 * Player-safe projection of existing rival, information, and stakeholder state.
 * This never decides a transfer and never reads hidden player ability.
 */
export interface RivalMarketPressureSnapshot {
  playerId: string;
  score: number;
  band: RivalMarketPressureBand;
  watchers: RivalMarketWatcher[];
  informationExposure: RivalInformationExposureBand;
  leakSourceIds: string[];
  family: FamilyMarketSignal;
  reasons: string[];
}

export type ScoutMarketCounterplay =
  | "advocate"
  | "verify"
  | "protect"
  | "withdraw";

export type RivalTransferContestAuthority = Pick<
  TransferAgreementProposal,
  "viable" | "affordability" | "registration" | "willingness"
>;

export interface RivalMarketCounterplayAssessment {
  response: ScoutMarketCounterplay;
  /** Bounded input for rival scouting pressure; it is not a transfer probability. */
  rivalPressureMultiplier: number;
  scoutInfluence: number;
  fatigueCost: number;
  reputationExposure: number;
  visibilityDelta: number;
  transferAuthorityStatus: "unassessed" | "blocked" | "live";
  knownTradeoffs: string[];
  constraints: string[];
}

interface OrganizationActionDefinition {
  kind: Exclude<RivalOrganizationActionKind, "regroup">;
  label: string;
  summary: string;
  weight: number;
  resourceCost: number;
  heatDelta: number;
  influenceDelta: number;
  agendaProgress: number;
  pressure: Omit<
    RivalOrganizationPressure,
    "sourceOrganizationId" | "sourceAction"
  >;
  opportunityKind: RivalOrganizationOpportunityKind;
  opportunityChance: number;
}

export interface RivalOrganizationDefinition {
  id: RivalOrganizationArchetypeId;
  name: string;
  description: string;
  agendaId: RivalOrganizationAgendaId;
  agendaName: string;
  agendaDescription: string;
  nameVariants: readonly string[];
  startingResources: number;
  startingInfluence: number;
  startingHeat: number;
  actions: readonly OrganizationActionDefinition[];
}

export interface RivalOrganization {
  id: string;
  archetypeId: RivalOrganizationArchetypeId;
  name: string;
  agendaId: RivalOrganizationAgendaId;
  memberRivalIds: string[];
  resources: number;
  influence: number;
  heat: number;
  /** Progress within the current agenda level, 0-99 (100 at the cap). */
  agendaProgress: number;
  /** Persistent escalation level, 1-10. */
  agendaLevel: number;
  /** Recent success/failure direction, -10 to 10. */
  momentum: number;
  foundedSeason: number;
  lastAction?: RivalOrganizationActionKind;
  lastActionSeason?: number;
  lastActionWeek?: number;
}

export interface RivalOrganizationActivity {
  id: string;
  organizationId: string;
  action: RivalOrganizationActionKind;
  label: string;
  summary: string;
  season: number;
  week: number;
  relatedRivalIds: string[];
  relatedPlayerId?: string;
  resourceDelta: number;
  influenceDelta: number;
  heatDelta: number;
  agendaProgressDelta: number;
  resultingAgendaLevel: number;
  pressure: RivalOrganizationPressure;
}

export type RivalOrganizationOpportunityStatus =
  | "open"
  | "exploited"
  | "declined"
  | "expired";

export interface RivalOrganizationOpportunity {
  id: string;
  organizationId: string;
  kind: RivalOrganizationOpportunityKind;
  title: string;
  description: string;
  status: RivalOrganizationOpportunityStatus;
  createdSeason: number;
  createdWeek: number;
  expiresSeason: number;
  expiresWeek: number;
  relatedPlayerId?: string;
  /** Persisted before the player responds, preventing save/reload rerolls. */
  outcomeRoll: number;
  successChance: number;
  /** Honest, player-facing costs known before acting. */
  knownTradeoffs: string[];
  resolvedSeason?: number;
  resolvedWeek?: number;
  resolution?: "success" | "failure" | "declined" | "expired";
}

export interface RivalOrganizationState {
  organizations: Record<string, RivalOrganization>;
  activities: RivalOrganizationActivity[];
  opportunities: Record<string, RivalOrganizationOpportunity>;
  currentPressure: RivalOrganizationPressure;
  /** Bounded idempotency ledger for manual/batch-equivalent advancement. */
  processedWeekKeys: string[];
}

export interface InitializeRivalOrganizationsResult {
  state: RivalOrganizationState;
  assignments: Record<string, string>;
}

export interface ProcessRivalOrganizationWeekInput {
  rootSeed: string;
  season: number;
  week: number;
  seasonLength: number;
  rivalScouts: Readonly<Record<string, RivalScout>>;
  /** Primarily useful for deterministic simulations and balance tests. */
  opportunityChanceMultiplier?: number;
}

export interface ProcessRivalOrganizationWeekResult {
  state: RivalOrganizationState;
  pressure: RivalOrganizationPressure;
  activity?: RivalOrganizationActivity;
  opportunity?: RivalOrganizationOpportunity;
  facts: WorldFact[];
  messages: InboxMessage[];
  changed: boolean;
}

export interface ResolveRivalOrganizationOpportunityResult {
  state: RivalOrganizationState;
  changed: boolean;
  success?: boolean;
  reputationDelta: number;
  fatigueDelta: number;
  fact?: WorldFact;
  message?: InboxMessage;
  error?: string;
}

const NEUTRAL_PRESSURE: RivalOrganizationPressure = {
  discoveryChanceMultiplier: 1,
  poachChanceMultiplier: 1,
  signingChanceMultiplier: 1,
  youthProgressBonus: 0,
};

const MAX_ACTIVITY_HISTORY = 120;
const MAX_OPPORTUNITY_HISTORY = 40;
const MAX_PROCESSED_WEEK_KEYS = 120;
const ACTIVE_ORGANIZATION_COUNT = 3;

export const RIVAL_ORGANIZATION_DEFINITIONS: readonly RivalOrganizationDefinition[] = [
  {
    id: "academy-conglomerate",
    name: "Academy Conglomerate",
    description: "A network of academy directors that tries to control access before prospects reach the open market.",
    agendaId: "control-youth-pathways",
    agendaName: "Control Youth Pathways",
    agendaDescription: "Own the earliest credible information and funnel elite youth through member academies.",
    nameVariants: ["Northstar Academy Circuit", "The Foundry Network", "Future XI Alliance"],
    startingResources: 62,
    startingInfluence: 48,
    startingHeat: 24,
    actions: [
      {
        kind: "academy-sweep",
        label: "Academy Sweep",
        summary: "Member scouts flood local youth fixtures before public buzz can settle.",
        weight: 3,
        resourceCost: 8,
        heatDelta: 7,
        influenceDelta: 2,
        agendaProgress: 12,
        pressure: { discoveryChanceMultiplier: 1.22, poachChanceMultiplier: 1.08, signingChanceMultiplier: 1.08, youthProgressBonus: 1 },
        opportunityKind: "counter-scouting-window",
        opportunityChance: 0.32,
      },
      {
        kind: "showcase-capture",
        label: "Showcase Capture",
        summary: "The network turns a public youth showcase into a controlled recruitment funnel.",
        weight: 2,
        resourceCost: 11,
        heatDelta: 10,
        influenceDelta: 3,
        agendaProgress: 15,
        pressure: { discoveryChanceMultiplier: 1.12, poachChanceMultiplier: 1.18, signingChanceMultiplier: 1.14, youthProgressBonus: 1 },
        opportunityKind: "open-showcase",
        opportunityChance: 0.5,
      },
    ],
  },
  {
    id: "analytics-syndicate",
    name: "Analytics Syndicate",
    description: "A data-led recruitment collective that maps undervalued leagues and sells certainty to wealthy clients.",
    agendaId: "win-information-arbitrage",
    agendaName: "Win Information Arbitrage",
    agendaDescription: "Identify price and ability gaps before traditional networks can react.",
    nameVariants: ["Meridian Metrics", "ElevenSignal", "The Parallax Model"],
    startingResources: 55,
    startingInfluence: 38,
    startingHeat: 12,
    actions: [
      {
        kind: "data-mapping",
        label: "Data Mapping",
        summary: "The syndicate maps a neglected competition and expands its target list.",
        weight: 4,
        resourceCost: 6,
        heatDelta: 3,
        influenceDelta: 2,
        agendaProgress: 11,
        pressure: { discoveryChanceMultiplier: 1.28, poachChanceMultiplier: 1.04, signingChanceMultiplier: 1.02, youthProgressBonus: 0 },
        opportunityKind: "insider-intelligence",
        opportunityChance: 0.38,
      },
      {
        kind: "model-sale",
        label: "Model Sale",
        summary: "A member club buys an exclusive shortlist and accelerates its next recruitment decision.",
        weight: 2,
        resourceCost: 4,
        heatDelta: 5,
        influenceDelta: 4,
        agendaProgress: 9,
        pressure: { discoveryChanceMultiplier: 1.08, poachChanceMultiplier: 1.08, signingChanceMultiplier: 1.2, youthProgressBonus: 0 },
        opportunityKind: "insider-intelligence",
        opportunityChance: 0.28,
      },
    ],
  },
  {
    id: "agent-black-book",
    name: "Agent Black Book",
    description: "An opaque web of intermediaries that trades introductions, private promises, and selective access.",
    agendaId: "monopolize-private-access",
    agendaName: "Monopolize Private Access",
    agendaDescription: "Make every important recruitment conversation pass through the network.",
    nameVariants: ["The Black Book", "Concord Player Network", "Velvet Rope Football"],
    startingResources: 48,
    startingInfluence: 64,
    startingHeat: 35,
    actions: [
      {
        kind: "access-lockdown",
        label: "Access Lockdown",
        summary: "The network closes private doors around a contested group of prospects.",
        weight: 3,
        resourceCost: 7,
        heatDelta: 8,
        influenceDelta: 3,
        agendaProgress: 13,
        pressure: { discoveryChanceMultiplier: 1.03, poachChanceMultiplier: 1.3, signingChanceMultiplier: 1.12, youthProgressBonus: 0 },
        opportunityKind: "relationship-defection",
        opportunityChance: 0.4,
      },
      {
        kind: "whisper-campaign",
        label: "Whisper Campaign",
        summary: "Selective leaks create urgency around targets the network is ready to move on.",
        weight: 2,
        resourceCost: 5,
        heatDelta: 11,
        influenceDelta: 1,
        agendaProgress: 10,
        pressure: { discoveryChanceMultiplier: 1.05, poachChanceMultiplier: 1.22, signingChanceMultiplier: 1.18, youthProgressBonus: 0 },
        opportunityKind: "insider-intelligence",
        opportunityChance: 0.34,
      },
    ],
  },
  {
    id: "club-consortium",
    name: "Club Consortium",
    description: "Several clubs pool scouts and budgets to compete above their individual financial weight.",
    agendaId: "pool-recruitment-power",
    agendaName: "Pool Recruitment Power",
    agendaDescription: "Share cost and intelligence so member clubs can overwhelm isolated recruitment teams.",
    nameVariants: ["Union Recruitment Group", "The Cooperative Desk", "Five Flags Consortium"],
    startingResources: 72,
    startingInfluence: 44,
    startingHeat: 20,
    actions: [
      {
        kind: "market-blitz",
        label: "Market Blitz",
        summary: "Pooled budgets let several member clubs move at once on a crowded shortlist.",
        weight: 3,
        resourceCost: 14,
        heatDelta: 9,
        influenceDelta: 3,
        agendaProgress: 14,
        pressure: { discoveryChanceMultiplier: 1.08, poachChanceMultiplier: 1.16, signingChanceMultiplier: 1.3, youthProgressBonus: 0 },
        opportunityKind: "counter-scouting-window",
        opportunityChance: 0.3,
      },
      {
        kind: "resource-pool",
        label: "Resource Pool",
        summary: "Members consolidate travel, video, and contact budgets for the next campaign.",
        weight: 2,
        resourceCost: 2,
        heatDelta: -3,
        influenceDelta: 2,
        agendaProgress: 8,
        pressure: { discoveryChanceMultiplier: 1.12, poachChanceMultiplier: 1.04, signingChanceMultiplier: 1.08, youthProgressBonus: 0 },
        opportunityKind: "relationship-defection",
        opportunityChance: 0.2,
      },
    ],
  },
  {
    id: "regional-guild",
    name: "Regional Scout Guild",
    description: "Veteran local scouts defend a territory through deep relationships and coordinated referrals.",
    agendaId: "protect-regional-territory",
    agendaName: "Protect Regional Territory",
    agendaDescription: "Keep outside scouts dependent on guild knowledge and introductions.",
    nameVariants: ["Old Roads Guild", "Terrace Scout Union", "Provincial Eyes"],
    startingResources: 42,
    startingInfluence: 57,
    startingHeat: 16,
    actions: [
      {
        kind: "regional-rush",
        label: "Regional Rush",
        summary: "Guild members descend on a local circuit after one trusted referral.",
        weight: 3,
        resourceCost: 6,
        heatDelta: 5,
        influenceDelta: 3,
        agendaProgress: 12,
        pressure: { discoveryChanceMultiplier: 1.18, poachChanceMultiplier: 1.12, signingChanceMultiplier: 1.04, youthProgressBonus: 1 },
        opportunityKind: "open-showcase",
        opportunityChance: 0.36,
      },
      {
        kind: "poach-relay",
        label: "Poach Relay",
        summary: "One scout's sighting moves instantly through the guild to a better-positioned member club.",
        weight: 2,
        resourceCost: 8,
        heatDelta: 7,
        influenceDelta: 2,
        agendaProgress: 11,
        pressure: { discoveryChanceMultiplier: 1.1, poachChanceMultiplier: 1.24, signingChanceMultiplier: 1.1, youthProgressBonus: 0 },
        opportunityKind: "relationship-defection",
        opportunityChance: 0.32,
      },
    ],
  },
  {
    id: "global-sports-group",
    name: "Global Sports Group",
    description: "A prestige recruitment machine with international offices, wealthy clients, and a taste for visible wins.",
    agendaId: "capture-elite-prospects",
    agendaName: "Capture Elite Prospects",
    agendaDescription: "Turn global reach and prestige into ownership of each market's defining prospect.",
    nameVariants: ["Crown Global Football", "Atlas Sports Group", "Imperial Recruitment"],
    startingResources: 82,
    startingInfluence: 70,
    startingHeat: 42,
    actions: [
      {
        kind: "prestige-push",
        label: "Prestige Push",
        summary: "Senior figures personally court the most visible targets and decision-makers.",
        weight: 3,
        resourceCost: 16,
        heatDelta: 12,
        influenceDelta: 4,
        agendaProgress: 16,
        pressure: { discoveryChanceMultiplier: 1.08, poachChanceMultiplier: 1.22, signingChanceMultiplier: 1.34, youthProgressBonus: 0 },
        opportunityKind: "counter-scouting-window",
        opportunityChance: 0.42,
      },
      {
        kind: "global-trial-network",
        label: "Global Trial Network",
        summary: "The group links showcase events across borders and rapidly broadens its reach.",
        weight: 2,
        resourceCost: 12,
        heatDelta: 8,
        influenceDelta: 3,
        agendaProgress: 13,
        pressure: { discoveryChanceMultiplier: 1.25, poachChanceMultiplier: 1.08, signingChanceMultiplier: 1.15, youthProgressBonus: 1 },
        opportunityKind: "open-showcase",
        opportunityChance: 0.46,
      },
    ],
  },
] as const;

const DEFINITIONS_BY_ID = new Map(
  RIVAL_ORGANIZATION_DEFINITIONS.map((definition) => [definition.id, definition]),
);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}

function gameDateKey(season: number, week: number): string {
  return `s${season}w${week}`;
}

function compareDate(
  left: { season: number; week: number },
  right: { season: number; week: number },
): number {
  return left.season - right.season || left.week - right.week;
}

function addWeeks(
  season: number,
  week: number,
  amount: number,
  seasonLength: number,
): { season: number; week: number } {
  let nextSeason = season;
  let nextWeek = week;
  for (let elapsed = 0; elapsed < amount; elapsed++) {
    nextWeek += 1;
    if (nextWeek > seasonLength) {
      nextSeason += 1;
      nextWeek = 1;
    }
  }
  return { season: nextSeason, week: nextWeek };
}

function familyPreferenceFromValue(value: unknown): FamilyMarketPreference | undefined {
  const raw = typeof value === "string"
    ? value
    : value && typeof value === "object" && !Array.isArray(value)
      ? (value as { preference?: unknown }).preference
      : undefined;
  switch (raw) {
    case "prefers-stability":
    case "open-to-move":
    case "club-specific":
      return raw;
    default:
      return undefined;
  }
}

function deriveFamilyMarketSignal(state: GameState, playerId: string): FamilyMarketSignal {
  const fact = Object.values(state.consequenceState?.facts ?? {})
    .filter((candidate) =>
      (candidate.kind === "FamilyMarketPreferenceRecorded"
        || candidate.kind === "familyMarketPreference")
      && candidate.subject?.kind === "player"
      && candidate.subject.id === playerId
      && familyPreferenceFromValue(candidate.value) !== undefined
    )
    .sort((left, right) =>
      right.observedAt.season - left.observedAt.season
      || right.observedAt.week - left.observedAt.week
      || right.id.localeCompare(left.id)
    )[0];
  const preference = fact ? familyPreferenceFromValue(fact.value) : undefined;
  if (!fact || !preference) {
    return {
      preference: "unverified",
      explanation: "No recorded family preference exists; market pressure must not be mistaken for consent.",
    };
  }
  const explanation: Record<FamilyMarketPreference, string> = {
    unverified: "No recorded family preference exists; market pressure must not be mistaken for consent.",
    "prefers-stability": "A recorded family conversation prioritizes continuity and stability.",
    "open-to-move": "A recorded family conversation confirms openness to a suitable move.",
    "club-specific": "A recorded family conversation limits interest to a specific pathway or club.",
  };
  return {
    preference,
    sourceFactId: fact.id,
    explanation: explanation[preference],
  };
}

function pressureBand(score: number): RivalMarketPressureBand {
  if (score >= 70) return "closing";
  if (score >= 45) return "contested";
  if (score >= 20) return "watched";
  return "uncontested";
}

/**
 * Project visible rival-market pressure for one player. Rival estimates are
 * already noisy and decay through rivalEvidence; no hidden CA/PA is read here.
 */
export function deriveRivalMarketPressure(
  state: GameState,
  playerId: string,
): RivalMarketPressureSnapshot {
  const now = { season: state.currentSeason, week: state.currentWeek };
  const watchers = Object.values(state.rivalScouts ?? {})
    .filter((rival) =>
      rival.currentTarget === playerId
      || rival.targetPlayerIds.includes(playerId)
      || (rival.scoutingProgress?.[playerId] ?? 0) > 0
    )
    .map((rival): RivalMarketWatcher => {
      const evidence = getEffectiveRivalPlayerEvidence(rival, playerId, state);
      const progress = clamp(rival.scoutingProgress?.[playerId] ?? 0, 0, 5);
      const urgency = Math.round(clamp(
        progress * 10
          + rival.quality * 5
          + clamp(rival.aggressiveness, 0, 1) * 16
          + (evidence?.confidence ?? 0) * 18
          + (rival.currentTarget === playerId ? 8 : 0)
          + (rival.competingForPlayers.includes(playerId) ? 6 : 0),
        0,
        100,
      ));
      return {
        rivalId: rival.id,
        rivalName: rival.name,
        clubId: rival.clubId,
        organizationId: getOrganizationForRival(
          state.rivalOrganizationState ?? createRivalOrganizationState(),
          rival.id,
        )?.id,
        scoutingProgress: progress,
        evidenceConfidence: roundHundredth(evidence?.confidence ?? 0),
        evidenceAgeWeeks: evidence?.ageWeeks,
        urgency,
      };
    })
    .sort((left, right) => right.urgency - left.urgency
      || left.rivalId.localeCompare(right.rivalId));

  const recentOrganizationLeaks = (state.rivalOrganizationState?.activities ?? [])
    .filter((activity) => {
      const age = gameWeeksBetween(state.fixtures, {
        season: activity.season,
        week: activity.week,
      }, now);
      return age >= 0
        && age <= 4
        && activity.action === "whisper-campaign"
        && activity.relatedPlayerId === playerId;
    })
    .map((activity) => activity.id);
  const gossipLeaks = Object.values(state.contacts ?? {}).flatMap((contact) =>
    (contact.gossipQueue ?? [])
      .filter((gossip) =>
        !gossip.dismissed
        && gossip.playerId === playerId
        && (gossip.type === "transferRumor" || gossip.type === "youthProspect")
        && isGameDateAtOrAfter(gossip.expiresAt, now)
      )
      .map((gossip) => `gossip:${contact.id}:${gossip.id}`)
  );
  const leakSourceIds = [...new Set([
    ...recentOrganizationLeaks,
    ...gossipLeaks,
  ])].sort();
  const youth = Object.values(state.unsignedYouth ?? {}).find((candidate) =>
    candidate.id === playerId || candidate.player.id === playerId
  );
  const publicExposure = Boolean(
    youth
    && (youth.buzzLevel >= 45 || youth.discoveredBy.length >= 2),
  );
  const informationExposure: RivalInformationExposureBand = leakSourceIds.length > 0
    ? "leaking"
    : watchers.length > 0 || publicExposure
      ? "circulating"
      : "contained";
  const strongestUrgency = watchers[0]?.urgency ?? 0;
  const activeOrganizationId = state.rivalOrganizationState?.currentPressure?.sourceOrganizationId;
  const hasOrganizationBackedWatcher = Boolean(
    activeOrganizationId
    && watchers.some((watcher) => watcher.organizationId === activeOrganizationId),
  );
  const organizationMultiplier = hasOrganizationBackedWatcher
    ? Math.max(
      1,
      state.rivalOrganizationState?.currentPressure?.signingChanceMultiplier ?? 1,
      state.rivalOrganizationState?.currentPressure?.poachChanceMultiplier ?? 1,
    )
    : 1;
  const score = Math.round(clamp(
    strongestUrgency
      + Math.max(0, watchers.length - 1) * 9
      + (organizationMultiplier - 1) * 35
      + (informationExposure === "leaking" ? 8 : informationExposure === "circulating" ? 3 : 0),
    0,
    100,
  ));
  const reasons = [
    ...(watchers.length > 0
      ? [`${watchers.length} rival scout${watchers.length === 1 ? " is" : "s are"} actively tracking the player.`]
      : ["No rival is currently recorded as tracking the player."]),
    ...(leakSourceIds.length > 0
      ? ["A live rumor or organization leak is widening access to the name."]
      : []),
    ...(organizationMultiplier > 1.05
      ? ["An organization-backed rival action is accelerating market pressure."]
      : []),
  ];

  return {
    playerId,
    score,
    band: pressureBand(score),
    watchers,
    informationExposure,
    leakSourceIds,
    family: deriveFamilyMarketSignal(state, playerId),
    reasons,
  };
}

/**
 * Translate a scout response into bounded rival pressure. The canonical
 * transfer proposal remains the sole authority for affordability,
 * registration, willingness, and whether a deal is viable.
 */
export function assessRivalMarketCounterplay(input: {
  pressure: RivalMarketPressureSnapshot;
  response: ScoutMarketCounterplay;
  transfer?: RivalTransferContestAuthority;
}): RivalMarketCounterplayAssessment {
  const leaking = input.pressure.informationExposure === "leaking";
  const familyPrefersStability = input.pressure.family.preference === "prefers-stability";
  const base = {
    advocate: {
      multiplier: familyPrefersStability ? 0.94 : leaking ? 0.92 : 0.88,
      influence: 12,
      fatigue: 4,
      reputation: 5,
      visibility: 8,
      tradeoffs: [
        "Makes your recommendation harder for clubs to ignore",
        "Raises visibility and puts your reputation behind the call",
      ],
    },
    verify: {
      multiplier: 1,
      influence: 3,
      fatigue: 3,
      reputation: 0,
      visibility: 0,
      tradeoffs: [
        "Improves the next decision without pretending the market will wait",
        "Rivals keep building their own case while you verify",
      ],
    },
    protect: {
      multiplier: leaking ? 0.97 : 0.92,
      influence: 5,
      fatigue: 2,
      reputation: 1,
      visibility: -4,
      tradeoffs: [
        "Limits avoidable exposure around the player and source",
        "A quieter route gives rivals more time to build direct access",
      ],
    },
    withdraw: {
      multiplier: 1.08,
      influence: -8,
      fatigue: 0,
      reputation: 0,
      visibility: -3,
      tradeoffs: [
        "Ends further personal exposure on a case you no longer support",
        "Rival momentum continues without your advocacy",
      ],
    },
  } as const;
  const selected = base[input.response];
  const constraints: string[] = [];
  let transferAuthorityStatus: RivalMarketCounterplayAssessment["transferAuthorityStatus"] = "unassessed";
  if (input.transfer) {
    const affordable = input.transfer.affordability.result.affordable;
    const registered = input.transfer.registration.eligible;
    const willing = input.transfer.willingness.willingToJoin;
    transferAuthorityStatus = input.transfer.viable && affordable && registered && willing
      ? "live"
      : "blocked";
    if (!affordable) constraints.push(...input.transfer.affordability.reasons.slice(0, 2));
    if (!registered) constraints.push(...input.transfer.registration.reasons.slice(0, 2));
    if (!willing) {
      constraints.push(...input.transfer.willingness.reasons.slice(0, 2));
    }
  }
  if (input.pressure.family.preference === "unverified") {
    constraints.push(input.pressure.family.explanation);
  }

  return {
    response: input.response,
    rivalPressureMultiplier: roundHundredth(clamp(selected.multiplier, 0.75, 1.2)),
    scoutInfluence: selected.influence,
    fatigueCost: selected.fatigue,
    reputationExposure: selected.reputation,
    visibilityDelta: selected.visibility,
    transferAuthorityStatus,
    knownTradeoffs: [...selected.tradeoffs],
    constraints: [...new Set(constraints)],
  };
}

export function createRivalOrganizationState(
  partial: Partial<RivalOrganizationState> = {},
): RivalOrganizationState {
  return {
    organizations: { ...(partial.organizations ?? {}) },
    activities: [...(partial.activities ?? [])].slice(-MAX_ACTIVITY_HISTORY),
    opportunities: { ...(partial.opportunities ?? {}) },
    currentPressure: {
      ...NEUTRAL_PRESSURE,
      ...(partial.currentPressure ?? {}),
    },
    processedWeekKeys: [...(partial.processedWeekKeys ?? [])].slice(
      -MAX_PROCESSED_WEEK_KEYS,
    ),
  };
}

export function getRivalOrganizationDefinition(
  archetypeId: RivalOrganizationArchetypeId,
): RivalOrganizationDefinition {
  const definition = DEFINITIONS_BY_ID.get(archetypeId);
  if (!definition) throw new Error(`Unknown rival organization archetype: ${archetypeId}`);
  return definition;
}

/** Content IDs participate in the run fingerprint so catalog changes are visible. */
export function getRivalOrganizationContentDefinitionIds(): string[] {
  return RIVAL_ORGANIZATION_DEFINITIONS.flatMap((definition) => [
    `rival-organization:${definition.id}`,
    ...definition.actions.map(
      (action) => `rival-organization-action:${definition.id}:${action.kind}`,
    ),
  ]).sort();
}

/**
 * Select three distinct organizations and assign every rival exactly once.
 * Assignment depends only on run identity and sorted rival IDs, not object
 * insertion order.
 */
export function initializeRivalOrganizations(
  rootSeed: string,
  rivalScouts: Readonly<Record<string, RivalScout>>,
  foundedSeason = 1,
): InitializeRivalOrganizationsResult {
  const rng = createNamedRNG(rootSeed, "rival-organizations", "initialization");
  const selected = rng
    .shuffle(RIVAL_ORGANIZATION_DEFINITIONS)
    .slice(0, ACTIVE_ORGANIZATION_COUNT);
  const rivalIds = Object.keys(rivalScouts).sort();
  const organizations: Record<string, RivalOrganization> = {};
  const assignments: Record<string, string> = {};

  for (let index = 0; index < selected.length; index++) {
    const definition = selected[index];
    const id = createDeterministicRunId(
      "rival_org",
      rootSeed,
      definition.id,
      index,
    );
    const nameRng = createNamedRNG(rootSeed, "rival-organization-name", definition.id);
    organizations[id] = {
      id,
      archetypeId: definition.id,
      name: nameRng.pick(definition.nameVariants),
      agendaId: definition.agendaId,
      memberRivalIds: [],
      resources: definition.startingResources,
      influence: definition.startingInfluence,
      heat: definition.startingHeat,
      agendaProgress: 0,
      agendaLevel: 1,
      momentum: 0,
      foundedSeason,
    };
  }

  const organizationIds = Object.keys(organizations).sort();
  const assignmentRng = createNamedRNG(rootSeed, "rival-organizations", "assignment");
  const assignmentOrder = assignmentRng.shuffle(organizationIds);
  for (let index = 0; index < rivalIds.length; index++) {
    const rivalId = rivalIds[index];
    const organizationId = assignmentOrder[index % assignmentOrder.length];
    assignments[rivalId] = organizationId;
    organizations[organizationId] = {
      ...organizations[organizationId],
      memberRivalIds: [
        ...organizations[organizationId].memberRivalIds,
        rivalId,
      ],
    };
  }

  return {
    state: createRivalOrganizationState({ organizations }),
    assignments,
  };
}

/**
 * Normalize a save. Truly legacy saves receive the same organizations they
 * would have received at run start; existing organization history is retained.
 */
export function migrateRivalOrganizationState(
  rootSeed: string,
  rivalScouts: Readonly<Record<string, RivalScout>>,
  partial: Partial<RivalOrganizationState> | undefined,
  foundedSeason = 1,
): RivalOrganizationState {
  if (!partial || Object.keys(partial.organizations ?? {}).length === 0) {
    return initializeRivalOrganizations(
      rootSeed,
      rivalScouts,
      foundedSeason,
    ).state;
  }
  return createRivalOrganizationState(partial);
}

export function getOrganizationForRival(
  state: RivalOrganizationState,
  rivalId: string,
): RivalOrganization | undefined {
  return Object.values(state.organizations).find((organization) =>
    organization.memberRivalIds.includes(rivalId),
  );
}

function pickRelatedPlayerId(
  organization: RivalOrganization,
  rivalScouts: Readonly<Record<string, RivalScout>>,
): string | undefined {
  for (const rivalId of [...organization.memberRivalIds].sort()) {
    const rival = rivalScouts[rivalId];
    if (!rival) continue;
    const candidate = rival.currentTarget ?? [...rival.targetPlayerIds].sort()[0];
    if (candidate) return candidate;
  }
  return undefined;
}

function makeOpportunity(
  rootSeed: string,
  organization: RivalOrganization,
  kind: RivalOrganizationOpportunityKind,
  season: number,
  week: number,
  seasonLength: number,
  relatedPlayerId?: string,
): RivalOrganizationOpportunity {
  const expires = addWeeks(season, week, 2, seasonLength);
  const copy: Record<
    RivalOrganizationOpportunityKind,
    Pick<RivalOrganizationOpportunity, "title" | "description" | "knownTradeoffs">
  > = {
    "counter-scouting-window": {
      title: "Counter-Scouting Window",
      description: `${organization.name} has overextended. Focused work now could reveal or disrupt its priority target.`,
      knownTradeoffs: ["Requires attention this fortnight", "Acting openly may increase rivalry heat"],
    },
    "insider-intelligence": {
      title: "Rival Intelligence Available",
      description: `A fragment of ${organization.name}'s recruitment picture has become available through the football network.`,
      knownTradeoffs: ["Information may be incomplete", "Using it can create an obligation to the source"],
    },
    "open-showcase": {
      title: "Showcase Access Opened",
      description: `${organization.name}'s activity has made a normally closed showcase visible to outside scouts.`,
      knownTradeoffs: ["Travel or scheduling time will be required", "Rivals will also attend"],
    },
    "relationship-defection": {
      title: "A Rival Contact Is Listening",
      description: `A contact inside ${organization.name}'s orbit is frustrated and willing to hear another perspective.`,
      knownTradeoffs: ["The approach can fail", "Success damages the rival but creates a sensitive relationship"],
    },
  };
  const outcomeRng = createNamedRNG(
    rootSeed,
    "rival-organization-opportunity-outcome",
    organization.id,
    kind,
    season,
    week,
  );
  const successChance: Record<RivalOrganizationOpportunityKind, number> = {
    "counter-scouting-window": 0.68,
    "insider-intelligence": 0.58,
    "open-showcase": 0.76,
    "relationship-defection": 0.52,
  };
  return {
    id: createDeterministicRunId(
      "rival_opportunity",
      rootSeed,
      organization.id,
      kind,
      season,
      week,
    ),
    organizationId: organization.id,
    kind,
    ...copy[kind],
    status: "open",
    createdSeason: season,
    createdWeek: week,
    expiresSeason: expires.season,
    expiresWeek: expires.week,
    relatedPlayerId,
    outcomeRoll: outcomeRng.next(),
    successChance: successChance[kind],
  };
}

function pruneOpportunities(
  opportunities: Record<string, RivalOrganizationOpportunity>,
): Record<string, RivalOrganizationOpportunity> {
  const retained = Object.values(opportunities)
    .sort((left, right) =>
      right.createdSeason - left.createdSeason
      || right.createdWeek - left.createdWeek
      || left.id.localeCompare(right.id),
    )
    .slice(0, MAX_OPPORTUNITY_HISTORY);
  return Object.fromEntries(retained.map((opportunity) => [opportunity.id, opportunity]));
}

function expireOpportunities(
  opportunities: Record<string, RivalOrganizationOpportunity>,
  season: number,
  week: number,
): Record<string, RivalOrganizationOpportunity> {
  return Object.fromEntries(Object.values(opportunities).map((opportunity) => {
    if (
      opportunity.status === "open"
      && compareDate(
        { season, week },
        { season: opportunity.expiresSeason, week: opportunity.expiresWeek },
      ) > 0
    ) {
      return [opportunity.id, { ...opportunity, status: "expired" as const }];
    }
    return [opportunity.id, opportunity];
  }));
}

function opportunityMessage(
  opportunity: RivalOrganizationOpportunity,
  organization: RivalOrganization,
): InboxMessage {
  return {
    id: `rival-organization-opportunity-${opportunity.id}`,
    week: opportunity.createdWeek,
    season: opportunity.createdSeason,
    type: "news",
    title: opportunity.title,
    body: `${opportunity.description}\n\nWindow closes in Season ${opportunity.expiresSeason}, Week ${opportunity.expiresWeek}.`,
    read: false,
    actionRequired: true,
    relatedId: opportunity.id,
  };
}

interface ExploitOutcome {
  fatigue: number;
  successReputation: number;
  failureReputation: number;
  successAgendaDelta: number;
  successInfluenceDelta: number;
  successResourceDelta: number;
  successHeatDelta: number;
  failureAgendaDelta: number;
  failureInfluenceDelta: number;
  failureResourceDelta: number;
  failureHeatDelta: number;
}

const EXPLOIT_OUTCOMES: Record<RivalOrganizationOpportunityKind, ExploitOutcome> = {
  "counter-scouting-window": {
    fatigue: 4,
    successReputation: 2,
    failureReputation: -1,
    successAgendaDelta: -14,
    successInfluenceDelta: -3,
    successResourceDelta: 0,
    successHeatDelta: 8,
    failureAgendaDelta: 4,
    failureInfluenceDelta: 2,
    failureResourceDelta: 0,
    failureHeatDelta: 5,
  },
  "insider-intelligence": {
    fatigue: 3,
    successReputation: 2,
    failureReputation: -2,
    successAgendaDelta: -8,
    successInfluenceDelta: -2,
    successResourceDelta: -8,
    successHeatDelta: 10,
    failureAgendaDelta: 3,
    failureInfluenceDelta: 2,
    failureResourceDelta: 3,
    failureHeatDelta: 6,
  },
  "open-showcase": {
    fatigue: 5,
    successReputation: 1,
    failureReputation: 0,
    successAgendaDelta: -6,
    successInfluenceDelta: -2,
    successResourceDelta: -4,
    successHeatDelta: 6,
    failureAgendaDelta: 4,
    failureInfluenceDelta: 1,
    failureResourceDelta: 0,
    failureHeatDelta: 3,
  },
  "relationship-defection": {
    fatigue: 3,
    successReputation: 3,
    failureReputation: -2,
    successAgendaDelta: -10,
    successInfluenceDelta: -10,
    successResourceDelta: 0,
    successHeatDelta: 12,
    failureAgendaDelta: 5,
    failureInfluenceDelta: 3,
    failureResourceDelta: 0,
    failureHeatDelta: 8,
  },
};

/**
 * Make an organization opening a real, precommitted choice. Exploiting it
 * costs fatigue and can fail; declining safely allows the rival agenda to gain
 * ground. Terminal opportunities cannot be resolved twice.
 */
export function resolveRivalOrganizationOpportunity(
  previousState: RivalOrganizationState,
  opportunityId: string,
  response: "exploit" | "decline",
  date: { season: number; week: number },
): ResolveRivalOrganizationOpportunityResult {
  const state = createRivalOrganizationState(previousState);
  const opportunity = state.opportunities[opportunityId];
  if (!opportunity) {
    return {
      state,
      changed: false,
      reputationDelta: 0,
      fatigueDelta: 0,
      error: `Unknown rival organization opportunity: ${opportunityId}`,
    };
  }
  if (opportunity.status !== "open") {
    return {
      state,
      changed: false,
      reputationDelta: 0,
      fatigueDelta: 0,
      error: `Opportunity ${opportunityId} is already ${opportunity.status}`,
    };
  }
  if (
    compareDate(
      date,
      { season: opportunity.expiresSeason, week: opportunity.expiresWeek },
    ) > 0
  ) {
    const expired = {
      ...opportunity,
      status: "expired" as const,
      resolution: "expired" as const,
      resolvedSeason: date.season,
      resolvedWeek: date.week,
    };
    return {
      state: {
        ...state,
        opportunities: { ...state.opportunities, [opportunityId]: expired },
      },
      changed: true,
      reputationDelta: 0,
      fatigueDelta: 0,
      error: `Opportunity ${opportunityId} has expired`,
    };
  }
  const organization = state.organizations[opportunity.organizationId];
  if (!organization) {
    return {
      state,
      changed: false,
      reputationDelta: 0,
      fatigueDelta: 0,
      error: `Opportunity organization ${opportunity.organizationId} no longer exists`,
    };
  }

  const exploit = EXPLOIT_OUTCOMES[opportunity.kind];
  const success = response === "exploit"
    ? opportunity.outcomeRoll < opportunity.successChance
    : undefined;
  const reputationDelta = response === "decline"
    ? 0
    : success
      ? exploit.successReputation
      : exploit.failureReputation;
  const fatigueDelta = response === "decline" ? 0 : exploit.fatigue;
  const agendaDelta = response === "decline"
    ? 3
    : success
      ? exploit.successAgendaDelta
      : exploit.failureAgendaDelta;
  const influenceDelta = response === "decline"
    ? 1
    : success
      ? exploit.successInfluenceDelta
      : exploit.failureInfluenceDelta;
  const resourceDelta = response === "decline"
    ? 0
    : success
      ? exploit.successResourceDelta
      : exploit.failureResourceDelta;
  const heatDelta = response === "decline"
    ? -2
    : success
      ? exploit.successHeatDelta
      : exploit.failureHeatDelta;
  const resolution = response === "decline"
    ? "declined" as const
    : success
      ? "success" as const
      : "failure" as const;
  const updatedOrganization: RivalOrganization = {
    ...organization,
    agendaProgress: clamp(organization.agendaProgress + agendaDelta, 0, 100),
    influence: clamp(organization.influence + influenceDelta, 0, 100),
    resources: clamp(organization.resources + resourceDelta, 0, 100),
    heat: clamp(organization.heat + heatDelta, 0, 100),
    momentum: clamp(
      organization.momentum + (response === "decline" || !success ? 1 : -2),
      -10,
      10,
    ),
  };
  const resolvedOpportunity: RivalOrganizationOpportunity = {
    ...opportunity,
    status: response === "decline" ? "declined" : "exploited",
    resolution,
    resolvedSeason: date.season,
    resolvedWeek: date.week,
  };
  const fact: WorldFact = {
    id: `fact:rival-opportunity:${opportunity.id}:${response}`,
    kind: "RivalOrganizationOpportunityResolved",
    subject: { kind: "rivalOrganization", id: organization.id },
    value: {
      opportunityId: opportunity.id,
      response,
      resolution,
      reputationDelta,
      fatigueDelta,
      agendaDelta,
      influenceDelta,
      resourceDelta,
      heatDelta,
    },
    observedAt: date,
    visibility: "stakeholders",
    metadata: {
      opportunityKind: opportunity.kind,
      relatedPlayerId: opportunity.relatedPlayerId ?? null,
    },
  };
  const message: InboxMessage = {
    id: `rival-opportunity-result-${opportunity.id}`,
    week: date.week,
    season: date.season,
    type: response === "decline" ? "news" : success ? "feedback" : "warning",
    title: response === "decline"
      ? "Rival Opening Declined"
      : success
        ? "Counter-Scouting Move Succeeded"
        : "Counter-Scouting Move Failed",
    body: response === "decline"
      ? `You let the opening around ${organization.name} pass. The organization quietly strengthened its position.`
      : success
        ? `Your move against ${organization.name} worked. You gained ${reputationDelta} reputation at a cost of ${fatigueDelta} fatigue, and their agenda lost ground.`
        : `${organization.name} anticipated your move. You took ${fatigueDelta} fatigue and ${Math.abs(reputationDelta)} reputation damage while their agenda gained momentum.`,
    read: false,
    actionRequired: false,
    relatedId: opportunity.relatedPlayerId ?? opportunity.id,
    relatedEntityType: opportunity.relatedPlayerId ? "player" : undefined,
  };

  return {
    state: {
      ...state,
      organizations: {
        ...state.organizations,
        [organization.id]: updatedOrganization,
      },
      opportunities: {
        ...state.opportunities,
        [opportunity.id]: resolvedOpportunity,
      },
    },
    changed: true,
    success,
    reputationDelta,
    fatigueDelta,
    fact,
    message,
  };
}

/**
 * Resolve one organization move for a week. Reprocessing the same week is a
 * no-op, preventing double pressure and duplicate facts during retries.
 */
export function processRivalOrganizationWeek(
  previousState: RivalOrganizationState,
  input: ProcessRivalOrganizationWeekInput,
): ProcessRivalOrganizationWeekResult {
  if (!Number.isInteger(input.seasonLength) || input.seasonLength < 1) {
    throw new RangeError("seasonLength must be a positive integer");
  }
  const state = createRivalOrganizationState(previousState);
  const weekKey = gameDateKey(input.season, input.week);
  if (state.processedWeekKeys.includes(weekKey)) {
    return {
      state,
      pressure: state.currentPressure,
      facts: [],
      messages: [],
      changed: false,
    };
  }

  const activeOrganizations = Object.values(state.organizations)
    .filter((organization) => organization.memberRivalIds.length > 0)
    .sort((left, right) => left.id.localeCompare(right.id));
  const expiredOpportunities = expireOpportunities(
    state.opportunities,
    input.season,
    input.week,
  );
  if (activeOrganizations.length === 0) {
    return {
      state: {
        ...state,
        opportunities: pruneOpportunities(expiredOpportunities),
        currentPressure: { ...NEUTRAL_PRESSURE },
        processedWeekKeys: [...state.processedWeekKeys, weekKey].slice(
          -MAX_PROCESSED_WEEK_KEYS,
        ),
      },
      pressure: { ...NEUTRAL_PRESSURE },
      facts: [],
      messages: [],
      changed: true,
    };
  }

  const rng = createNamedRNG(
    input.rootSeed,
    "rival-organization-week",
    input.season,
    input.week,
  );
  const actor = rng.pick(activeOrganizations);
  const definition = getRivalOrganizationDefinition(actor.archetypeId);
  const affordableActions = definition.actions.filter(
    (action) => actor.resources >= action.resourceCost,
  );
  const mustRegroup = affordableActions.length === 0 || actor.heat >= 94;
  const action = mustRegroup
    ? undefined
    : rng.pickWeighted(affordableActions.map((candidate) => ({
      item: candidate,
      weight: candidate.weight,
    })));
  const intensity = roundHundredth(rng.nextFloat(0.85, 1.15));

  const passivelyUpdated = Object.fromEntries(
    activeOrganizations.map((organization) => [
      organization.id,
      {
        ...organization,
        resources: clamp(organization.resources + 2, 0, 100),
        heat: clamp(organization.heat - 2, 0, 100),
        momentum: clamp(organization.momentum - Math.sign(organization.momentum), -10, 10),
      },
    ]),
  );
  let updatedActor = passivelyUpdated[actor.id];
  let pressure: RivalOrganizationPressure;
  let activity: RivalOrganizationActivity;

  if (!action) {
    const resourceDelta = 10;
    const heatDelta = -8;
    updatedActor = {
      ...updatedActor,
      resources: clamp(updatedActor.resources + resourceDelta, 0, 100),
      heat: clamp(updatedActor.heat + heatDelta, 0, 100),
      momentum: clamp(updatedActor.momentum - 2, -10, 10),
      lastAction: "regroup",
      lastActionSeason: input.season,
      lastActionWeek: input.week,
    };
    pressure = {
      ...NEUTRAL_PRESSURE,
      sourceOrganizationId: actor.id,
      sourceAction: "regroup",
    };
    activity = {
      id: createDeterministicRunId(
        "rival_org_activity",
        input.rootSeed,
        actor.id,
        input.season,
        input.week,
        "regroup",
      ),
      organizationId: actor.id,
      action: "regroup",
      label: "Regroup",
      summary: `${actor.name} lowers its profile and rebuilds resources.`,
      season: input.season,
      week: input.week,
      relatedRivalIds: [...actor.memberRivalIds],
      resourceDelta,
      influenceDelta: 0,
      heatDelta,
      agendaProgressDelta: 0,
      resultingAgendaLevel: updatedActor.agendaLevel,
      pressure,
    };
  } else {
    const resourceDelta = -action.resourceCost;
    const heatDelta = Math.round(action.heatDelta * intensity);
    const influenceDelta = Math.round(action.influenceDelta * intensity);
    const agendaProgressDelta = Math.round(action.agendaProgress * intensity);
    const rawProgress = updatedActor.agendaProgress + agendaProgressDelta;
    const levelsGained = updatedActor.agendaLevel < 10
      ? Math.min(10 - updatedActor.agendaLevel, Math.floor(rawProgress / 100))
      : 0;
    const agendaLevel = clamp(updatedActor.agendaLevel + levelsGained, 1, 10);
    const agendaProgress = agendaLevel >= 10
      ? clamp(rawProgress, 0, 100)
      : rawProgress % 100;
    updatedActor = {
      ...updatedActor,
      resources: clamp(updatedActor.resources + resourceDelta, 0, 100),
      heat: clamp(updatedActor.heat + heatDelta, 0, 100),
      influence: clamp(
        updatedActor.influence + influenceDelta + levelsGained * 4,
        0,
        100,
      ),
      agendaProgress,
      agendaLevel,
      momentum: clamp(updatedActor.momentum + 2, -10, 10),
      lastAction: action.kind,
      lastActionSeason: input.season,
      lastActionWeek: input.week,
    };
    const influenceScale = 1 + updatedActor.influence / 1000;
    pressure = {
      discoveryChanceMultiplier: roundHundredth(
        action.pressure.discoveryChanceMultiplier * influenceScale,
      ),
      poachChanceMultiplier: roundHundredth(
        action.pressure.poachChanceMultiplier * influenceScale,
      ),
      signingChanceMultiplier: roundHundredth(
        action.pressure.signingChanceMultiplier * influenceScale,
      ),
      youthProgressBonus: action.pressure.youthProgressBonus,
      sourceOrganizationId: actor.id,
      sourceAction: action.kind,
    };
    activity = {
      id: createDeterministicRunId(
        "rival_org_activity",
        input.rootSeed,
        actor.id,
        input.season,
        input.week,
        action.kind,
      ),
      organizationId: actor.id,
      action: action.kind,
      label: action.label,
      summary: action.summary,
      season: input.season,
      week: input.week,
      relatedRivalIds: [...actor.memberRivalIds],
      relatedPlayerId: pickRelatedPlayerId(actor, input.rivalScouts),
      resourceDelta,
      influenceDelta,
      heatDelta,
      agendaProgressDelta,
      resultingAgendaLevel: agendaLevel,
      pressure,
    };
  }

  const organizations = {
    ...state.organizations,
    ...passivelyUpdated,
    [actor.id]: updatedActor,
  };
  let opportunity: RivalOrganizationOpportunity | undefined;
  if (action) {
    const chance = clamp(
      action.opportunityChance * (input.opportunityChanceMultiplier ?? 1),
      0,
      1,
    );
    if (rng.chance(chance)) {
      opportunity = makeOpportunity(
        input.rootSeed,
        updatedActor,
        action.opportunityKind,
        input.season,
        input.week,
        input.seasonLength,
        activity.relatedPlayerId,
      );
    }
  }
  const opportunities = pruneOpportunities({
    ...expiredOpportunities,
    ...(opportunity ? { [opportunity.id]: opportunity } : {}),
  });
  const fact: WorldFact = {
    id: `fact:${activity.id}`,
    kind: "RivalOrganizationActed",
    subject: { kind: "rivalOrganization", id: actor.id },
    value: {
      action: activity.action,
      agendaId: updatedActor.agendaId,
      agendaLevel: updatedActor.agendaLevel,
      agendaProgress: updatedActor.agendaProgress,
      resources: updatedActor.resources,
      influence: updatedActor.influence,
      heat: updatedActor.heat,
    },
    observedAt: { season: input.season, week: input.week },
    visibility: "stakeholders",
    metadata: {
      activityId: activity.id,
      pressureDiscovery: pressure.discoveryChanceMultiplier,
      pressurePoach: pressure.poachChanceMultiplier,
      pressureSigning: pressure.signingChanceMultiplier,
    },
  };

  return {
    state: {
      organizations,
      activities: [...state.activities, activity].slice(-MAX_ACTIVITY_HISTORY),
      opportunities,
      currentPressure: pressure,
      processedWeekKeys: [...state.processedWeekKeys, weekKey].slice(
        -MAX_PROCESSED_WEEK_KEYS,
      ),
    },
    pressure,
    activity,
    opportunity,
    facts: [fact],
    messages: opportunity
      ? [opportunityMessage(opportunity, updatedActor)]
      : [],
    changed: true,
  };
}

export function getRivalOrganizationThreat(
  organization: RivalOrganization,
): number {
  return Math.round(clamp(
    organization.influence * 0.35
      + organization.resources * 0.25
      + organization.heat * 0.15
      + organization.agendaLevel * 2.5,
    0,
    100,
  ));
}

export function getOpenRivalOrganizationOpportunities(
  state: RivalOrganizationState,
): RivalOrganizationOpportunity[] {
  return Object.values(state.opportunities)
    .filter((opportunity) => opportunity.status === "open")
    .sort((left, right) =>
      left.expiresSeason - right.expiresSeason
      || left.expiresWeek - right.expiresWeek
      || left.id.localeCompare(right.id),
    );
}
