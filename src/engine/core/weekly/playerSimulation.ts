import type { RNG } from "../../rng/index";
import {
  computeSemanticBreakthrough,
  computeSemanticPlayerDevelopment,
} from "../../players/development";
import { getDifficultyModifiers } from "../difficulty";
import { evaluatePlayerDevelopmentEnvironment } from "../../world/developmentEnvironment";
import type { DevelopmentEnvironmentIndex } from "../../world/developmentEnvironment";
import type {
  AttributeDeltas,
  GameState,
  InboxMessage,
  Injury,
  InjuryHistory,
  InjurySeverity,
  InjuryType,
  PhysicalAttribute,
  Player,
} from "../types";
import type {
  BreakthroughResult,
  FormMomentumUpdate,
  InjuryResult,
  InjurySetbackResult,
  PlayerDevelopmentResult,
  SimulatedFixture,
} from "./types";

const SERIOUS_INJURY_THRESHOLD = 4;
const BASE_INJURY_PROBABILITY = 0.02;

/** Injury type distribution weights: muscle 40%, knock 25%, ligament 15%, fatigue 10%, fracture 7%, concussion 3%. */
const INJURY_TYPE_WEIGHTS: { item: InjuryType; weight: number }[] = [
  { item: "muscle", weight: 40 },
  { item: "knock", weight: 25 },
  { item: "ligament", weight: 15 },
  { item: "fatigue", weight: 10 },
  { item: "fracture", weight: 7 },
  { item: "concussion", weight: 3 },
];

/** Recovery time ranges (weeks) per injury type: [min, max]. */
const RECOVERY_RANGES: Record<InjuryType, [number, number]> = {
  knock: [1, 2],
  muscle: [2, 6],
  fatigue: [1, 3],
  ligament: [4, 12],
  fracture: [6, 16],
  concussion: [2, 4],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function generateId(prefix: string, rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let index = 0; index < 12; index += 1) {
    id += chars[rng.nextInt(0, chars.length - 1)];
  }
  return `${prefix}_${id}`;
}

function makeMessageId(prefix: string, rng: RNG): string {
  return generateId(`msg_${prefix}`, rng);
}

function computeFormMomentum(
  player: Player,
  currentRating: number | undefined,
): FormMomentumUpdate {
  const currentMomentum = player.formMomentum ?? 0;
  const currentTrend = player.formTrend ?? "stable";
  const currentLock = player.formLockWeeks ?? 0;

  if (currentRating === undefined || player.injured) {
    const decayedMomentum = Math.max(0, currentMomentum - 1);
    const decayedLock = Math.max(0, currentLock - 1);
    const trend: "rising" | "stable" | "falling" =
      decayedMomentum === 0 ? "stable" : currentTrend;

    return {
      playerId: player.id,
      formMomentum: decayedMomentum,
      formTrend: trend,
      formLockWeeks: decayedLock,
      form: player.form,
    };
  }

  const clampedRating = currentRating;
  const recentRatings = [
    ...(player.recentMatchRatings ?? []).map((entry) => entry.rating),
    currentRating,
  ].slice(-6);
  const countTrailing = (predicate: (rating: number) => boolean): number => {
    let count = 0;
    for (let index = recentRatings.length - 1; index >= 0; index -= 1) {
      if (!predicate(recentRatings[index])) break;
      count += 1;
    }
    return count;
  };

  const isHotMatch = clampedRating >= 7.0;
  const isColdMatch = clampedRating < 5.0;

  let newMomentum: number;
  let newTrend: "rising" | "stable" | "falling";
  let newLock: number;
  let newForm: number;

  if (isHotMatch && (currentTrend === "rising" || currentTrend === "stable")) {
    const consecutiveHot = countTrailing((rating) => rating >= 7);
    if (consecutiveHot >= 4) {
      newMomentum = Math.min(10, consecutiveHot - 3);
      newTrend = "rising";
      newLock = newMomentum >= 1 && currentTrend !== "rising" ? 2 : Math.max(0, currentLock - 1);
      if (currentTrend !== "rising" && newMomentum >= 1) {
        newLock = 2;
      }
    } else {
      newMomentum = 0;
      newTrend = "stable";
      newLock = Math.max(0, currentLock - 1);
    }
  } else if (isColdMatch && (currentTrend === "falling" || currentTrend === "stable")) {
    const consecutiveCold = countTrailing((rating) => rating < 5);
    if (consecutiveCold >= 4) {
      newMomentum = Math.min(10, consecutiveCold - 3);
      newTrend = "falling";
      newLock = newMomentum >= 1 && currentTrend !== "falling" ? 2 : Math.max(0, currentLock - 1);
      if (currentTrend !== "falling" && newMomentum >= 1) {
        newLock = 2;
      }
    } else {
      newMomentum = 0;
      newTrend = "stable";
      newLock = Math.max(0, currentLock - 1);
    }
  } else if (currentLock > 0) {
    newMomentum = currentMomentum;
    newTrend = currentTrend;
    newLock = currentLock - 1;
  } else {
    newMomentum = Math.max(0, currentMomentum - 1);
    newTrend = newMomentum > 0 ? currentTrend : "stable";
    newLock = 0;
  }

  const rawForm = ((clampedRating - 5.5) / 4.5) * 3;

  if (newLock > 0 || (currentLock > 0 && newTrend !== "stable")) {
    newForm = player.form;
  } else {
    newForm = Math.round((player.form * 0.4 + rawForm * 0.6) * 10) / 10;
    newForm = Math.min(3, Math.max(-3, newForm));
  }

  return {
    playerId: player.id,
    formMomentum: newMomentum,
    formTrend: newTrend,
    formLockWeeks: newLock,
    form: newForm,
  };
}

export function isFormMomentumUpdateNoOp(
  player: Player,
  update: FormMomentumUpdate,
): boolean {
  const appliedForm = clamp(Math.round(update.form * 10) / 10, -3, 3);
  return player.form === appliedForm
    && player.formMomentum === update.formMomentum
    && player.formTrend === update.formTrend
    && player.formLockWeeks === update.formLockWeeks;
}

export function createWeeklyPlayerRatingIndex(
  weekFixtures: SimulatedFixture[],
): ReadonlyMap<string, number> {
  const ratingsByPlayerId = new Map<string, number>();
  for (const fixture of weekFixtures) {
    for (const [playerId, rating] of Object.entries(fixture.playerRatings ?? {})) {
      if (!ratingsByPlayerId.has(playerId)) {
        ratingsByPlayerId.set(playerId, rating.rating);
      }
    }
  }
  return ratingsByPlayerId;
}

export function processFormMomentum(
  state: GameState,
  weekFixtures: SimulatedFixture[],
): FormMomentumUpdate[] {
  const results: FormMomentumUpdate[] = [];
  const ratingsByPlayerId = createWeeklyPlayerRatingIndex(weekFixtures);

  for (const player of Object.values(state.players)) {
    const update = computeFormMomentum(
      player,
      ratingsByPlayerId.get(player.id),
    );
    if (!isFormMomentumUpdateNoOp(player, update)) {
      results.push(update);
    }
  }

  return results;
}

export function computeInjurySetback(
  player: Player,
  originalDuration: number,
  rng: RNG,
): InjurySetbackResult | null {
  if (originalDuration <= SERIOUS_INJURY_THRESHOLD) return null;

  const changes: AttributeDeltas = {};
  const physicalCandidates: PhysicalAttribute[] = ["pace", "stamina", "agility"];
  const shuffled = rng.shuffle(physicalCandidates);
  const count = rng.nextInt(1, 2);
  const selected = shuffled.slice(0, count);

  for (const attr of selected) {
    if (player.attributes[attr] > 1) {
      changes[attr] = -1;
    }
  }

  if (Object.keys(changes).length === 0) return null;

  return { playerId: player.id, changes };
}

function generateBreakthroughMessage(
  player: Player,
  breakthrough: BreakthroughResult,
  state: GameState,
  rng: RNG,
): InboxMessage {
  const attrNames = breakthrough.improvedAttributes
    .map((attribute) => attribute.replace(/([A-Z])/g, " $1").toLowerCase().trim())
    .join(" and ");

  return {
    id: makeMessageId("breakthrough", rng),
    week: state.currentWeek,
    season: state.currentSeason,
    type: "news",
    title: `Development Breakthrough: ${player.firstName} ${player.lastName}`,
    body: `${player.firstName} ${player.lastName} has shown remarkable improvement! Their ${attrNames} ${breakthrough.improvedAttributes.length > 1 ? "have" : "has"} significantly improved.`,
    read: false,
    actionRequired: false,
    relatedId: player.id,
  };
}

export function processPlayerDevelopment(
  state: GameState,
  rng: RNG,
  environmentIndex: DevelopmentEnvironmentIndex,
): {
  development: PlayerDevelopmentResult[];
  unsignedYouthDevelopment: PlayerDevelopmentResult[];
  breakthroughs: BreakthroughResult[];
  breakthroughMessages: InboxMessage[];
} {
  const development: PlayerDevelopmentResult[] = [];
  const unsignedYouthDevelopment: PlayerDevelopmentResult[] = [];
  const breakthroughs: BreakthroughResult[] = [];
  const breakthroughMessages: InboxMessage[] = [];
  const devRateMod = getDifficultyModifiers(state.difficulty).developmentRate;

  for (const player of Object.values(state.players)) {
    if (player.injuryWeeksRemaining > 6) continue;
    if (player.age > 35) continue;

    const environment = evaluatePlayerDevelopmentEnvironment(state, player, {
      index: environmentIndex,
    });
    const result: PlayerDevelopmentResult = {
      ...computeSemanticPlayerDevelopment(
        player,
        rng,
        devRateMod,
        environment.mechanics,
      ),
      environment: environment.projection,
    };

    const hasChanges =
      Object.keys(result.changes).length > 0 || result.abilityChange !== 0;

    if (hasChanges) {
      development.push(result);
    }

    const semanticBreakthrough = computeSemanticBreakthrough(
      player,
      rng,
      environment.mechanics.breakthroughMultiplier,
    );
    if (semanticBreakthrough) {
      const breakthrough: BreakthroughResult = {
        ...semanticBreakthrough,
        environment: environment.projection,
      };
      breakthroughs.push(breakthrough);
      breakthroughMessages.push(
        generateBreakthroughMessage(player, breakthrough, state, rng),
      );
    }
  }

  for (const youth of Object.values(state.unsignedYouth)) {
    if (youth.placed || youth.retired) continue;
    if (youth.player.injuryWeeksRemaining > 6) continue;
    const environment = evaluatePlayerDevelopmentEnvironment(state, youth.player, {
      index: environmentIndex,
    });
    const result: PlayerDevelopmentResult = {
      ...computeSemanticPlayerDevelopment(
        youth.player,
        rng,
        devRateMod * 0.75,
        environment.mechanics,
      ),
      environment: environment.projection,
    };
    if (Object.keys(result.changes).length > 0 || result.abilityChange !== 0) {
      unsignedYouthDevelopment.push(result);
    }
  }

  return {
    development,
    unsignedYouthDevelopment,
    breakthroughs,
    breakthroughMessages,
  };
}

function deriveSeverity(recoveryWeeks: number): InjurySeverity {
  if (recoveryWeeks <= 2) return "minor";
  if (recoveryWeeks <= 5) return "moderate";
  if (recoveryWeeks <= 10) return "serious";
  return "career-threatening";
}

function computeInjuryProbability(player: Player): number {
  if (player.injured) return 0;

  const proneness = player.attributes.injuryProneness ?? 10;
  const pronenessMultiplier = 0.5 + (proneness / 20) * 2;
  const historyProneness = player.injuryHistory?.injuryProneness ?? 0;
  const historyMultiplier = 1 + historyProneness;
  const reinjuryWindow = player.injuryHistory?.reinjuryWindowWeeksLeft ?? 0;
  const reinjuryMultiplier = reinjuryWindow > 0 ? 2.0 : 1.0;

  return BASE_INJURY_PROBABILITY * pronenessMultiplier * historyMultiplier * reinjuryMultiplier;
}

function generateInjuryObject(
  rng: RNG,
  player: Player,
  state: GameState,
): Injury {
  const injuryType = rng.pickWeighted(INJURY_TYPE_WEIGHTS);
  const [minWeeks, maxWeeks] = RECOVERY_RANGES[injuryType];
  const recoveryWeeks = rng.nextInt(minWeeks, maxWeeks);
  const severity = deriveSeverity(recoveryWeeks);

  return {
    id: generateId("inj", rng),
    playerId: player.id,
    type: injuryType,
    severity,
    recoveryWeeks,
    weeksRemaining: recoveryWeeks,
    reinjuryRisk: 0,
    occurredWeek: state.currentWeek,
    occurredSeason: state.currentSeason,
  };
}

export function addToInjuryHistory(
  player: Player,
  injury: Injury,
): InjuryHistory {
  const existing: InjuryHistory = player.injuryHistory ?? {
    playerId: player.id,
    injuries: [],
    totalWeeksMissed: 0,
    injuryProneness: 0,
    reinjuryWindowWeeksLeft: 0,
  };

  const newProneness = Math.min(0.5, existing.injuryProneness + 0.03);

  return {
    ...existing,
    injuries: [...existing.injuries, injury],
    totalWeeksMissed: existing.totalWeeksMissed + injury.recoveryWeeks,
    injuryProneness: newProneness,
    reinjuryWindowWeeksLeft: 0,
  };
}

export function processInjuries(
  state: GameState,
  rng: RNG,
): InjuryResult[] {
  const newInjuries: InjuryResult[] = [];

  for (const player of Object.values(state.players)) {
    const prob = computeInjuryProbability(player);
    if (prob > 0 && rng.chance(prob)) {
      const injury = generateInjuryObject(rng, player, state);
      newInjuries.push({
        playerId: player.id,
        weeksOut: injury.recoveryWeeks,
        injury,
      });
    }
  }

  return newInjuries;
}
