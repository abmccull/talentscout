import type {
  Activity,
  GameState,
  InboxMessage,
  TargetOption,
} from "@/engine/core/types";
import {
  applyConsequenceEffects,
  type JsonValue,
  type OpportunityLock,
} from "@/engine/consequences";
import { resolvePlayerEntity } from "@/lib/playerResolution";

export const PROFESSIONAL_CASE_OPPORTUNITY_ACTIVITY_TYPES = [
  "followUpSession",
  "parentCoachMeeting",
  "writePlacementReport",
] as const;

export type ProfessionalCaseOpportunityActivityType =
  typeof PROFESSIONAL_CASE_OPPORTUNITY_ACTIVITY_TYPES[number];

interface ProfessionalCaseOpportunityMetadataInput {
  label: string;
  playerId: string;
  caseId: string;
  familyId: string;
  actorName: string;
  countryId: string;
  playerName: string;
  clubName?: string | null;
}

export interface ProfessionalCaseOpportunity {
  lock: OpportunityLock;
  playerId: string;
  caseId: string;
  familyId: string;
  label: string;
  playerName: string;
  activityTypes: readonly ProfessionalCaseOpportunityActivityType[];
}

function compareGameDate(
  left: { season: number; week: number },
  right: { season: number; week: number },
): number {
  return left.season - right.season || left.week - right.week;
}

function isOpportunityExpired(
  lock: OpportunityLock,
  now: { season: number; week: number },
): boolean {
  return Boolean(lock.expiresAt) && compareGameDate(lock.expiresAt!, now) < 0;
}

function professionalCaseOpportunityActivityTypes(
  familyId: string,
): readonly ProfessionalCaseOpportunityActivityType[] {
  switch (familyId) {
    case "academy-release-late-developer":
      return ["followUpSession", "writePlacementReport"];
    case "education-versus-relocation":
      return ["parentCoachMeeting", "followUpSession"];
    case "injury-recovery-evidence":
      return ["followUpSession", "parentCoachMeeting"];
    case "dual-national-pathway":
      return ["followUpSession", "parentCoachMeeting", "writePlacementReport"];
    case "role-conversion":
      return ["followUpSession"];
    case "agent-exclusivity":
      return ["followUpSession", "writePlacementReport"];
    case "rival-claim":
      return ["followUpSession", "parentCoachMeeting"];
    case "source-conflict":
      return ["followUpSession"];
    case "tournament-window":
      return ["followUpSession", "parentCoachMeeting"];
    case "trial-deadline":
      return ["followUpSession", "writePlacementReport"];
    case "development-environment":
      return ["followUpSession", "parentCoachMeeting", "writePlacementReport"];
    default:
      return ["followUpSession", "parentCoachMeeting"];
  }
}

function parseProfessionalCaseOpportunityActivityTypes(
  metadata: OpportunityLock["metadata"],
  familyId: string,
): readonly ProfessionalCaseOpportunityActivityType[] {
  const raw = metadata?.eligibleActivityTypes;
  if (Array.isArray(raw)) {
    const parsed = raw.filter((value): value is ProfessionalCaseOpportunityActivityType =>
      typeof value === "string"
      && PROFESSIONAL_CASE_OPPORTUNITY_ACTIVITY_TYPES.includes(
        value as ProfessionalCaseOpportunityActivityType,
      ),
    );
    if (parsed.length > 0) return parsed;
  }
  return professionalCaseOpportunityActivityTypes(familyId);
}

function parseProfessionalCaseOpportunity(
  lock: OpportunityLock,
  now: { season: number; week: number },
): ProfessionalCaseOpportunity | null {
  if (lock.status !== "active" || isOpportunityExpired(lock, now)) return null;

  const playerId = typeof lock.metadata?.playerId === "string"
    ? lock.metadata.playerId
    : undefined;
  const caseId = typeof lock.metadata?.caseId === "string"
    ? lock.metadata.caseId
    : undefined;
  const familyId = typeof lock.metadata?.familyId === "string"
    ? lock.metadata.familyId
    : undefined;
  if (!playerId || !caseId || !familyId) return null;

  return {
    lock,
    playerId,
    caseId,
    familyId,
    label: typeof lock.metadata?.label === "string"
      ? lock.metadata.label
      : lock.opportunityId,
    playerName: typeof lock.metadata?.playerName === "string"
      ? lock.metadata.playerName
      : "The prospect",
    activityTypes: parseProfessionalCaseOpportunityActivityTypes(lock.metadata, familyId),
  };
}

function formatOpportunityDescription(
  opportunities: readonly ProfessionalCaseOpportunity[],
): string | undefined {
  if (opportunities.length === 0) return undefined;
  const [primary] = [...opportunities].sort((left, right) =>
    compareGameDate(
      left.lock.expiresAt ?? { season: Number.MAX_SAFE_INTEGER, week: Number.MAX_SAFE_INTEGER },
      right.lock.expiresAt ?? { season: Number.MAX_SAFE_INTEGER, week: Number.MAX_SAFE_INTEGER },
    )
    || left.label.localeCompare(right.label),
  );
  const expiry = primary.lock.expiresAt
    ? ` until S${primary.lock.expiresAt.season} W${primary.lock.expiresAt.week}`
    : "";
  const overflow = opportunities.length > 1
    ? ` (+${opportunities.length - 1} more)`
    : "";
  return `${primary.label}${expiry}${overflow}`;
}

function activityLabel(activityType: ProfessionalCaseOpportunityActivityType): string {
  switch (activityType) {
    case "followUpSession":
      return "follow-up session";
    case "parentCoachMeeting":
      return "parent/coach meeting";
    case "writePlacementReport":
      return "placement pitch";
  }
}

export function isProfessionalCaseOpportunityActivityType(
  activityType: Activity["type"],
): activityType is ProfessionalCaseOpportunityActivityType {
  return PROFESSIONAL_CASE_OPPORTUNITY_ACTIVITY_TYPES.includes(
    activityType as ProfessionalCaseOpportunityActivityType,
  );
}

export function buildProfessionalCaseOpportunityLockMetadata(
  input: ProfessionalCaseOpportunityMetadataInput,
): Record<string, JsonValue> {
  return {
    label: input.label,
    actorName: input.actorName,
    countryId: input.countryId,
    playerName: input.playerName,
    clubName: input.clubName ?? null,
    playerId: input.playerId,
    caseId: input.caseId,
    familyId: input.familyId,
    eligibleActivityTypes: [
      ...professionalCaseOpportunityActivityTypes(input.familyId),
    ],
  };
}

export function getActiveProfessionalCaseOpportunities(input: {
  consequenceState: GameState["consequenceState"] | undefined;
  currentWeek: number;
  currentSeason: number;
}): ProfessionalCaseOpportunity[] {
  if (!input.consequenceState) return [];
  const now = { week: input.currentWeek, season: input.currentSeason };
  return Object.values(input.consequenceState.opportunityLocks)
    .map((lock) => parseProfessionalCaseOpportunity(lock, now))
    .filter((opportunity): opportunity is ProfessionalCaseOpportunity => opportunity !== null)
    .sort((left, right) =>
      compareGameDate(
        left.lock.expiresAt ?? { season: Number.MAX_SAFE_INTEGER, week: Number.MAX_SAFE_INTEGER },
        right.lock.expiresAt ?? { season: Number.MAX_SAFE_INTEGER, week: Number.MAX_SAFE_INTEGER },
      )
      || left.playerName.localeCompare(right.playerName)
      || left.lock.id.localeCompare(right.lock.id),
    );
}

export function prioritizeProfessionalCaseTargets(
  targets: readonly TargetOption[],
  opportunities: readonly ProfessionalCaseOpportunity[],
  activityType: ProfessionalCaseOpportunityActivityType,
): TargetOption[] {
  const matching = opportunities.filter((opportunity) =>
    opportunity.activityTypes.includes(activityType),
  );
  if (matching.length === 0) return [...targets];

  const byPlayerId = new Map<string, ProfessionalCaseOpportunity[]>();
  for (const opportunity of matching) {
    const bucket = byPlayerId.get(opportunity.playerId) ?? [];
    bucket.push(opportunity);
    byPlayerId.set(opportunity.playerId, bucket);
  }

  const decorated = targets.map((target, index) => {
    const playerOpportunities = byPlayerId.get(target.id) ?? [];
    return {
      index,
      target: playerOpportunities.length > 0
        ? {
            ...target,
            description: formatOpportunityDescription(playerOpportunities),
          }
        : { ...target },
      expiry: playerOpportunities[0]?.lock.expiresAt,
      hasOpportunity: playerOpportunities.length > 0,
    };
  });

  decorated.sort((left, right) => {
    if (left.hasOpportunity !== right.hasOpportunity) {
      return left.hasOpportunity ? -1 : 1;
    }
    if (left.expiry && right.expiry) {
      const expiryCompare = compareGameDate(left.expiry, right.expiry);
      if (expiryCompare !== 0) return expiryCompare;
    } else if (left.expiry || right.expiry) {
      return left.expiry ? -1 : 1;
    }
    return left.index - right.index;
  });

  return decorated.map((entry) => entry.target);
}

export function applyProfessionalCaseOpportunityActivity(
  state: GameState,
  activityType: Activity["type"],
  targetId: string,
): GameState {
  if (!isProfessionalCaseOpportunityActivityType(activityType)) return state;

  const resolved = resolvePlayerEntity(state, targetId);
  const playerId = resolved?.playerId ?? targetId;
  const opportunities = getActiveProfessionalCaseOpportunities({
    consequenceState: state.consequenceState,
    currentWeek: state.currentWeek,
    currentSeason: state.currentSeason,
  }).filter((opportunity) =>
    opportunity.playerId === playerId
    && opportunity.activityTypes.includes(activityType),
  );
  if (opportunities.length === 0) return state;

  const [selected] = opportunities;
  const factId = `fact:${selected.caseId}:opportunity:${selected.lock.id}`;
  const messageId = `prospect-follow-up:${selected.caseId}:${selected.lock.id}`;
  if (state.consequenceState.facts[factId] || state.inbox.some((message) => message.id === messageId)) {
    return state;
  }

  const now = { week: state.currentWeek, season: state.currentSeason };
  const detail = `${activityLabel(activityType)} used the ${selected.label.toLowerCase()} around ${selected.playerName} before it closed.`;
  const application = applyConsequenceEffects(
    state.consequenceState,
    `professional-case-opportunity:${selected.lock.id}`,
    [
      {
        id: `effect:${selected.lock.id}:consume`,
        type: "transitionOpportunityLock",
        opportunityLockId: selected.lock.id,
        status: "consumed",
        note: `Consumed by ${activityType} for ${playerId}`,
      },
      {
        id: `effect:${selected.lock.id}:fact`,
        type: "recordFact",
        fact: {
          id: factId,
          kind: "professionalCaseOpportunityResolved",
          subject: { kind: "player", id: playerId },
          value: activityType,
          observedAt: now,
          visibility: "stakeholders",
          sourceDecisionId: selected.lock.sourceDecisionId,
          metadata: {
            caseId: selected.caseId,
            familyId: selected.familyId,
            playerId,
            opportunityLockId: selected.lock.id,
            opportunityId: selected.lock.opportunityId,
            activityType,
            detail,
          },
        },
      },
    ],
    now,
  );
  if (!application.success || !application.changed) return state;

  const message: InboxMessage = {
    id: messageId,
    week: state.currentWeek,
    season: state.currentSeason,
    type: "feedback",
    title: `${selected.playerName}: ${selected.label} used`,
    body: [
      `Your ${activityLabel(activityType)} converted the ${selected.label.toLowerCase()} into a concrete next step.`,
      "Next state: the live access window is now consumed and preserved in the case record.",
    ].join("\n"),
    read: false,
    actionRequired: false,
    relatedId: playerId,
    relatedEntityType: "player",
  };

  const scoutingCase = state.scoutingCases[selected.caseId];
  return {
    ...state,
    consequenceState: application.state,
    scoutingCases: scoutingCase
      ? {
          ...state.scoutingCases,
          [selected.caseId]: {
            ...scoutingCase,
            lastUpdatedWeek: state.currentWeek,
            lastUpdatedSeason: state.currentSeason,
          },
        }
      : state.scoutingCases,
    inbox: [...state.inbox, message],
  };
}
