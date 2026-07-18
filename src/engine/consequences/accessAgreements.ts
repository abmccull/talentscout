import { addGameWeeks, isGameDateAtOrAfter } from "@/engine/core/gameDate";
import type {
  Contact,
  GameDate,
  GameState,
  InboxMessage,
  Player,
} from "@/engine/core/types";
import type { EntityRef } from "./types";
import { RNG } from "@/engine/rng";

export type AccessAgreementScope =
  | "playerEarlyAccess"
  | "trainingAccess"
  | "academyVisit"
  | "tournamentAccess"
  | "regionalIntro"
  | "clubChannel"
  | "dataFeed";

export type AccessAgreementStatus =
  | "active"
  | "consumed"
  | "revoked"
  | "expired"
  | "breached";

export interface AccessAgreement {
  id: string;
  grantor: EntityRef;
  beneficiary: EntityRef;
  scope: AccessAgreementScope;
  status: AccessAgreementStatus;
  exclusive: boolean;
  confidential: boolean;
  createdAt: GameDate;
  expiresAt?: GameDate;
  subject?: EntityRef;
  countryId?: string;
  regionId?: string;
  sourceDecisionId?: string;
  sourceObligationId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export type AccessAgreementState = Record<string, AccessAgreement>;

export const ACCESS_AGREEMENT_RECENT_HISTORY_SEASONS = 2;
export const ACCESS_AGREEMENT_TERMINAL_HISTORY_PER_SUBJECT = 2;
export const ACCESS_AGREEMENT_TERMINAL_HISTORY_PER_TERRITORY = 2;
export const ACCESS_AGREEMENT_TERMINAL_HISTORY_PER_SOURCE = 1;
export const ACCESS_AGREEMENT_TERMINAL_HISTORY_PER_PARTY = 1;
export const ACCESS_AGREEMENT_TERMINAL_HISTORY_GLOBAL_LIMIT = 160;

const TERMINAL_ACCESS_AGREEMENT_STATUSES = new Set<AccessAgreementStatus>([
  "consumed",
  "revoked",
  "expired",
  "breached",
]);

function sameEntity(left: EntityRef, right: EntityRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function agreementSubjectPlayerId(agreement: AccessAgreement): string | undefined {
  return agreement.subject?.kind === "player" ? agreement.subject.id : undefined;
}

function isTerminalAccessAgreementStatus(status: AccessAgreementStatus): boolean {
  return TERMINAL_ACCESS_AGREEMENT_STATUSES.has(status);
}

function sameGameDate(left: GameDate, right: GameDate): boolean {
  return left.season === right.season && left.week === right.week;
}

function accessAgreementTerminalDate(agreement: AccessAgreement): GameDate {
  const terminalSeason = Number(agreement.metadata?.terminalSeason);
  const terminalWeek = Number(agreement.metadata?.terminalWeek);
  if (Number.isInteger(terminalSeason) && Number.isInteger(terminalWeek)) {
    return { season: terminalSeason, week: terminalWeek };
  }
  return agreement.expiresAt ? { ...agreement.expiresAt } : { ...agreement.createdAt };
}

function compareGameDatesDescending(left: GameDate, right: GameDate): number {
  return right.season - left.season || right.week - left.week;
}

function compareAccessAgreementRecency(left: AccessAgreement, right: AccessAgreement): number {
  return compareGameDatesDescending(accessAgreementTerminalDate(left), accessAgreementTerminalDate(right))
    || compareGameDatesDescending(left.createdAt, right.createdAt)
    || left.id.localeCompare(right.id);
}

function isRecentTerminalAccessAgreement(
  agreement: AccessAgreement,
  now: GameDate,
): boolean {
  if (!isTerminalAccessAgreementStatus(agreement.status)) return false;
  return now.season - accessAgreementTerminalDate(agreement).season
    < ACCESS_AGREEMENT_RECENT_HISTORY_SEASONS;
}

function accessAgreementSubjectKey(agreement: AccessAgreement): string | undefined {
  return agreement.subject
    ? `${agreement.subject.kind}:${agreement.subject.id}:${agreement.scope}`
    : undefined;
}

function accessAgreementTerritoryKey(agreement: AccessAgreement): string | undefined {
  const territory = agreement.regionId ?? agreement.countryId;
  return territory ? `${territory}:${agreement.scope}` : undefined;
}

function accessAgreementSourceKey(agreement: AccessAgreement): string | undefined {
  if (agreement.sourceDecisionId) return `decision:${agreement.sourceDecisionId}`;
  if (agreement.sourceObligationId) return `obligation:${agreement.sourceObligationId}`;
  return undefined;
}

function accessAgreementPartyKey(agreement: AccessAgreement): string {
  return [
    agreement.grantor.kind,
    agreement.grantor.id,
    agreement.beneficiary.kind,
    agreement.beneficiary.id,
    agreement.scope,
  ].join(":");
}

function markAccessAgreementTerminal(
  agreement: AccessAgreement,
  status: Extract<AccessAgreementStatus, "revoked" | "expired">,
  now: GameDate,
): AccessAgreement {
  if (
    agreement.status === status
    && sameGameDate(accessAgreementTerminalDate(agreement), now)
  ) {
    return agreement;
  }
  return {
    ...agreement,
    status,
    metadata: {
      ...(agreement.metadata ?? {}),
      terminalSeason: now.season,
      terminalWeek: now.week,
      terminalStatus: status,
    },
  };
}

export function createAccessAgreementState(
  partial: AccessAgreementState | undefined,
): AccessAgreementState {
  return { ...(partial ?? {}) };
}

export function isAccessAgreementActive(
  agreement: AccessAgreement,
  now?: GameDate,
): boolean {
  if (agreement.status !== "active") return false;
  if (!agreement.expiresAt || !now) return true;
  return !isGameDateAtOrAfter(now, agreement.expiresAt);
}

export function getActiveAccessAgreementIdsForGrantor(
  agreements: AccessAgreementState | undefined,
  grantor: EntityRef,
  now?: GameDate,
): string[] {
  return Object.values(agreements ?? {})
    .filter((agreement) => sameEntity(agreement.grantor, grantor) && isAccessAgreementActive(agreement, now))
    .map((agreement) => agreement.id)
    .sort();
}

export function getActiveAccessAgreementsForStakeholder(
  agreements: AccessAgreementState | undefined,
  stakeholder: EntityRef,
  now?: GameDate,
): AccessAgreement[] {
  return Object.values(agreements ?? {})
    .filter((agreement) =>
      isAccessAgreementActive(agreement, now)
      && (sameEntity(agreement.grantor, stakeholder) || sameEntity(agreement.beneficiary, stakeholder)),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function getActiveEarlyAccessForContact(
  agreements: AccessAgreementState | undefined,
  contactId: string,
  now?: GameDate,
): AccessAgreement | undefined {
  return Object.values(agreements ?? {})
    .filter((agreement) =>
      agreement.scope === "playerEarlyAccess"
      && sameEntity(agreement.grantor, { kind: "contact", id: contactId })
      && isAccessAgreementActive(agreement, now),
    )
    .sort((left, right) => left.id.localeCompare(right.id))[0];
}

export function expireAccessAgreements(
  agreements: AccessAgreementState | undefined,
  now: GameDate,
): {
  accessAgreements: AccessAgreementState;
  expiredIds: string[];
} {
  let changed = false;
  const accessAgreements = createAccessAgreementState(agreements);
  const expiredIds: string[] = [];
  for (const agreement of Object.values(accessAgreements)) {
    if (
      agreement.status === "active"
      && agreement.expiresAt
      && isGameDateAtOrAfter(now, agreement.expiresAt)
    ) {
      accessAgreements[agreement.id] = markAccessAgreementTerminal(
        agreement,
        "expired",
        now,
      );
      expiredIds.push(agreement.id);
      changed = true;
    }
  }
  return {
    accessAgreements: changed ? accessAgreements : createAccessAgreementState(agreements),
    expiredIds: expiredIds.sort(),
  };
}

export function revokeAccessAgreements(
  agreements: AccessAgreementState | undefined,
  agreementIds: readonly string[],
  now?: GameDate,
): AccessAgreementState {
  if (agreementIds.length === 0) return createAccessAgreementState(agreements);
  const revoked = new Set(agreementIds);
  let changed = false;
  const accessAgreements = createAccessAgreementState(agreements);
  for (const agreementId of revoked) {
    const agreement = accessAgreements[agreementId];
    if (!agreement || agreement.status !== "active") continue;
    accessAgreements[agreementId] = now
      ? markAccessAgreementTerminal(agreement, "revoked", now)
      : {
          ...agreement,
          status: "revoked",
        };
    changed = true;
  }
  return changed ? accessAgreements : createAccessAgreementState(agreements);
}

export function compactAccessAgreementHistory(
  agreements: AccessAgreementState | undefined,
  now: GameDate,
): {
  accessAgreements: AccessAgreementState;
  removedIds: string[];
} {
  const source = createAccessAgreementState(agreements);
  const active = Object.values(source)
    .filter((agreement) => isAccessAgreementActive(agreement, now))
    .sort(compareAccessAgreementRecency);
  const recentTerminal = Object.values(source)
    .filter((agreement) => isRecentTerminalAccessAgreement(agreement, now))
    .sort(compareAccessAgreementRecency);
  const historicalTerminal = Object.values(source)
    .filter((agreement) =>
      isTerminalAccessAgreementStatus(agreement.status)
      && !isRecentTerminalAccessAgreement(agreement, now),
    )
    .sort(compareAccessAgreementRecency);

  const keptIds = new Set<string>([
    ...active.map((agreement) => agreement.id),
    ...recentTerminal.map((agreement) => agreement.id),
  ]);
  const subjectCounts = new Map<string, number>();
  const territoryCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const partyCounts = new Map<string, number>();
  const historicalKeepers: AccessAgreement[] = [];

  const readCount = (map: Map<string, number>, key: string | undefined): number =>
    key ? (map.get(key) ?? 0) : 0;
  const increment = (map: Map<string, number>, key: string | undefined): void => {
    if (!key) return;
    map.set(key, readCount(map, key) + 1);
  };

  for (const agreement of historicalTerminal) {
    if (historicalKeepers.length >= ACCESS_AGREEMENT_TERMINAL_HISTORY_GLOBAL_LIMIT) break;
    const subjectKey = accessAgreementSubjectKey(agreement);
    const territoryKey = accessAgreementTerritoryKey(agreement);
    const sourceKey = accessAgreementSourceKey(agreement);
    const partyKey = accessAgreementPartyKey(agreement);
    const keepBecauseSubject = subjectKey !== undefined
      && readCount(subjectCounts, subjectKey) < ACCESS_AGREEMENT_TERMINAL_HISTORY_PER_SUBJECT;
    const keepBecauseTerritory = territoryKey !== undefined
      && readCount(territoryCounts, territoryKey) < ACCESS_AGREEMENT_TERMINAL_HISTORY_PER_TERRITORY;
    const keepBecauseSource = sourceKey !== undefined
      && readCount(sourceCounts, sourceKey) < ACCESS_AGREEMENT_TERMINAL_HISTORY_PER_SOURCE;
    const keepBecauseParty = !subjectKey
      && !territoryKey
      && !sourceKey
      && readCount(partyCounts, partyKey) < ACCESS_AGREEMENT_TERMINAL_HISTORY_PER_PARTY;
    if (!keepBecauseSubject && !keepBecauseTerritory && !keepBecauseSource && !keepBecauseParty) {
      continue;
    }
    historicalKeepers.push(agreement);
    keptIds.add(agreement.id);
    increment(subjectCounts, subjectKey);
    increment(territoryCounts, territoryKey);
    increment(sourceCounts, sourceKey);
    if (!subjectKey && !territoryKey && !sourceKey) increment(partyCounts, partyKey);
  }

  const retainedEntries = Object.values(source)
    .filter((agreement) => keptIds.has(agreement.id) || !isTerminalAccessAgreementStatus(agreement.status))
    .sort(compareAccessAgreementRecency);
  const removedIds = Object.keys(source)
    .filter((id) => !keptIds.has(id) && isTerminalAccessAgreementStatus(source[id].status))
    .sort();
  if (removedIds.length === 0) {
    return {
      accessAgreements: source,
      removedIds,
    };
  }
  return {
    accessAgreements: Object.fromEntries(retainedEntries.map((agreement) => [agreement.id, agreement])),
    removedIds,
  };
}

function eligibleInsider(contact: Contact, now: GameDate): boolean {
  const insiderTypes = new Set(["clubStaff", "academyCoach", "sportingDirector", "academyDirector"]);
  const trustLevel = contact.trustLevel ?? contact.relationship;
  return insiderTypes.has(contact.type)
    && trustLevel >= 75
    && !contact.dormant
    && (!contact.accessSuspendedUntil || isGameDateAtOrAfter(now, contact.accessSuspendedUntil));
}

function makeEarlyAccessAgreement(
  contact: Contact,
  player: Player,
  now: GameDate,
  expiresAt: GameDate,
): AccessAgreement {
  return {
    id: `access:contact:${contact.id}:player:${player.id}:s${now.season}:w${now.week}`,
    grantor: { kind: "contact", id: contact.id },
    beneficiary: { kind: "scout", id: "player-scout" },
    scope: "playerEarlyAccess",
    status: "active",
    exclusive: true,
    confidential: true,
    createdAt: { ...now },
    expiresAt,
    subject: { kind: "player", id: player.id },
    countryId: contact.country,
    regionId: contact.region,
    metadata: {
      grantorType: contact.type,
      grantorName: contact.name,
      organization: contact.organization,
      playerName: `${player.firstName} ${player.lastName}`.trim(),
    },
  };
}

export function processWeeklyAccessAgreements(
  state: Pick<
    GameState,
    "accessAgreements" | "contacts" | "players" | "fixtures" | "currentSeason" | "currentWeek" | "scout"
  >,
  rng: RNG,
): {
  accessAgreements: AccessAgreementState;
  exclusiveMessages: InboxMessage[];
} {
  const now = { season: state.currentSeason, week: state.currentWeek };
  const expired = expireAccessAgreements(state.accessAgreements, now);
  const accessAgreements = expired.accessAgreements;
  const exclusiveMessages: InboxMessage[] = [];

  for (const contact of Object.values(state.contacts)) {
    if (!eligibleInsider(contact, now)) continue;
    if (getActiveEarlyAccessForContact(accessAgreements, contact.id, now)) continue;

    const loyaltyBonus = ((contact.loyalty ?? 50) - 50) / 1000;
    if (!rng.chance(0.05 + loyaltyBonus)) continue;

    const knownPlayers = contact.knownPlayerIds
      .map((id) => state.players[id])
      .filter((player): player is Player => Boolean(player) && player.age <= 25);
    if (knownPlayers.length === 0) continue;

    const player = rng.pick(knownPlayers);
    const expiresAt = addGameWeeks(state.fixtures, now, 2);
    const agreement = makeEarlyAccessAgreement(contact, player, now, expiresAt);
    agreement.beneficiary = { kind: "scout", id: state.scout.id };
    accessAgreements[agreement.id] = agreement;
    exclusiveMessages.push({
      id: `msg_exclusive_${agreement.id}`,
      week: state.currentWeek,
      season: state.currentSeason,
      type: "news",
      title: `Exclusive Tip from ${contact.name}`,
      body: `${contact.name} has given you a 2-week exclusive on ${player.firstName} ${player.lastName}. You have early access before other scouts are aware. This window expires in season ${expiresAt.season}, week ${expiresAt.week}.`,
      read: false,
      actionRequired: true,
      relatedId: player.id,
      relatedEntityType: "player",
    });
  }

  const compacted = compactAccessAgreementHistory(accessAgreements, now);

  return {
    accessAgreements: compacted.accessAgreements,
    exclusiveMessages,
  };
}

export function migrateLegacyContactExclusiveWindows(state: Pick<
  GameState,
  "accessAgreements" | "contacts" | "scout"
>): void {
  const accessAgreements = createAccessAgreementState(state.accessAgreements);
  for (const [contactId, contact] of Object.entries(state.contacts)) {
    if (!contact.exclusiveWindow?.playerId || !contact.exclusiveWindow.expiresAt) continue;
    const agreementId = `access:legacy-contact:${contactId}:player:${contact.exclusiveWindow.playerId}:expires:s${contact.exclusiveWindow.expiresAt.season}:w${contact.exclusiveWindow.expiresAt.week}`;
    if (!accessAgreements[agreementId]) {
      accessAgreements[agreementId] = {
        id: agreementId,
        grantor: { kind: "contact", id: contactId },
        beneficiary: { kind: "scout", id: state.scout.id },
        scope: "playerEarlyAccess",
        status: "active",
        exclusive: true,
        confidential: true,
        createdAt: contact.lastInteractionAt
          ? { ...contact.lastInteractionAt }
          : { season: 1, week: 1 },
        expiresAt: { ...contact.exclusiveWindow.expiresAt },
        subject: { kind: "player", id: contact.exclusiveWindow.playerId },
        countryId: contact.country,
        regionId: contact.region,
        metadata: {
          migratedFromLegacyContact: true,
          grantorName: contact.name,
          organization: contact.organization,
        },
      };
    }
    state.contacts[contactId] = {
      ...contact,
      exclusiveWindow: undefined,
    };
  }
  state.accessAgreements = accessAgreements;
}

export interface AccessAgreementStoryThreadEntry {
  id: string;
  kind: "memory" | "obligation" | "access";
  season: number;
  week: number;
  title: string;
  description: string;
}

export function buildAccessAgreementStoryEntries(
  agreements: readonly AccessAgreement[],
): AccessAgreementStoryThreadEntry[] {
  return agreements
    .map((agreement) => {
      const playerId = agreementSubjectPlayerId(agreement);
      const grantorName = typeof agreement.metadata?.grantorName === "string"
        ? agreement.metadata.grantorName
        : agreement.grantor.kind === "contact"
          ? "a trusted contact"
          : "a football stakeholder";
      const subjectName = typeof agreement.metadata?.playerName === "string"
        ? agreement.metadata.playerName
        : typeof agreement.metadata?.targetLabel === "string"
          ? agreement.metadata.targetLabel
          : "a prospect";
      return {
        id: agreement.id,
        kind: "access" as const,
        season: agreement.createdAt.season,
        week: agreement.createdAt.week,
        title: agreement.scope === "playerEarlyAccess" ? "Exclusive access granted" : "Access granted",
        description: playerId
          ? `${grantorName} opened a protected channel around ${subjectName}.`
          : `${grantorName} opened a protected scouting channel.`,
      };
    })
    .sort((left, right) => right.season - left.season || right.week - left.week || left.id.localeCompare(right.id));
}
