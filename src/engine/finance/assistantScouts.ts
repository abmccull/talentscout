/**
 * Assistant Scout System (F14)
 *
 * Hire, assign, and manage assistant scouts who perform lower-quality
 * scouting observations while the player focuses on other tasks.
 *
 * All functions are pure — no mutation, no I/O.
 */

import type { RNG } from "@/engine/rng";
import type {
  GameState,
  AssistantScout,
  Observation,
  AttributeReading,
  PlayerAttribute,
} from "../core/types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** First names pool for randomly generated assistant scouts. */
const FIRST_NAMES = [
  "Marco", "James", "Carlos", "Pierre", "Erik",
  "Lucas", "Dmitri", "Kenji", "Rafael", "Andrei",
  "Thomas", "Yusuf", "Henrik", "Bruno", "Oscar",
  "Liam", "Noah", "Jorge", "Felix", "Samuel",
];

/** Last names pool for randomly generated assistant scouts. */
const LAST_NAMES = [
  "Silva", "Mueller", "Johnson", "Petrov", "Tanaka",
  "Fernandez", "Larsson", "Costa", "Ivanov", "Schmidt",
  "Williams", "Dubois", "Nakamura", "Rossi", "Andersen",
  "Park", "Garcia", "Moller", "Alves", "Kowalski",
];

/** Salary range by skill level band. */
const SALARY_BY_SKILL: Record<number, [number, number]> = {
  1: [50, 100],
  2: [75, 125],
  3: [100, 175],
  4: [150, 225],
  5: [200, 300],
  6: [275, 400],
  7: [350, 500],
  8: [450, 650],
  9: [600, 850],
  10: [800, 1200],
};

/** Maximum assistant scouts a player can hire. */
export const MAX_ASSISTANT_SCOUTS = 3;

/** Fatigue gained per week of active assignment. */
const WEEKLY_ASSIGNMENT_FATIGUE = 15;

/** Fatigue recovered per week when unassigned. */
const WEEKLY_REST_RECOVERY = 25;

/** Attributes that assistant scouts can observe (simplified set). */
const OBSERVABLE_ATTRIBUTES: PlayerAttribute[] = [
  "pace", "strength", "stamina", "passing", "shooting",
  "dribbling", "heading", "tackling", "positioning", "workRate",
];

// =============================================================================
// HIRE / FIRE
// =============================================================================

/**
 * Generate and hire a new assistant scout with randomized stats.
 * Returns updated GameState or null if max assistants reached or
 * insufficient funds for first week's salary.
 */
export function hireAssistantScout(
  rng: RNG,
  state: GameState,
): GameState | null {
  if (!state.finances) return null;

  const currentAssistants = state.assistantScouts ?? [];
  if (currentAssistants.length >= MAX_ASSISTANT_SCOUTS) return null;

  // Generate random skill 1-10, weighted toward 3-6
  const skillRoll = rng.nextFloat(0, 1);
  let skill: number;
  if (skillRoll < 0.1) skill = rng.nextInt(1, 2);
  else if (skillRoll < 0.7) skill = rng.nextInt(3, 6);
  else if (skillRoll < 0.9) skill = rng.nextInt(7, 8);
  else skill = rng.nextInt(9, 10);

  // Determine salary from skill band
  const salaryRange = SALARY_BY_SKILL[skill] ?? [100, 200];
  const salary = rng.nextInt(salaryRange[0], salaryRange[1]);

  // Check if player can afford at least 4 weeks of salary (one month)
  if (state.finances.balance < salary * 4) return null;

  const firstName = rng.pick(FIRST_NAMES);
  const lastName = rng.pick(LAST_NAMES);

  const assistant: AssistantScout = {
    id: `asst_${rng.nextInt(10000, 99999)}_${Date.now()}`,
    name: `${firstName} ${lastName}`,
    skill,
    salary,
    fatigue: 0,
    reportsCompleted: 0,
    morale: 70,
  };

  // Deduct signing bonus (first week salary)
  const transaction = {
    week: state.currentWeek,
    season: state.currentSeason,
    amount: -salary,
    description: `Hired assistant scout: ${assistant.name}`,
  };

  return {
    ...state,
    assistantScouts: [...currentAssistants, assistant],
    finances: {
      ...state.finances,
      balance: state.finances.balance - salary,
      transactions: [...state.finances.transactions, transaction],
    },
  };
}

/**
 * Fire an assistant scout by ID.
 * Returns updated GameState with the scout removed.
 */
export function fireAssistantScout(
  state: GameState,
  scoutId: string,
): GameState {
  const currentAssistants = state.assistantScouts ?? [];
  return {
    ...state,
    assistantScouts: currentAssistants.filter((s) => s.id !== scoutId),
  };
}

// =============================================================================
// ASSIGNMENT
// =============================================================================

/**
 * Assign an assistant scout to observe a specific player or scout a region.
 * Pass playerId to observe a player, or region for area scouting.
 * Returns updated GameState or null if the scout is not found.
 */
export function assignAssistantScout(
  state: GameState,
  scoutId: string,
  task: { playerId?: string; region?: string },
): GameState | null {
  const assistants = state.assistantScouts ?? [];
  const index = assistants.findIndex((s) => s.id === scoutId);
  if (index === -1) return null;

  const scout = assistants[index];
  const updated: AssistantScout = {
    ...scout,
    assignedPlayerId: task.playerId,
    assignedRegion: task.region,
  };

  const newAssistants = [...assistants];
  newAssistants[index] = updated;

  return {
    ...state,
    assistantScouts: newAssistants,
  };
}

/**
 * Unassign an assistant scout (clear their current task).
 */
export function unassignAssistantScout(
  state: GameState,
  scoutId: string,
): GameState | null {
  return assignAssistantScout(state, scoutId, {});
}

// =============================================================================
// WEEKLY PROCESSING
// =============================================================================

/**
 * Process one week of assistant scout activity.
 * - Assigned scouts generate lower-quality observations
 * - Scouts gain fatigue from assignments
 * - Unassigned scouts recover fatigue
 * - Morale adjusts based on workload, fatigue, and assignment status
 * - Skills grow (+0.1/week assigned, -0.05/week idle, capped 1-10)
 * - Low morale (< 30) sets a warning flag for the calling code
 * - Salary costs are deducted
 *
 * Returns updated GameState with new observations and financial changes.
 */
export function processAssistantScoutWeek(
  state: GameState,
  rng: RNG,
): GameState {
  const assistants = state.assistantScouts ?? [];
  if (assistants.length === 0) return state;
  if (!state.finances) return state;

  let totalSalary = 0;
  const newObservations: Record<string, Observation> = {};
  const updatedAssistants: AssistantScout[] = [];
  const messages: GameState["inbox"][number][] = [];

  for (const assistant of assistants) {
    totalSalary += assistant.salary;

    // Update fatigue
    let newFatigue = assistant.fatigue;
    if (assistant.assignedPlayerId || assistant.assignedRegion) {
      newFatigue = Math.min(100, newFatigue + WEEKLY_ASSIGNMENT_FATIGUE);
    } else {
      newFatigue = Math.max(0, newFatigue - WEEKLY_REST_RECOVERY);
    }

    // Generate observation if assigned to a specific player
    if (assistant.assignedPlayerId && newFatigue < 90) {
      const player = state.players[assistant.assignedPlayerId];
      if (player) {
        const obs = generateAssistantObservation(
          rng, assistant, player, state.currentWeek, state.currentSeason,
        );
        newObservations[obs.id] = obs;

        messages.push({
          id: `asst-obs-${assistant.id}-w${state.currentWeek}`,
          week: state.currentWeek,
          season: state.currentSeason,
          type: "feedback" as const,
          title: `Assistant Report: ${player.firstName} ${player.lastName}`,
          body: `${assistant.name} completed an observation of ${player.firstName} ${player.lastName} (${obs.attributeReadings.length} attributes noted).`,
          read: false,
          actionRequired: false,
          relatedId: player.id,
          relatedEntityType: "player" as const,
        });
      }
    }

    // Generate a region scouting message if assigned to region
    if (assistant.assignedRegion && newFatigue < 90) {
      messages.push({
        id: `asst-region-${assistant.id}-w${state.currentWeek}`,
        week: state.currentWeek,
        season: state.currentSeason,
        type: "feedback" as const,
        title: `Regional Scouting: ${assistant.assignedRegion}`,
        body: `${assistant.name} scouted the ${assistant.assignedRegion} region this week. Check the fixture list for any promising matches.`,
        read: false,
        actionRequired: false,
      });
    }

    // --- Morale Processing ---
    const isAssigned = !!(assistant.assignedPlayerId || assistant.assignedRegion);
    const didCompleteReport =
      !!(assistant.assignedPlayerId && newFatigue < 90 && state.players[assistant.assignedPlayerId]);

    let newMorale = assistant.morale ?? 70;

    if (didCompleteReport) {
      // Positive results: completing reports boosts morale
      newMorale += 1;
    }
    if (newFatigue > 80) {
      // Overworked penalty
      newMorale -= 2;
    }
    if (newFatigue < 30 && isAssigned) {
      // Well-rested and productive
      newMorale += 1;
    }
    if (!isAssigned) {
      // Feeling ignored — base decay when unassigned
      newMorale -= 1;
    }

    // Clamp morale to 0-100
    newMorale = Math.max(0, Math.min(100, newMorale));

    // --- Skill Growth ---
    let newSkill = assistant.skill;
    if (isAssigned) {
      // Gradual improvement from active work (cap at 10)
      newSkill = Math.min(10, newSkill + 0.1);
    } else {
      // Slight decay when idle (floor at 1)
      newSkill = Math.max(1, newSkill - 0.05);
    }

    // Low morale warning flag (< 30 = at risk of quitting)
    const lowMorale = newMorale < 30;

    // Send low morale warning message (only on the transition into low morale)
    if (lowMorale && !(assistant.morale !== undefined && assistant.morale < 30)) {
      messages.push({
        id: `asst-morale-${assistant.id}-w${state.currentWeek}`,
        week: state.currentWeek,
        season: state.currentSeason,
        type: "feedback" as const,
        title: `Low Morale: ${assistant.name}`,
        body: `${assistant.name} is unhappy and may consider leaving. Current morale: ${newMorale}/100.`,
        read: false,
        actionRequired: true,
      });
    }

    updatedAssistants.push({
      ...assistant,
      fatigue: newFatigue,
      skill: newSkill,
      morale: newMorale,
      lowMorale,
      reportsCompleted: assistant.reportsCompleted + (didCompleteReport ? 1 : 0),
    });
  }

  // Deduct salary costs
  const transaction = {
    week: state.currentWeek,
    season: state.currentSeason,
    amount: -totalSalary,
    description: `Assistant scout salaries (${assistants.length} scouts)`,
  };

  return {
    ...state,
    assistantScouts: updatedAssistants,
    observations: { ...state.observations, ...newObservations },
    inbox: [...state.inbox, ...messages],
    finances: {
      ...state.finances,
      balance: state.finances.balance - totalSalary,
      transactions: [...state.finances.transactions, transaction],
    },
  };
}

// =============================================================================
// OBSERVATION GENERATION
// =============================================================================

/**
 * Generate a lower-quality observation from an assistant scout.
 * Quality is reduced compared to the player's own observations:
 * - Fewer attributes observed (2-4 vs 4-7)
 * - Higher noise (less accurate readings)
 * - Lower confidence values
 */
function generateAssistantObservation(
  rng: RNG,
  assistant: AssistantScout,
  player: { id: string; firstName: string; lastName: string; attributes: Record<string, number>; form: number },
  currentWeek: number,
  currentSeason: number,
): Observation {
  // Determine number of attributes to observe (2-4, boosted by skill)
  const baseCount = 2;
  const skillBonus = Math.floor(assistant.skill / 4); // 0-2 extra from skill
  const attrCount = Math.min(
    OBSERVABLE_ATTRIBUTES.length,
    baseCount + skillBonus,
  );

  // Shuffle and pick attributes
  const shuffled = [...OBSERVABLE_ATTRIBUTES];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selected = shuffled.slice(0, attrCount);

  // Generate readings with noise inversely proportional to skill
  const noiseFactor = 1.5 - (assistant.skill * 0.08); // 1.42 (skill 1) to 0.70 (skill 10)
  const fatigueNoisePenalty = assistant.fatigue > 60 ? 0.3 : assistant.fatigue > 30 ? 0.1 : 0;
  const totalNoise = noiseFactor + fatigueNoisePenalty;

  const attributeReadings: AttributeReading[] = selected.map((attr) => {
    const trueValue = (player.attributes[attr] as number) ?? 10;
    const noise = rng.nextFloat(-3, 3) * totalNoise;
    const perceived = Math.round(Math.max(1, Math.min(20, trueValue + noise)));
    const confidence = Math.max(0.1, Math.min(0.9, 0.3 + (assistant.skill * 0.05) - fatigueNoisePenalty));

    return {
      attribute: attr,
      perceivedValue: perceived,
      confidence,
      observationCount: 1,
    };
  });

  return {
    id: `obs_asst_${assistant.id}_${currentWeek}_${rng.nextInt(1000, 9999)}`,
    playerId: player.id,
    scoutId: assistant.id,
    week: currentWeek,
    season: currentSeason,
    context: "liveMatch",
    attributeReadings,
    notes: [`Observed by assistant scout ${assistant.name} (skill ${assistant.skill}/10)`],
    flaggedMoments: [],
  };
}
