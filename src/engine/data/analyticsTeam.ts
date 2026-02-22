/**
 * Analytics department management — hire and manage NPC data analysts.
 *
 * Data analysts are passive workers assigned to monitor leagues.  Each week
 * they generate AnalystReport objects surfacing player highlights and anomalies.
 * Analyst quality and morale directly affect report value.
 *
 * Design notes:
 *  - Pure TypeScript: no React, no side effects, no mutation of inputs.
 *  - All randomness flows through the provided RNG instance.
 */

import type { RNG } from "@/engine/rng";
import type {
  DataAnalyst,
  AnalystReport,
  AnomalyFlag,
  League,
  Player,
} from "@/engine/core/types";

// =============================================================================
// NAME POOLS
// =============================================================================

const FIRST_NAMES = [
  "Adam", "Alex", "Ben", "Chris", "Daniel", "David", "Ed", "Ethan",
  "Finn", "George", "Harry", "Jack", "James", "Jamie", "Joe", "John",
  "Josh", "Liam", "Luke", "Mark", "Matt", "Max", "Mike", "Nathan",
  "Nick", "Oliver", "Oscar", "Paul", "Peter", "Phil", "Rob", "Ryan",
  "Sam", "Scott", "Sean", "Simon", "Steve", "Tim", "Tom", "Will",
  "Amelia", "Anna", "Beth", "Charlotte", "Chloe", "Clara", "Elena",
  "Emma", "Eva", "Grace", "Hannah", "Isabel", "Jessica", "Kate",
  "Laura", "Leah", "Lily", "Lucy", "Maria", "Maya", "Mia", "Natalie",
  "Olivia", "Rachel", "Rebecca", "Sara", "Sofia", "Sophie", "Zoe",
] as const;

const LAST_NAMES = [
  "Anderson", "Bailey", "Baker", "Barnes", "Bell", "Bennett", "Brown",
  "Campbell", "Carter", "Clark", "Clarke", "Cole", "Collins", "Cook",
  "Cooper", "Cox", "Davies", "Davis", "Dixon", "Edwards", "Evans",
  "Fisher", "Foster", "Fox", "Gibson", "Graham", "Gray", "Green",
  "Hall", "Harris", "Harrison", "Hart", "Harvey", "Hill", "Holmes",
  "Hughes", "Hunter", "Jackson", "James", "Johnson", "Jones", "Kelly",
  "King", "Lawrence", "Lee", "Lewis", "Martin", "Mason", "Miller",
  "Mills", "Mitchell", "Moore", "Morgan", "Morris", "Murphy", "Murray",
  "Nelson", "Newton", "Nicholson", "Owen", "Palmer", "Parker", "Patel",
  "Price", "Roberts", "Robinson", "Rogers", "Russell", "Scott", "Shaw",
  "Simpson", "Smith", "Stewart", "Stone", "Taylor", "Thomas", "Turner",
  "Walker", "Ward", "Watson", "White", "Williams", "Wilson", "Wood",
  "Wright", "Young",
] as const;

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Derive a composite performance score for a player.
 * Used for weighted selection in analyst reports.
 */
function playerCompositeScore(player: Player): number {
  const a = player.attributes;
  return (
    (a.shooting * 0.2 +
      a.passing * 0.15 +
      a.dribbling * 0.1 +
      a.defensiveAwareness * 0.1 +
      a.composure * 0.1 +
      a.positioning * 0.1 +
      a.pace * 0.05 +
      a.strength * 0.05 +
      a.workRate * 0.05 +
      a.decisionMaking * 0.1) *
    (player.currentAbility / 100)
  );
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Generate a random data analyst candidate.
 *
 * Skill is sampled from a gaussian centred at 8 with std 3, clamped to 1–20.
 * Salary is proportional to skill: 50 + skill * 30 per week.
 *
 * @param rng    - Shared RNG instance.
 * @param season - Current season (used for unique ID generation seed component).
 * @param idSeed - Unique string to distinguish this candidate's ID.
 */
export function generateAnalystCandidate(
  rng: RNG,
  season: number,
  idSeed: string,
): DataAnalyst {
  const skill = clamp(Math.round(rng.gaussian(8, 3)), 1, 20);
  const salary = 50 + skill * 30;

  const focuses: DataAnalyst["focus"][] = [
    "general",
    "youth",
    "undervalued",
    "formPlayers",
  ];
  const focus = rng.pick(focuses);

  const firstName = rng.pick(FIRST_NAMES);
  const lastName = rng.pick(LAST_NAMES);

  return {
    id: `analyst_${season}_${idSeed}`,
    name: `${firstName} ${lastName}`,
    skill,
    assignedLeagueId: undefined,
    focus,
    salary,
    tenure: 0,
    morale: 70,
  };
}

/**
 * Generate a passive weekly report from an assigned data analyst.
 *
 * Quality is derived from: analyst.skill * 4 + gaussian(0, 5), clamped 0–100,
 * then modulated by morale (quality *= 0.5 + morale/200).
 *
 * Number of highlighted players: 1 + floor(quality / 25).
 * Anomaly detection: analyst.skill / 20 chance per player.
 *
 * Focus affects player selection:
 *  - "youth":        prioritise age < 21
 *  - "undervalued":  prioritise high PA-to-CA ratio players
 *  - "formPlayers":  prioritise |form| > 1
 *  - "general":      random selection weighted by composite CA score
 *
 * @param rng        - Shared RNG instance.
 * @param analyst    - The analyst generating the report.
 * @param league     - The league being monitored.
 * @param allPlayers - All players in the game world.
 * @param season     - Current season.
 * @param week       - Current week.
 * @param reportId   - Unique ID for the generated report.
 */
export function generateAnalystReport(
  rng: RNG,
  analyst: DataAnalyst,
  league: League,
  allPlayers: Record<string, Player>,
  season: number,
  week: number,
  reportId: string,
): AnalystReport {
  // Base quality from skill
  const rawQuality = analyst.skill * 4 + rng.gaussian(0, 5);
  // Morale modifier: quality *= 0.5 + morale/200 → [0.5, 1.0]
  const moraleMultiplier = 0.5 + analyst.morale / 200;
  const quality = clamp(Math.round(rawQuality * moraleMultiplier), 0, 100);

  const leagueClubIds = new Set(league.clubIds);
  const leaguePlayers = Object.values(allPlayers).filter((p) =>
    leagueClubIds.has(p.clubId),
  );

  if (leaguePlayers.length === 0) {
    return {
      id: reportId,
      analystId: analyst.id,
      leagueId: league.id,
      highlightedPlayerIds: [],
      anomalies: [],
      quality,
      week,
      season,
    };
  }

  // Select highlighted players based on focus
  const highlightCount = clamp(1 + Math.floor(quality / 25), 1, 5);
  let highlightedPlayers: Player[];

  switch (analyst.focus) {
    case "youth": {
      const youthPlayers = leaguePlayers.filter((p) => p.age < 21);
      if (youthPlayers.length === 0) {
        // Fall back to general weighted selection
        highlightedPlayers = selectByWeight(rng, leaguePlayers, highlightCount);
      } else {
        highlightedPlayers = rng
          .shuffle(youthPlayers)
          .slice(0, highlightCount);
      }
      break;
    }

    case "undervalued": {
      // Sort by PA-to-CA ratio (high ratio = lots of room to grow)
      const withRatio = leaguePlayers.map((p) => ({
        player: p,
        ratio:
          p.potentialAbility / Math.max(1, p.currentAbility),
      }));
      withRatio.sort((a, b) => b.ratio - a.ratio);
      highlightedPlayers = withRatio
        .slice(0, highlightCount * 3) // take top candidates
        .map((w) => w.player);
      // Shuffle the top slice slightly for variety
      highlightedPlayers = rng
        .shuffle(highlightedPlayers)
        .slice(0, highlightCount);
      break;
    }

    case "formPlayers": {
      const inFormPlayers = leaguePlayers.filter(
        (p) => Math.abs(p.form) > 1,
      );
      if (inFormPlayers.length === 0) {
        highlightedPlayers = selectByWeight(rng, leaguePlayers, highlightCount);
      } else {
        highlightedPlayers = rng
          .shuffle(inFormPlayers)
          .slice(0, highlightCount);
      }
      break;
    }

    case "general":
    default: {
      highlightedPlayers = selectByWeight(rng, leaguePlayers, highlightCount);
      break;
    }
  }

  // Anomaly detection — each player in the league has a skill/20 chance of
  // being flagged as an anomaly (outlier performance relative to peers)
  const anomalies: AnomalyFlag[] = [];
  const anomalyChance = analyst.skill / 20;

  // Shuffle all league players to avoid deterministic ordering bias
  const shuffledPlayers = rng.shuffle(leaguePlayers);

  for (const player of shuffledPlayers) {
    if (!rng.chance(anomalyChance)) continue;

    // Determine anomaly direction via form as a simple proxy
    const direction: "positive" | "negative" =
      player.form >= 0 ? "positive" : "negative";
    const severity =
      Math.round((Math.abs(player.form) * 0.8 + rng.nextFloat(0.2, 1.0)) * 10) /
      10;

    anomalies.push({
      id: `anomaly_${reportId}_${player.id}`,
      playerId: player.id,
      stat: direction === "positive" ? "goals" : "passCompletion",
      direction,
      severity: clamp(severity, 0.5, 4.0),
      description:
        direction === "positive"
          ? `${player.firstName} ${player.lastName} is significantly outperforming statistical expectations this period.`
          : `${player.firstName} ${player.lastName} is showing a concerning statistical dip relative to league peers.`,
      investigated: false,
      week,
      season,
    });

    // Cap anomaly count at roughly quality / 30 to keep reports focused
    if (anomalies.length >= Math.max(1, Math.floor(quality / 30))) break;
  }

  return {
    id: reportId,
    analystId: analyst.id,
    leagueId: league.id,
    highlightedPlayerIds: highlightedPlayers.map((p) => p.id),
    anomalies,
    quality,
    week,
    season,
  };
}

/**
 * Update an analyst's morale based on player actions this week.
 *
 * Changes applied:
 *  - hadMeeting (+5): scout held a team meeting with the analyst
 *  - usedReport (+3): scout reviewed and acted on the analyst's report
 *  - ignored  (-5):   report was not reviewed this week
 *  - natural decay:  -1 per week regardless
 *
 * Morale is clamped to [0, 100].  Returns a new DataAnalyst object.
 *
 * @param analyst - Current analyst state.
 * @param actions - Actions taken this week that affect morale.
 */
export function updateAnalystMorale(
  analyst: DataAnalyst,
  actions: {
    hadMeeting?: boolean;
    usedReport?: boolean;
    ignored?: boolean;
  },
): DataAnalyst {
  let moraleDelta = -1; // natural weekly decay

  if (actions.hadMeeting) moraleDelta += 5;
  if (actions.usedReport) moraleDelta += 3;
  if (actions.ignored) moraleDelta -= 5;

  const newMorale = clamp(analyst.morale + moraleDelta, 0, 100);

  return {
    ...analyst,
    morale: newMorale,
  };
}

/**
 * Calculate the total weekly salary cost for a list of analysts.
 *
 * @param analysts - Array of employed data analysts.
 */
export function getAnalystSalaryCost(analysts: DataAnalyst[]): number {
  return analysts.reduce((sum, analyst) => sum + analyst.salary, 0);
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Select `count` players from a pool using composite CA-weighted random sampling.
 * Higher-CA players are more likely to be highlighted in a "general" focus report.
 */
function selectByWeight(
  rng: RNG,
  players: Player[],
  count: number,
): Player[] {
  if (players.length === 0) return [];

  const selected: Player[] = [];
  const remaining = players.slice();

  const actualCount = Math.min(count, remaining.length);

  for (let i = 0; i < actualCount; i++) {
    const items = remaining.map((p) => ({
      item: p,
      weight: Math.max(0.1, playerCompositeScore(p)),
    }));
    const picked = rng.pickWeighted(items);
    selected.push(picked);
    // Remove picked player from remaining pool
    const idx = remaining.findIndex((p) => p.id === picked.id);
    if (idx !== -1) {
      remaining.splice(idx, 1);
    }
  }

  return selected;
}
