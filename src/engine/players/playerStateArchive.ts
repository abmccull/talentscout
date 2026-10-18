import type { GameState } from "../core/types";
import type { InjuryHistory, PersonalityProfile, StoredInjuryHistory, StoredPersonalityProfile } from "../core/types/player";
export type { StoredInjuryHistory, StoredPersonalityProfile } from "../core/types/player";

export class InvalidPlayerStateArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPlayerStateArchiveError";
  }
}

const INJURY_KEYS = ["playerId", "injuries", "totalWeeksMissed", "injuryProneness", "reinjuryWindowWeeksLeft"] as const;
const PROFILE_KEYS = ["archetype", "traits", "transferWillingness", "dressingRoomImpact", "formVolatility", "bigMatchModifier", "hiddenUntilRevealed", "revealedTraits"] as const;
const ARCHETYPES = new Set(["leader", "mercenary", "homesick", "ambitious", "loyal", "disruptive", "introvert", "professional", "hothead", "clutch"]);
const TRAITS = new Set(["ambitious", "loyal", "professional", "temperamental", "determined", "easygoing", "leader", "introvert", "flair", "controversialCharacter", "modelCitizen", "pressurePlayer", "bigGamePlayer", "inconsistent", "injuryProne", "lateDeveloper"]);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => own(value, key));
}

function exactArray(value: unknown[], length: number): boolean {
  const keys = Object.keys(value);
  return value.length === length && keys.length === length
    && keys.every((key, index) => key === String(index));
}

function knownInjuryHistory(value: unknown): value is InjuryHistory {
  return exactRecord(value, INJURY_KEYS) && typeof value.playerId === "string"
    && Array.isArray(value.injuries) && finite(value.totalWeeksMissed)
    && finite(value.injuryProneness) && finite(value.reinjuryWindowWeeksLeft);
}

function knownTraits(value: unknown): value is PersonalityProfile["traits"] {
  return Array.isArray(value) && exactArray(value, value.length)
    && value.every(trait => typeof trait === "string" && TRAITS.has(trait));
}

function knownPersonalityProfile(value: unknown): value is PersonalityProfile {
  return exactRecord(value, PROFILE_KEYS) && typeof value.archetype === "string"
    && ARCHETYPES.has(value.archetype) && knownTraits(value.traits) && knownTraits(value.revealedTraits)
    && finite(value.transferWillingness) && finite(value.dressingRoomImpact)
    && finite(value.formVolatility) && finite(value.bigMatchModifier)
    && typeof value.hiddenUntilRevealed === "boolean";
}

export function expandPlayerInjuryHistory(history: StoredInjuryHistory, ownerId: string): InjuryHistory;
export function expandPlayerInjuryHistory<T extends null | undefined>(history: T, ownerId: string): T;
export function expandPlayerInjuryHistory(history: StoredInjuryHistory | undefined, ownerId: string): InjuryHistory | undefined;
export function expandPlayerInjuryHistory(history: StoredInjuryHistory | null | undefined, ownerId: string): InjuryHistory | null | undefined {
  // Ordinary legacy/custom values retain both their data and their identity.
  if (!Array.isArray(history)) return history;
  const inherited = history[0] === "ih-own";
  if (history[1] !== 1 || (!inherited && history[0] !== "ih")
    || !exactArray(history, inherited ? 6 : 7)
    || (inherited && typeof ownerId !== "string")) {
    throw new InvalidPlayerStateArchiveError("Invalid or unsupported player injury archive");
  }
  const expanded = inherited
    ? { playerId: ownerId, injuries: history[2], totalWeeksMissed: history[3], injuryProneness: history[4], reinjuryWindowWeeksLeft: history[5] }
    : { playerId: history[2], injuries: history[3], totalWeeksMissed: history[4], injuryProneness: history[5], reinjuryWindowWeeksLeft: history[6] };
  if (!knownInjuryHistory(expanded)) {
    throw new InvalidPlayerStateArchiveError("Invalid player injury archive payload");
  }
  return expanded;
}

export function compactPlayerInjuryHistory(history: StoredInjuryHistory, ownerId: string): StoredInjuryHistory;
export function compactPlayerInjuryHistory<T extends null | undefined>(history: T, ownerId: string): T;
export function compactPlayerInjuryHistory(history: StoredInjuryHistory | undefined, ownerId: string): StoredInjuryHistory | undefined;
export function compactPlayerInjuryHistory(history: StoredInjuryHistory | null | undefined, ownerId: string): StoredInjuryHistory | null | undefined {
  if (Array.isArray(history)) {
    expandPlayerInjuryHistory(history, ownerId);
    return history;
  }
  if (!knownInjuryHistory(history)) return history;
  return typeof ownerId === "string" && history.playerId === ownerId
    ? ["ih-own", 1, history.injuries, history.totalWeeksMissed, history.injuryProneness, history.reinjuryWindowWeeksLeft]
    : ["ih", 1, history.playerId, history.injuries, history.totalWeeksMissed, history.injuryProneness, history.reinjuryWindowWeeksLeft];
}

export function expandPlayerPersonalityProfile(profile: StoredPersonalityProfile): PersonalityProfile;
export function expandPlayerPersonalityProfile<T extends null | undefined>(profile: T): T;
export function expandPlayerPersonalityProfile(profile: StoredPersonalityProfile | undefined): PersonalityProfile | undefined;
export function expandPlayerPersonalityProfile(profile: StoredPersonalityProfile | null | undefined): PersonalityProfile | null | undefined {
  if (!Array.isArray(profile)) return profile;
  if (profile[0] !== "pp" || profile[1] !== 1 || !exactArray(profile, 10)) {
    throw new InvalidPlayerStateArchiveError("Invalid or unsupported player personality archive");
  }
  const expanded = {
    archetype: profile[2], traits: profile[3], transferWillingness: profile[4],
    dressingRoomImpact: profile[5], formVolatility: profile[6], bigMatchModifier: profile[7],
    hiddenUntilRevealed: profile[8], revealedTraits: profile[9],
  };
  if (!knownPersonalityProfile(expanded)) {
    throw new InvalidPlayerStateArchiveError("Invalid player personality archive payload");
  }
  return expanded;
}

export function compactPlayerPersonalityProfile(profile: StoredPersonalityProfile): StoredPersonalityProfile;
export function compactPlayerPersonalityProfile<T extends null | undefined>(profile: T): T;
export function compactPlayerPersonalityProfile(profile: StoredPersonalityProfile | undefined): StoredPersonalityProfile | undefined;
export function compactPlayerPersonalityProfile(profile: StoredPersonalityProfile | null | undefined): StoredPersonalityProfile | null | undefined {
  if (Array.isArray(profile)) {
    expandPlayerPersonalityProfile(profile);
    return profile;
  }
  if (!knownPersonalityProfile(profile)) return profile;
  return ["pp", 1, profile.archetype, profile.traits, profile.transferWillingness,
    profile.dressingRoomImpact, profile.formVolatility, profile.bigMatchModifier,
    profile.hiddenUntilRevealed, profile.revealedTraits];
}

/** Refuse recognized corrupt data before any common-loader compatibility repairs. */
export function assertPlayerStateArchives(state: Pick<GameState, "players" | "retiredPlayers" | "unsignedYouth">): void {
  const validate = (player: GameState["players"][string] | undefined): void => {
    if (!player) return;
    if (Array.isArray(player.injuryHistory)) expandPlayerInjuryHistory(player.injuryHistory, player.id);
    if (Array.isArray(player.personalityProfile)) expandPlayerPersonalityProfile(player.personalityProfile);
  };
  Object.values(state.players ?? {}).forEach(validate);
  Object.values(state.retiredPlayers ?? {}).forEach(validate);
  Object.values(state.unsignedYouth ?? {}).forEach(youth => validate(youth?.player));
}
