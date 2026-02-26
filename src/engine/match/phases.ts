/**
 * Match Phase Generator
 *
 * Produces text-based observation experience. A match has 12-18 phases,
 * each containing 2-4 events that reveal specific player attributes.
 *
 * Commentary is now generated via the enhanced commentary engine, which
 * provides position-aware, form-aware, and scouting-relevant descriptions.
 */

import { type RNG } from "@/engine/rng";
import {
  type Fixture,
  type Weather,
  type Player,
  type Club,
  type MatchPhase,
  type MatchPhaseType,
  type MatchEvent,
  type MatchEventType,
  type PlayerAttribute,
  type Position,
  type SetPieceVariant,
  type TacticalMatchup,
} from "@/engine/core/types";
import { generateCommentary } from "./commentary";
import { applyTacticalModifiers, getTacticalQualityModifier } from "./tactics";

export interface MatchContext {
  fixture: Fixture;
  homePlayers: Player[];
  awayPlayers: Player[];
  weather: Weather;
  /** IDs of players the scout is specifically focusing on this match. */
  scoutedPlayerIds?: string[];
  /** Tactical matchup between home and away styles (from F5). */
  tacticalMatchup?: TacticalMatchup;
}

// ---------------------------------------------------------------------------
// Attribute mapping — which attributes each event type reveals
// ---------------------------------------------------------------------------

export const EVENT_REVEALED: Record<MatchEventType, PlayerAttribute[]> = {
  goal:         ["finishing", "composure"],
  assist:       ["passing", "vision"],
  shot:         ["shooting", "composure"],
  pass:         ["passing", "teamwork"],
  dribble:      ["dribbling", "balance"],
  tackle:       ["tackling", "anticipation"],
  header:       ["heading", "jumping"],
  save:         ["composure", "positioning"],
  foul:         ["composure", "pressing"],
  cross:        ["crossing", "vision"],
  sprint:       ["pace", "stamina"],
  positioning:  ["positioning", "anticipation"],
  error:        ["composure", "decisionMaking"],
  leadership:   ["leadership", "teamwork"],
  aerialDuel:   ["jumping", "heading", "strength"],
  interception: ["anticipation", "marking", "positioning"],
  throughBall:  ["vision", "passing", "decisionMaking"],
  holdUp:       ["balance", "strength", "firstTouch"],
  injury:       ["stamina", "strength"],
  substitution: [],
  card:         ["composure"],
};

const PHASE_EVENT_WEIGHTS: Record<MatchPhaseType, Partial<Record<MatchEventType, number>>> = {
  buildUp:          { pass: 5, positioning: 3, dribble: 2, cross: 2, throughBall: 2, leadership: 1, holdUp: 1 },
  transition:       { sprint: 5, pass: 4, dribble: 3, tackle: 3, shot: 2, error: 2, interception: 2 },
  setpiece:         { header: 4, aerialDuel: 4, shot: 4, cross: 3, tackle: 2, goal: 1 },
  pressingSequence: { tackle: 5, interception: 4, sprint: 4, pass: 3, error: 3, positioning: 2, leadership: 1 },
  counterAttack:    { sprint: 5, dribble: 4, pass: 3, shot: 3, goal: 2, throughBall: 2, cross: 1 },
  possession:       { pass: 5, positioning: 5, throughBall: 3, dribble: 2, cross: 2, holdUp: 1, leadership: 1 },
};

const WEATHER_NOISE: Record<Weather, number> = {
  clear: 0.8,
  cloudy: 1.0,
  rain: 1.2,
  heavyRain: 1.6,
  snow: 1.8,
  windy: 1.4,
};

// ---------------------------------------------------------------------------
// Position eligibility — which positions can realistically perform each event
// ---------------------------------------------------------------------------

const EVENT_ELIGIBLE_POSITIONS: Record<MatchEventType, readonly Position[]> = {
  goal:         ["ST", "LW", "RW", "CAM", "CM", "CDM", "CB", "LB", "RB"],
  assist:       ["CAM", "CM", "LW", "RW", "ST", "LB", "RB", "CDM", "CB"],
  shot:         ["ST", "LW", "RW", "CAM", "CM", "CDM", "CB", "LB", "RB"],
  pass:         ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"],
  dribble:      ["LW", "RW", "ST", "CAM", "CM", "LB", "RB"],
  tackle:       ["CB", "LB", "RB", "CDM", "CM"],
  header:       ["CB", "ST", "CDM", "CM", "CAM", "LB", "RB"],
  save:         ["GK"],
  foul:         ["CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"],
  cross:        ["LB", "RB", "LW", "RW", "CM"],
  sprint:       ["LW", "RW", "ST", "CAM", "CM", "CDM", "CB", "LB", "RB"],
  positioning:  ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"],
  error:        ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"],
  leadership:   ["GK", "CB", "CDM", "CM", "CAM", "ST"],
  aerialDuel:   ["CB", "ST", "CDM", "CM", "CAM", "LB", "RB", "LW", "RW"],
  interception: ["CB", "LB", "RB", "CDM", "CM", "CAM"],
  throughBall:  ["CAM", "CM", "CDM", "LW", "RW", "ST"],
  holdUp:       ["ST", "LW", "RW", "CAM"],
  injury:       ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"],
  substitution: ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"],
  card:         ["CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"],
};

const PHASE_DESCRIPTIONS: Record<MatchPhaseType, string[]> = {
  buildUp: [
    "Patient build-up play from the back. The ball is recycled carefully through midfield.",
    "Slow, deliberate possession — probing for an opening in the defensive block.",
    "Short passing triangles through the thirds as the side craft something in tight spaces.",
  ],
  transition: [
    "The ball turns over and both sides are fully committed in transition.",
    "A rapid switch from defence to attack catches the opposition disorganised.",
    "Counter-pressing in midfield leads to a breathless exchange of possession.",
  ],
  setpiece: [
    "A foul on the edge of the box. The wall forms. Every player jockeys for position.",
    "Corner kick. Both penalty areas are packed.",
    "Free kick from a dangerous position — players flood into the box.",
  ],
  pressingSequence: [
    "Relentless high press. The back line is under immense pressure.",
    "A co-ordinated pressing trap — every player hunts in pairs to win the ball high.",
    "Suffocating press. The passing options are cut off one by one.",
  ],
  counterAttack: [
    "The ball is won and the attacking line is set in motion — a counter!",
    "Numbers up on the break. Three attackers against two defenders.",
    "Fast, direct football. The transition takes six seconds.",
  ],
  possession: [
    "Comfortable possession. The side moves the opposition from side to side.",
    "Patient dominance. The ball barely leaves the ground.",
    "Controlled without being incisive. Probing systematically for gaps.",
  ],
};

// ---------------------------------------------------------------------------
// 4c. Set piece variants
// ---------------------------------------------------------------------------

const SET_PIECE_VARIANT_POOL: SetPieceVariant[] = [
  "corner", "corner", "corner",
  "freeKick", "freeKick", "freeKick",
  "penalty",
  "throwIn", "throwIn",
];

const SET_PIECE_DESCRIPTIONS: Record<SetPieceVariant, string[]> = {
  corner: [
    "Corner kick. The box fills with bodies \u2014 every set piece is a chance.",
    "In-swinging corner from the right. Six players attack the near post.",
    "Short corner routine \u2014 a rehearsed move from the training ground.",
  ],
  freeKick: [
    "Free kick from 25 yards. The wall lines up nervously.",
    "A dead-ball specialist stands over this one. The crowd holds its breath.",
    "Free kick in a dangerous position \u2014 just outside the box, central.",
  ],
  penalty: [
    "PENALTY! The referee points to the spot. A huge moment in this match.",
    "A penalty kick \u2014 the defender's challenge was reckless and the decision looks correct.",
    "Penalty awarded. The taker places the ball on the spot. Silence falls.",
  ],
  throwIn: [
    "Long throw into the danger area \u2014 this side have made this a weapon.",
    "A long throw from deep. The goalkeeper looks uncertain about coming for it.",
    "Throw-in close to the corner flag \u2014 practically a set piece.",
  ],
};

const SET_PIECE_EVENT_WEIGHTS: Record<SetPieceVariant, Partial<Record<MatchEventType, number>>> = {
  corner:  { header: 7, shot: 3, cross: 2, goal: 2, tackle: 1 },
  freeKick: { shot: 7, cross: 3, goal: 2, header: 2, save: 1 },
  penalty: { goal: 7, save: 3 },
  throwIn: { header: 5, tackle: 3, positioning: 3, cross: 2, shot: 1 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickEventType(rng: RNG, phaseType: MatchPhaseType): MatchEventType {
  const weights = PHASE_EVENT_WEIGHTS[phaseType];
  const items = (Object.entries(weights) as [MatchEventType, number][])
    .filter(([, w]) => w > 0)
    .map(([type, weight]) => ({ item: type, weight }));
  return rng.pickWeighted(items);
}

function computeEventQuality(
  rng: RNG,
  player: Player,
  revealed: PlayerAttribute[],
  weather: Weather,
): number {
  const vals = revealed.map((attr) => player.attributes[attr] ?? 10);
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  const base = (avg / 20) * 10;
  const noisy = rng.gaussian(base, 0.8 * WEATHER_NOISE[weather]);
  return Math.min(10, Math.max(1, Math.round(noisy)));
}

function selectInvolvedPlayers(
  rng: RNG,
  homePlayers: Player[],
  awayPlayers: Player[],
): string[] {
  const count = rng.nextInt(3, 6);
  const all = [...homePlayers, ...awayPlayers];
  const selected = new Set<string>();

  // Weight GKs much lower — they're rarely the focus of general play
  const pool = all.map((p) => ({
    item: p,
    weight: p.position === "GK" ? 1 : 10,
  }));

  for (let i = 0; i < count && selected.size < all.length; i++) {
    const remaining = pool.filter((w) => !selected.has(w.item.id));
    if (remaining.length === 0) break;
    const pick = rng.pickWeighted(remaining);
    selected.add(pick.id);
  }

  return [...selected];
}

/**
 * Select a player whose position is eligible for the given event type.
 * Tries involved players first, then falls back to any eligible player.
 */
function pickEligiblePlayer(
  rng: RNG,
  eventType: MatchEventType,
  involved: Player[],
  allPlayers: Map<string, Player>,
): Player {
  const eligible = new Set(EVENT_ELIGIBLE_POSITIONS[eventType]);

  // Try involved players whose position fits
  const eligibleInvolved = involved.filter((p) => eligible.has(p.position));
  if (eligibleInvolved.length > 0) return rng.pick(eligibleInvolved);

  // Fall back to any eligible player in the match
  const allEligible = [...allPlayers.values()].filter((p) => eligible.has(p.position));
  if (allEligible.length > 0) return rng.pick(allEligible);

  // Last resort: any involved player
  return involved.length > 0 ? rng.pick(involved) : rng.pick([...allPlayers.values()]);
}

// Collect observable attributes for a phase from its events
function collectObservableAttributes(events: MatchEvent[]): PlayerAttribute[] {
  const set = new Set<PlayerAttribute>();
  for (const e of events) {
    for (const a of e.attributesRevealed) set.add(a);
  }
  return Array.from(set);
}

// ---------------------------------------------------------------------------
// Tactical phase pool — bias phase types based on matchup styles
// ---------------------------------------------------------------------------

/**
 * Build a phase type pool biased by the tactical matchup.
 * Without a matchup, returns the default balanced pool.
 *
 * Tactical biases:
 *  - highPress increases pressingSequence and transition phases
 *  - possessionBased increases possession and buildUp phases
 *  - counterAttacking increases counterAttack and transition phases
 *  - directPlay increases setpiece and transition phases
 *  - wingPlay increases buildUp and counterAttack phases
 */
function buildTacticalPhasePool(matchup?: TacticalMatchup): MatchPhaseType[] {
  // Default pool with no tactical bias
  const defaultPool: MatchPhaseType[] = [
    "buildUp", "buildUp", "buildUp",
    "transition", "transition",
    "setpiece", "setpiece",
    "pressingSequence", "pressingSequence",
    "counterAttack", "counterAttack",
    "possession", "possession", "possession",
  ];

  if (!matchup) return defaultPool;

  // Start with the default pool, then add extra entries based on styles
  const pool = [...defaultPool];

  const addPhases = (style: string) => {
    switch (style) {
      case "highPress":
        pool.push("pressingSequence", "pressingSequence", "transition");
        break;
      case "possessionBased":
        pool.push("possession", "possession", "buildUp");
        break;
      case "counterAttacking":
        pool.push("counterAttack", "counterAttack", "transition");
        break;
      case "directPlay":
        pool.push("setpiece", "transition", "counterAttack");
        break;
      case "wingPlay":
        pool.push("buildUp", "counterAttack", "transition");
        break;
      // balanced adds nothing extra
    }
  };

  addPhases(matchup.homeStyle);
  addPhases(matchup.awayStyle);

  return pool;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateMatchPhases(rng: RNG, context: MatchContext): MatchPhase[] {
  const { fixture, homePlayers, awayPlayers, weather, scoutedPlayerIds, tacticalMatchup } = context;
  const phaseCount = rng.nextInt(12, 18);

  const scoutedSet = new Set(scoutedPlayerIds ?? []);

  // Build home player ID set for tactical modifier lookups
  const homePlayerIds = new Set(homePlayers.map((p) => p.id));

  const step = Math.floor(90 / phaseCount);
  const startMinutes: number[] = [];
  for (let i = 0; i < phaseCount; i++) {
    const base = i * step + 1;
    const jitter = rng.nextInt(0, Math.max(1, step - 2));
    startMinutes.push(Math.min(89, base + jitter));
  }
  startMinutes.sort((a, b) => a - b);

  const allPlayers = new Map<string, Player>();
  for (const p of [...homePlayers, ...awayPlayers]) {
    allPlayers.set(p.id, p);
  }

  // Build tactical phase type pool — tactical styles bias which phases appear
  const phaseTypePool: MatchPhaseType[] = buildTacticalPhasePool(tacticalMatchup);

  const phases: MatchPhase[] = [];

  // Track recent event qualities for momentum computation
  const recentQualities: number[] = [];

  for (let i = 0; i < phaseCount; i++) {
    const minute = startMinutes[i];
    const endMinute = i < phaseCount - 1 ? startMinutes[i + 1] - 1 : 90;
    const phaseType = rng.pick(phaseTypePool);
    const involvedPlayerIds = selectInvolvedPlayers(rng, homePlayers, awayPlayers);

    // Set piece variant selection
    let setPieceVariant: SetPieceVariant | undefined;
    if (phaseType === "setpiece") {
      setPieceVariant = rng.pick(SET_PIECE_VARIANT_POOL);
    }

    // Use variant-specific event weights for set pieces, then apply tactical modifiers
    const baseWeights = setPieceVariant
      ? SET_PIECE_EVENT_WEIGHTS[setPieceVariant]
      : PHASE_EVENT_WEIGHTS[phaseType];

    // Apply tactical modifiers if matchup exists and not a set piece (set pieces are style-neutral)
    const effectiveWeights = (tacticalMatchup && !setPieceVariant)
      ? applyTacticalModifiers(baseWeights, tacticalMatchup, "home")
      : baseWeights;

    // Penalties have fewer events
    const eventCount = setPieceVariant === "penalty" ? 1 : rng.nextInt(2, 4);
    const events: MatchEvent[] = [];

    for (let e = 0; e < eventCount; e++) {
      // Use effective weights for event type selection
      const weightItems = (Object.entries(effectiveWeights) as [MatchEventType, number][])
        .filter(([, w]) => w > 0)
        .map(([type, weight]) => ({ item: type, weight }));
      const eventType = rng.pickWeighted(weightItems);
      const revealed = EVENT_REVEALED[eventType];

      const involved = involvedPlayerIds
        .map((id) => allPlayers.get(id))
        .filter((p): p is Player => !!p);

      const primary = pickEligiblePlayer(rng, eventType, involved, allPlayers);
      const secondary = involved.find((p) => p.id !== primary.id);

      const phaseWidth = Math.max(1, endMinute - minute);
      const eventMinute = minute + Math.floor((phaseWidth / eventCount) * e);

      // Compute base quality, then apply tactical matchup modifier
      let quality = computeEventQuality(rng, primary, revealed, weather);
      if (tacticalMatchup) {
        const tacticalBonus = getTacticalQualityModifier(
          tacticalMatchup,
          primary.id,
          homePlayerIds,
        );
        quality = Math.min(10, Math.max(1, Math.round(quality + tacticalBonus)));
      }
      recentQualities.push(quality);

      // Generate position-aware, form-aware, scouting-relevant commentary
      const description = generateCommentary({
        eventType,
        minute: eventMinute,
        playerName: `${primary.firstName} ${primary.lastName}`,
        position: primary.position,
        form: primary.form,
        isScoutingTarget: scoutedSet.has(primary.id),
        secondaryName: secondary
          ? `${secondary.firstName} ${secondary.lastName}`
          : undefined,
      });

      events.push({
        type: eventType,
        playerId: primary.id,
        attributesRevealed: revealed,
        quality,
        description,
        minute: eventMinute,
      });

      // Match injury check: sprint and tackle events can cause injuries (~3% per event)
      const INJURY_TRIGGER_EVENTS: MatchEventType[] = ["sprint", "tackle", "aerialDuel", "foul"];
      if (INJURY_TRIGGER_EVENTS.includes(eventType) && rng.chance(0.03)) {
        const injuredPlayer = primary;
        const injMinute = Math.min(90, eventMinute + 1);
        const injName = `${injuredPlayer.firstName} ${injuredPlayer.lastName}`;

        const injDescription = generateCommentary({
          eventType: "injury",
          minute: injMinute,
          playerName: injName,
          position: injuredPlayer.position,
          form: injuredPlayer.form,
          isScoutingTarget: scoutedSet.has(injuredPlayer.id),
        });

        events.push({
          type: "injury",
          playerId: injuredPlayer.id,
          attributesRevealed: EVENT_REVEALED.injury,
          quality: 1,
          description: injDescription,
          minute: injMinute,
        });

        // Follow up with substitution event
        const subMinute = Math.min(90, injMinute + 1);
        const subDescription = generateCommentary({
          eventType: "substitution",
          minute: subMinute,
          playerName: injName,
          position: injuredPlayer.position,
          form: injuredPlayer.form,
          isScoutingTarget: scoutedSet.has(injuredPlayer.id),
        });

        events.push({
          type: "substitution",
          playerId: injuredPlayer.id,
          attributesRevealed: [],
          quality: 1,
          description: subDescription,
          minute: subMinute,
        });
      }
    }

    // Compute momentum from recent event qualities (last ~8 events)
    const recentSlice = recentQualities.slice(-8);
    const avgQuality = recentSlice.length > 0
      ? recentSlice.reduce((s, v) => s + v, 0) / recentSlice.length
      : 5;
    const momentum = Math.round(Math.min(100, Math.max(0, (avgQuality / 10) * 100)));

    // Use variant-specific description for set pieces
    const phaseDescription = setPieceVariant
      ? rng.pick(SET_PIECE_DESCRIPTIONS[setPieceVariant])
      : rng.pick(PHASE_DESCRIPTIONS[phaseType]);

    phases.push({
      minute,
      type: phaseType,
      description: phaseDescription,
      involvedPlayerIds,
      events,
      observableAttributes: collectObservableAttributes(events),
      momentum,
      setPieceVariant,
    });
  }

  void fixture.id;
  return phases;
}

// ---------------------------------------------------------------------------
// Match result simulation
// ---------------------------------------------------------------------------

export function simulateMatchResult(
  rng: RNG,
  home: Club,
  away: Club,
  homePlayers: Player[],
  awayPlayers: Player[],
): {
  homeGoals: number;
  awayGoals: number;
  scorers: { playerId: string; minute: number }[];
} {
  const avgCA = (players: Player[]): number => {
    if (players.length === 0) return 100;
    return players.reduce((sum, p) => sum + p.currentAbility, 0) / players.length;
  };

  const homeCA = avgCA(homePlayers);
  const awayCA = avgCA(awayPlayers);
  const effectiveHome = homeCA * 1.08;
  const homeShare = effectiveHome / (effectiveHome + awayCA);
  const totalExpected = Math.max(0, rng.gaussian(2.7, 1.1));

  const sampleGoals = (lambda: number): number => {
    const raw = rng.gaussian(lambda, Math.sqrt(lambda + 0.5));
    return Math.min(6, Math.max(0, Math.round(raw)));
  };

  const homeGoals = sampleGoals(totalExpected * homeShare);
  const awayGoals = sampleGoals(totalExpected * (1 - homeShare));

  const ATTACKING = new Set(["ST", "LW", "RW", "CAM"]);

  const pickScorers = (players: Player[], count: number) => {
    if (players.length === 0 || count === 0) return [];
    const weighted = players.map((p) => ({
      item: p.id,
      weight: Math.max(
        1,
        (p.attributes.shooting ?? 10) * 0.4
          + (p.attributes.finishing ?? 10) * 0.6
          + (ATTACKING.has(p.position) ? 3 : 0),
      ),
    }));
    const used = new Set<number>();
    return Array.from({ length: count }, () => {
      const playerId = rng.pickWeighted(weighted);
      let minute: number;
      do { minute = rng.nextInt(1, 90); } while (used.has(minute));
      used.add(minute);
      return { playerId, minute };
    }).sort((a, b) => a.minute - b.minute);
  };

  void home.reputation;
  void away.reputation;

  return {
    homeGoals,
    awayGoals,
    scorers: [...pickScorers(homePlayers, homeGoals), ...pickScorers(awayPlayers, awayGoals)],
  };
}
