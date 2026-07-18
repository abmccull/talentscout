/**
 * Stateless support for the canonical weekly simulation. Keeping these
 * schedule, travel, quality, scenario, and scout-context calculations outside
 * the action factory makes both the interactive day flow and weekly commit
 * consume the same rules.
 */
import type {
  Activity,
  Contact,
  DayResult,
  GameState,
  Scout,
  WeekSchedule,
} from "@/engine/core/types";
import type { ActivityQualityResult, ActivityQualityTier } from "@/engine/core/activityQuality";
import type { ScenarioProgress } from "@/engine/scenarios";
import {
  type ActivityChoiceId,
  buildActivityInteractionState,
} from "@/engine/core/activityInteractions";
import {
  capActivityQualityForFatigue,
  getScheduledActivityInstances,
} from "@/engine/core/calendar";
import { rollActivityQuality } from "@/engine/core/activityQuality";
import { createRNG } from "@/engine/rng";
import { checkScenarioObjectives } from "@/engine/scenarios";
import { getScenarioById } from "@/engine/scenarios/scenarioSetup";
import { resolveInternationalAssignment } from "@/engine/world/internationalDeliverables";
import {
  deriveRegionalPresence,
  getForeignScoutingPenalty,
  getScoutHomeCountry as getScoutHome,
  isScoutAbroad,
} from "@/engine/world/index";
import { getContactCoverageCountry } from "@/engine/network/contacts";
import { countryKeyFromNationality, normalizeCountryKey } from "@/lib/country";
import { resolvePlayerEntity } from "@/lib/playerResolution";
import type { ScoutQualityData } from "@/engine/youth/venues";

export function humanizeIdentifier(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function pickRandomIds(
  rng: ReturnType<typeof createRNG>,
  pool: string[],
  count: number,
): string[] {
  const available = [...pool];
  const picked: string[] = [];

  while (picked.length < count && available.length > 0) {
    const index = rng.nextInt(0, available.length - 1);
    picked.push(available[index]);
    available.splice(index, 1);
  }

  return picked;
}

export function seedKnownPlayersForContact(
  rng: ReturnType<typeof createRNG>,
  contact: Contact,
  state: GameState,
): string[] {
  const knownCount = rng.nextInt(3, 7);
  const coverageCountry = getContactCoverageCountry(contact, getScoutHome(state.scout));
  const isYouthContact = new Set<Contact["type"]>([
    "academyCoach",
    "grassrootsOrganizer",
    "schoolCoach",
    "youthAgent",
    "academyDirector",
    "localScout",
  ]).has(contact.type) && state.scout.primarySpecialization === "youth";

  if (isYouthContact) {
    const youthPool = Object.values(state.unsignedYouth)
      .filter((youth) => !youth.placed && !youth.retired)
      .filter((youth) => !coverageCountry || youth.country === coverageCountry)
      .map((youth) => youth.id);
    return pickRandomIds(
      rng,
      youthPool.length > 0 ? youthPool : Object.keys(state.unsignedYouth),
      knownCount,
    );
  }

  const allPlayerIds = Object.keys(state.players);
  const seniorPool = coverageCountry
    ? allPlayerIds.filter((id) => {
        const player = state.players[id];
        const club = player ? state.clubs[player.clubId] : undefined;
        const league = club ? state.leagues[club.leagueId] : undefined;
        return league?.country === coverageCountry;
      })
    : [];

  return pickRandomIds(
    rng,
    seniorPool.length > 0 ? seniorPool : allPlayerIds,
    knownCount,
  );
}

type SimulationChoiceId = ActivityChoiceId;
export type CelebrationPayload = {
  tier: "minor" | "major" | "epic";
  title: string;
  description: string;
};

// Weekly scheduling and simulation helpers.

export function buildDaySpanInfo(
  schedule: WeekSchedule,
): Map<number, { totalDays: number; occurrenceIndex: number }> {
  const info = new Map<number, { totalDays: number; occurrenceIndex: number }>();
  for (const instance of getScheduledActivityInstances(schedule)) {
    const ordered = [...instance.slotIndexes].sort((a, b) => a - b);
    ordered.forEach((slotIndex, occurrenceIndex) => {
      info.set(slotIndex, {
        totalDays: ordered.length,
        occurrenceIndex,
      });
    });
  }
  return info;
}

export function processInternationalTravelLifecycle(state: GameState): GameState {
  const booking = state.scout.travelBooking;
  if (!booking) return state;

  const currentlyAbroad = isScoutAbroad(state.scout, state.currentWeek);

  if (!currentlyAbroad && !booking.isAbroad) {
    return state;
  }

  if (currentlyAbroad) {
    if (booking.isAbroad) return state;
    return {
      ...state,
      scout: {
        ...state.scout,
        travelBooking: {
          ...booking,
          isAbroad: true,
        },
      },
    };
  }

  const updatedState: GameState = {
    ...state,
    scout: {
      ...state.scout,
      travelBooking: undefined,
    },
  };

  const assignment = state.activeInternationalAssignment;
  return assignment
    ? resolveInternationalAssignment(updatedState, assignment)
    : updatedState;
}

export function buildDayInteraction(activity: Activity | null, careerPath?: import("@/engine/core/types").CareerPath): DayResult["interaction"] | undefined {
  return buildActivityInteractionState(activity, careerPath);
}

export function isQualityRelevantActivity(activity: Activity | null): activity is Activity {
  if (!activity) return false;
  return (
    activity.type !== "rest" &&
    activity.type !== "travel" &&
    activity.type !== "internationalTravel"
  );
}

function getQualityKey(activity: Activity, dayIndex: number): string {
  const base = activity.instanceId ?? activity.type;
  return `${base}-d${dayIndex}`;
}

export function rollDayActivityQuality(
  gameState: GameState,
  activity: Activity,
  dayIndex: number,
): ActivityQualityResult {
  const qualityRng = createRNG(
    `${gameState.seed}-quality-${gameState.currentWeek}-${gameState.currentSeason}-${getQualityKey(activity, dayIndex)}`,
  );
  return capActivityQualityForFatigue(
    rollActivityQuality(
      qualityRng,
      activity.type,
      gameState.scout,
      gameState.scout.careerPath,
    ),
    gameState.scout.fatigue,
  );
}

export function deriveScenarioState(
  state: GameState,
): {
  scenarioProgressUpdate: ScenarioProgress | null;
  scenarioOutcomeUpdate: "victory" | "failure" | null;
} {
  const scenarioId = state.activeScenarioId;
  if (!scenarioId) {
    return {
      scenarioProgressUpdate: null,
      scenarioOutcomeUpdate: null,
    };
  }

  const progress = checkScenarioObjectives(state, scenarioId);
  return {
    scenarioProgressUpdate: progress,
    scenarioOutcomeUpdate: progress.valid && progress.allRequiredComplete
      ? "victory"
      : progress.failed
        ? "failure"
        : null,
  };
}

export function derivePendingCelebration(
  previousState: GameState,
  nextState: GameState,
  scenarioOutcomeUpdate: "victory" | "failure" | null,
  newlyUnlocked: string[],
): CelebrationPayload | null {
  const prevDiscoveryIds = new Set(previousState.discoveryRecords.map((d) => d.playerId));
  const newDiscoveries = nextState.discoveryRecords.filter(
    (discovery) => !prevDiscoveryIds.has(discovery.playerId),
  );

  if (newDiscoveries.length > 0) {
    const first = newDiscoveries[0];
    const resolvedPlayer = first
      ? resolvePlayerEntity(nextState, first.playerId)?.player
      : undefined;
    const playerName = resolvedPlayer
      ? `${resolvedPlayer.firstName} ${resolvedPlayer.lastName}`
      : "a new prospect";
    return {
      tier: "minor",
      title: "Prospect File Opened",
      description: `You logged your first evidence on ${playerName}. It is a lead, not a verdict—follow up before making the call.`,
    };
  }

  if (nextState.scout.careerTier > previousState.scout.careerTier) {
    return {
      tier: "major",
      title: "Career Promotion!",
      description: `You've been promoted to Tier ${nextState.scout.careerTier}. New opportunities await.`,
    };
  }

  if (scenarioOutcomeUpdate === "victory") {
    const scenarioId = nextState.activeScenarioId;
    const victoryScenario = scenarioId ? getScenarioById(scenarioId) : undefined;
    return {
      tier: "major",
      title: "Scenario Complete!",
      description: victoryScenario
        ? `You completed "${victoryScenario.name}". All objectives achieved.`
        : "All scenario objectives achieved!",
    };
  }

  if (newlyUnlocked.length > 0) {
    return {
      tier: "minor",
      title: "New Tool Unlocked",
      description: `You unlocked a new scouting tool: ${newlyUnlocked[0]}.`,
    };
  }

  return null;
}



function tierFromMultiplier(multiplier: number): ActivityQualityTier {
  if (multiplier >= 1.8) return "exceptional";
  if (multiplier >= 1.25) return "excellent";
  if (multiplier >= 0.9) return "good";
  if (multiplier >= 0.6) return "average";
  return "poor";
}

export function aggregateQualityForType(
  activityType: Activity["type"],
  rolls: ActivityQualityResult[],
): ActivityQualityResult {
  const avgMultiplier =
    rolls.reduce((sum, roll) => sum + roll.multiplier, 0) / rolls.length;
  const totalDiscoveryModifier = rolls.reduce(
    (sum, roll) => sum + roll.discoveryModifier,
    0,
  );
  const tier = tierFromMultiplier(avgMultiplier);
  const firstNarrative = rolls[0]?.narrative ?? "";
  const combinedNarrative =
    rolls.length > 1
      ? `${firstNarrative} Across ${rolls.length} days, the outcomes varied.`
      : firstNarrative;

  return {
    activityType,
    tier,
    multiplier: avgMultiplier,
    narrative: combinedNarrative,
    discoveryModifier: totalDiscoveryModifier,
  };
}

export function isDayInteractionPending(dayResult: DayResult | undefined): boolean {
  if (!dayResult?.interaction) return false;
  return !dayResult.interaction.selectedOptionId;
}

export function getDayChoiceId(dayResult: DayResult | undefined): SimulationChoiceId | undefined {
  const selected = dayResult?.interaction?.selectedOptionId;
  if (selected === "scan" || selected === "focus" || selected === "network") {
    return selected;
  }
  return undefined;
}

function canonicalizeCountry(value?: string): string | undefined {
  return normalizeCountryKey(value);
}

function resolveScoutHomeCountry(
  scout: Scout,
  regionalKnowledge: GameState["regionalKnowledge"],
): string {
  const pinnedHomeCountry = canonicalizeCountry(scout.homeCountry);
  if (pinnedHomeCountry) return pinnedHomeCountry;

  for (const [key, reputation] of Object.entries(scout.countryReputations ?? {})) {
    const countryId = canonicalizeCountry(reputation.country) ?? canonicalizeCountry(key);
    if (countryId && reputation.familiarity >= 50) {
      return countryId;
    }
  }

  const nationalityCountry = countryKeyFromNationality(scout.nationality);
  if (nationalityCountry) {
    return nationalityCountry;
  }

  for (const [key, reputation] of Object.entries(scout.countryReputations ?? {})) {
    const countryId = canonicalizeCountry(reputation.country) ?? canonicalizeCountry(key);
    if (countryId) {
      return countryId;
    }
  }

  return (
    Object.keys(regionalKnowledge)
      .map((countryId) => canonicalizeCountry(countryId))
      .find((countryId): countryId is string => !!countryId)
    ?? "england"
  );
}

export function resolveScoutEffectiveCountry(
  scout: Scout,
  regionalKnowledge: GameState["regionalKnowledge"],
  currentWeek: number,
): string {
  const abroadCountry = isScoutAbroad(scout, currentWeek)
    ? canonicalizeCountry(scout.travelBooking?.destinationCountry)
    : undefined;

  return abroadCountry ?? resolveScoutHomeCountry(scout, regionalKnowledge);
}

export function buildScoutQualityData(
  scout: Scout,
  regionalKnowledge: GameState["regionalKnowledge"],
  countryKey?: string,
  presenceDiscoveryMultiplier = 1,
): ScoutQualityData {
  const knowledgeLevel = canonicalizeCountry(countryKey)
    ? (regionalKnowledge[canonicalizeCountry(countryKey)!]?.knowledgeLevel ?? 0)
    : 0;
  return {
    intuition: scout.attributes?.intuition ?? 10,
    regionalKnowledge: knowledgeLevel,
    specializationLevel: scout.specializationLevel ?? 0,
    isYouthSpecialist: scout.primarySpecialization === 'youth',
    presenceDiscoveryMultiplier,
  };
}

export function buildScoutQualityDataForState(
  state: GameState,
  countryKey?: string,
): ScoutQualityData {
  const presenceMultiplier = countryKey
    ? deriveRegionalPresence(state, countryKey).effects.discoveryMultiplier
      * (1 - getForeignScoutingPenalty(state.scout, countryKey))
    : 1;
  return buildScoutQualityData(
    state.scout,
    state.regionalKnowledge,
    countryKey,
    presenceMultiplier || 1,
  );
}
