import type {
  GameState,
  Player,
  RivalPlayerEvidence,
  RivalScout,
} from "@/engine/core/types";
import type { RNG } from "@/engine/rng";

const MIN_ABILITY = 1;
const MAX_ABILITY = 200;
const MAX_EVIDENCE_CONFIDENCE = 0.9;
const MAX_EVIDENCE_HISTORY = 24;
const MIN_SHORTLIST_CAPACITY = 3;
const MAX_SHORTLIST_CAPACITY = 8;

/**
 * A rival's fallible assessment of a player. Hidden ability is sampled only
 * when the rival performs an observation; every downstream decision consumes
 * these estimates rather than true CA/PA.
 */
export type { RivalPlayerEvidence } from "@/engine/core/types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function contractOwner(player: Player): string | undefined {
  return (player.contractClubId ?? player.loanParentClubId ?? player.clubId) || undefined;
}

function clubCountry(state: GameState, clubId: string): string | undefined {
  const club = state.clubs[clubId];
  return club ? state.leagues[club.leagueId]?.country : undefined;
}

function recentRating(player: Player): number {
  const ratings = player.recentMatchRatings ?? [];
  if (ratings.length > 0) {
    return ratings.reduce((sum, entry) => sum + entry.rating, 0) / ratings.length;
  }
  const latestSeason = (player.seasonRatings ?? []).at(-1);
  return latestSeason?.avgRating ?? 6.5;
}

function publicValueSignal(player: Player): number {
  const floor = 5_000;
  const ceiling = 200_000_000;
  const value = clamp(player.marketValue || floor, floor, ceiling);
  return clamp(
    ((Math.log10(value) - Math.log10(floor))
      / (Math.log10(ceiling) - Math.log10(floor))) * 100,
    0,
    100,
  );
}

function publicUpsideSignal(player: Player): number {
  const ageSignal = player.age <= 18
    ? 100
    : player.age <= 21
      ? 85
      : player.age <= 24
        ? 65
        : player.age <= 27
          ? 40
          : player.age <= 30
            ? 20
            : 5;
  const formSignal = clamp(((player.form ?? 0) + 3) / 6 * 100, 0, 100);
  return ageSignal * 0.7 + publicValueSignal(player) * 0.2 + formSignal * 0.1;
}

function publicReadinessSignal(player: Player): number {
  const ratingSignal = clamp((recentRating(player) - 5) * 25, 0, 100);
  const formSignal = clamp(((player.form ?? 0) + 3) / 6 * 100, 0, 100);
  return publicValueSignal(player) * 0.65 + ratingSignal * 0.25 + formSignal * 0.1;
}

function squadNeedSignal(rival: RivalScout, player: Player, state: GameState): number {
  const club = state.clubs[rival.clubId];
  if (!club) return 0;
  const samePosition = club.playerIds.reduce((count, playerId) => (
    state.players[playerId]?.position === player.position ? count + 1 : count
  ), 0);
  return clamp(85 - samePosition * 20, 10, 85);
}

function affordabilitySignal(rival: RivalScout, player: Player, state: GameState): number {
  const club = state.clubs[rival.clubId];
  if (!club) return 0;
  const cost = contractOwner(player)
    ? Math.max(0, player.marketValue)
    : Math.max(0, player.marketValue * 0.1);
  if (cost <= 0) return 100;
  const ratio = club.budget / cost;
  if (ratio >= 1) return 100;
  if (ratio >= 0.75) return 75;
  if (ratio >= 0.5) return 50;
  if (ratio >= 0.25) return 25;
  return 5;
}

/** How well a rival's declared specialty applies to this player's public profile. */
export function getRivalSpecialtyFit(
  rival: RivalScout,
  player: Player,
  state: GameState,
): number {
  switch (rival.specialization) {
    case "youth":
      return player.age <= 21 ? 1.2 : player.age <= 24 ? 1.05 : 0.8;
    case "firstTeam":
      return player.age >= 22 && player.age <= 30 ? 1.2 : player.age >= 20 ? 1 : 0.82;
    case "regional": {
      const rivalCountry = clubCountry(state, rival.clubId);
      const playerCountry = clubCountry(state, player.clubId);
      return rivalCountry && playerCountry && rivalCountry === playerCountry ? 1.2 : 0.85;
    }
    case "data": {
      const recentSamples = (player.recentMatchRatings ?? []).length;
      const historicalSamples = (player.seasonRatings ?? []).at(-1)?.appearances ?? 0;
      return recentSamples >= 3 || historicalSamples >= 8 ? 1.2 : recentSamples > 0 ? 1.05 : 0.85;
    }
    default:
      return 1;
  }
}

export function getRivalPlayerEvidence(
  rival: RivalScout,
  playerId: string,
): RivalPlayerEvidence | undefined {
  return rival.evidenceByPlayer?.[playerId];
}

/**
 * Create one noisy rival observation. Quality, specialty and difficulty improve
 * the estimate, while repeated observations reduce uncertainty without ever
 * reaching perfect confidence.
 */
export function observePlayerForRival(
  rng: RNG,
  rival: RivalScout,
  player: Player,
  state: GameState,
  rivalIntelligence: number,
): RivalScout {
  const intelligence = clamp(rivalIntelligence, 0.5, 1.75);
  const quality = clamp(rival.quality, 1, 5);
  const specialtyFit = getRivalSpecialtyFit(rival, player, state);
  const previous = getRivalPlayerEvidence(rival, player.id);
  const observations = (previous?.observations ?? 0) + 1;

  const qualityErrorFactor = 1 - (quality - 1) * 0.1;
  const intelligenceErrorFactor = 1 / Math.sqrt(intelligence);
  const specialtyErrorFactor = 1 / specialtyFit;
  const repetitionErrorFactor = 1 / Math.sqrt(observations);
  const currentError = clamp(
    22 * qualityErrorFactor * intelligenceErrorFactor
      * specialtyErrorFactor * repetitionErrorFactor,
    4,
    30,
  );
  const potentialBaseError = rival.specialization === "youth" ? 30 : 38;
  const potentialError = clamp(
    potentialBaseError * qualityErrorFactor * intelligenceErrorFactor
      * specialtyErrorFactor * repetitionErrorFactor,
    6,
    42,
  );

  const currentSample = clamp(
    Math.round(player.currentAbility + rng.gaussian(0, currentError)),
    MIN_ABILITY,
    MAX_ABILITY,
  );
  const potentialSample = clamp(
    Math.round(player.potentialAbility + rng.gaussian(0, potentialError)),
    MIN_ABILITY,
    MAX_ABILITY,
  );
  const blend = previous ? clamp(0.35 + intelligence * 0.08, 0.38, 0.52) : 1;
  const estimatedCurrentAbility = Math.round(
    previous
      ? previous.estimatedCurrentAbility * (1 - blend) + currentSample * blend
      : currentSample,
  );
  const rawPotentialEstimate = Math.round(
    previous
      ? previous.estimatedPotentialAbility * (1 - blend) + potentialSample * blend
      : potentialSample,
  );
  const estimatedPotentialAbility = clamp(
    Math.max(estimatedCurrentAbility, rawPotentialEstimate),
    MIN_ABILITY,
    MAX_ABILITY,
  );
  const previousConfidence = previous?.confidence ?? 0.05;
  const confidenceGain = (0.1 + quality * 0.018)
    * specialtyFit
    * Math.sqrt(intelligence)
    * (1 - previousConfidence * 0.45);
  const confidence = clamp(
    previousConfidence + confidenceGain,
    0.1,
    MAX_EVIDENCE_CONFIDENCE,
  );

  const evidence: RivalPlayerEvidence = {
    playerId: player.id,
    estimatedCurrentAbility,
    estimatedPotentialAbility,
    confidence,
    errorMargin: Math.max(4, Math.round(currentError * 1.65 * (1 - confidence * 0.35))),
    observations,
    specialtyFit,
    lastObservedSeason: state.currentSeason,
    lastObservedWeek: state.currentWeek,
  };
  const previousEvidence = rival.evidenceByPlayer ?? {};
  const boundedEvidence = Object.fromEntries(
    Object.entries({
      ...previousEvidence,
      [player.id]: evidence,
    })
      .sort(([, left], [, right]) =>
        right.lastObservedSeason - left.lastObservedSeason
          || right.lastObservedWeek - left.lastObservedWeek
          || right.confidence - left.confidence
      )
      .slice(0, MAX_EVIDENCE_HISTORY),
  );
  return {
    ...rival,
    evidenceByPlayer: boundedEvidence,
  };
}

/** Public-signal and fallible-evidence score used by all senior-rival targeting. */
export function scoreRivalTargetCandidate(
  rival: RivalScout,
  player: Player,
  state: GameState,
  rivalIntelligence: number,
): number {
  const evidence = getRivalPlayerEvidence(rival, player.id);
  const intelligence = clamp(rivalIntelligence, 0.5, 1.75);
  const evidenceWeight = evidence
    ? clamp(evidence.confidence * (0.75 + intelligence * 0.2), 0, 0.88)
    : 0;
  const publicReadiness = publicReadinessSignal(player);
  const evidenceReadiness = evidence ? evidence.estimatedCurrentAbility / 2 : publicReadiness;
  const readiness = publicReadiness * (1 - evidenceWeight) + evidenceReadiness * evidenceWeight;
  const publicUpside = publicUpsideSignal(player);
  const evidenceUpside = evidence
    ? clamp((evidence.estimatedPotentialAbility - evidence.estimatedCurrentAbility + 20) * 2, 0, 100)
    : publicUpside;
  const upside = publicUpside * (1 - evidenceWeight) + evidenceUpside * evidenceWeight;
  const confidence = (evidence?.confidence ?? 0.12) * 100;
  const need = squadNeedSignal(rival, player, state);
  const affordability = affordabilitySignal(rival, player, state);
  const visibility = clamp(
    publicValueSignal(player) * 0.7
      + (state.clubs[player.clubId]?.reputation ?? 30) * 0.3,
    0,
    100,
  );
  const contractOpportunity = player.contractExpiry <= state.currentSeason + 1 ? 100 : 45;

  let score: number;
  switch (rival.personality) {
    case "aggressive":
      score = readiness * 0.45 + visibility * 0.2 + need * 0.15
        + affordability * 0.1 + confidence * 0.1;
      break;
    case "methodical":
      score = upside * 0.3 + confidence * 0.2 + affordability * 0.2
        + need * 0.15 + readiness * 0.15;
      break;
    case "connected":
      score = visibility * 0.3 + readiness * 0.25 + need * 0.2
        + contractOpportunity * 0.15 + confidence * 0.1;
      break;
    case "lucky":
      score = upside * 0.35 + (100 - visibility) * 0.25 + need * 0.15
        + affordability * 0.15 + confidence * 0.1;
      break;
    default:
      score = readiness;
  }

  const specialtyFit = getRivalSpecialtyFit(rival, player, state);
  return clamp(score * (0.82 + specialtyFit * 0.18), 1, 100);
}

/** Eligibility uses only public contract, club and financial information. */
export function isRivalTargetEligible(
  rival: RivalScout,
  player: Player,
  state: GameState,
): boolean {
  const club = state.clubs[rival.clubId];
  if (!club || contractOwner(player) === rival.clubId) return false;
  const acquisitionCost = contractOwner(player)
    ? Math.max(0, player.marketValue)
    : Math.max(0, player.marketValue * 0.1);
  const scoutingCeiling = Math.max(500_000, club.budget * 1.5);
  return acquisitionCost <= scoutingCeiling;
}

/** Bounded number of live targets a rival can operate, including difficulty pressure. */
export function getRivalShortlistCapacity(
  rival: RivalScout,
  rivalIntelligence: number,
): number {
  const qualityCapacity = 3 + Math.ceil(clamp(rival.quality, 1, 5) / 2);
  const difficultyAdjustment = Math.round((clamp(rivalIntelligence, 0.5, 1.75) - 1) * 2);
  return clamp(
    qualityCapacity + difficultyAdjustment,
    MIN_SHORTLIST_CAPACITY,
    MAX_SHORTLIST_CAPACITY,
  );
}
