/**
 * Match Phase Generator
 *
 * Produces text-based observation experience. A match has 12–18 phases,
 * each containing 2–4 events that reveal specific player attributes.
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
} from "@/engine/core/types";

export interface MatchContext {
  fixture: Fixture;
  homePlayers: Player[];
  awayPlayers: Player[];
  weather: Weather;
}

// ---------------------------------------------------------------------------
// Attribute mapping — which attributes each event type reveals
// ---------------------------------------------------------------------------

export const EVENT_REVEALED: Record<MatchEventType, PlayerAttribute[]> = {
  goal:        ["shooting", "composure"],
  assist:      ["passing", "decisionMaking"],
  shot:        ["shooting", "composure"],
  pass:        ["passing", "decisionMaking"],
  dribble:     ["dribbling", "agility"],
  tackle:      ["defensiveAwareness", "strength"],
  header:      ["heading", "strength"],
  save:        ["composure", "positioning"],
  foul:        ["composure", "pressing"],
  cross:       ["crossing", "passing"],
  sprint:      ["pace", "stamina"],
  positioning: ["positioning", "offTheBall"],
  error:       ["composure", "decisionMaking"],
  leadership:  ["leadership", "composure"],
};

const PHASE_EVENT_WEIGHTS: Record<MatchPhaseType, Partial<Record<MatchEventType, number>>> = {
  buildUp:          { pass: 6, positioning: 3, dribble: 2, cross: 2, leadership: 1 },
  transition:       { sprint: 5, pass: 4, dribble: 3, tackle: 3, shot: 2, error: 2 },
  setpiece:         { header: 5, shot: 4, cross: 3, tackle: 2, goal: 1 },
  pressingSequence: { tackle: 6, sprint: 4, pass: 3, error: 3, positioning: 2, leadership: 1 },
  counterAttack:    { sprint: 5, dribble: 4, pass: 3, shot: 3, goal: 2, cross: 1 },
  possession:       { pass: 6, positioning: 6, dribble: 2, cross: 2, leadership: 1 },
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
  goal:        ["ST", "LW", "RW", "CAM", "CM", "CDM", "CB", "LB", "RB"],
  assist:      ["CAM", "CM", "LW", "RW", "ST", "LB", "RB", "CDM", "CB"],
  shot:        ["ST", "LW", "RW", "CAM", "CM", "CDM", "CB", "LB", "RB"],
  pass:        ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"],
  dribble:     ["LW", "RW", "ST", "CAM", "CM", "LB", "RB"],
  tackle:      ["CB", "LB", "RB", "CDM", "CM"],
  header:      ["CB", "ST", "CDM", "CM", "CAM", "LB", "RB"],
  save:        ["GK"],
  foul:        ["CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"],
  cross:       ["LB", "RB", "LW", "RW", "CM"],
  sprint:      ["LW", "RW", "ST", "CAM", "CM", "CDM", "CB", "LB", "RB"],
  positioning: ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"],
  error:       ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"],
  leadership:  ["GK", "CB", "CDM", "CM", "CAM", "ST"],
};

// ---------------------------------------------------------------------------
// Commentary templates
// ---------------------------------------------------------------------------

type Cfn = (p: string[], m: number) => string;

const COMMENTARY: Record<MatchEventType, Cfn[]> = {
  goal: [
    (p, m) => `${m}' — ${p[0]} latches onto a loose ball and drives it low into the corner. GOAL!`,
    (p, m) => `${m}' — GOAL! ${p[0]} is unmarked at the far post and nods it home.`,
    (p, m) => `${m}' — Clinical finish from ${p[0]}, who cuts inside and curls it beyond the keeper.`,
  ],
  assist: [
    (p, m) => `${m}' — Brilliant ball from ${p[0]} sets up the chance.`,
    (p, m) => `${m}' — ${p[0]} threads the perfect pass to create the opening.`,
  ],
  shot: [
    (p, m) => `${m}' — ${p[0]} gets a sight of goal but fires straight at the keeper.`,
    (p, m) => `${m}' — Powerful effort from ${p[0]} forces a fine save at full stretch.`,
    (p, m) => `${m}' — ${p[0]} cuts inside and bends one just wide of the far post.`,
    (p, m) => `${m}' — Long-range effort from ${p[0]} — clips the crossbar and goes over.`,
  ],
  pass: [
    (p, m) => `${m}' — ${p[0]} picks up the ball in midfield and threads a diagonal to ${p[1] ?? "a teammate"} on the wing.`,
    (p, m) => `${m}' — Delicate flick from ${p[0]} releases ${p[1] ?? "the runner"} in behind.`,
    (p, m) => `${m}' — ${p[0]} switches play with a sweeping 50-yard ball to ${p[1] ?? "the far side"}.`,
    (p, m) => `${m}' — Quick one-two between ${p[0]} and ${p[1] ?? "a teammate"} cuts through the press.`,
    (p, m) => `${m}' — Incisive through-ball from ${p[0]} splits the two centre-backs.`,
  ],
  dribble: [
    (p, m) => `${m}' — ${p[0]} takes on ${p[1] ?? "the full-back"} and goes past with a sharp change of direction.`,
    (p, m) => `${m}' — Brilliant footwork from ${p[0]}, feints inside before jinking outside.`,
    (p, m) => `${m}' — ${p[0]} dribbles into the box, rides two challenges, but runs into a dead end.`,
    (p, m) => `${m}' — Strong direct run from ${p[0]}, showing great balance to advance.`,
  ],
  tackle: [
    (p, m) => `${m}' — ${p[0]} times the sliding challenge perfectly to dispossess ${p[1] ?? "the attacker"}.`,
    (p, m) => `${m}' — Muscular challenge from ${p[0]}, who wins the ball fairly and drives forward.`,
    (p, m) => `${m}' — ${p[0]} reads the danger and steps in with a decisive interception.`,
    (p, m) => `${m}' — Crunching but fair tackle from ${p[0]} — a statement of intent.`,
  ],
  header: [
    (p, m) => `${m}' — Corner kick. ${p[0]} rises highest but heads wide under pressure.`,
    (p, m) => `${m}' — Towering header from ${p[0]} at the near post — straight at the keeper.`,
    (p, m) => `${m}' — ${p[0]} wins the aerial duel convincingly, powering it clear.`,
  ],
  save: [
    (p, m) => `${m}' — Brilliant reflexes from ${p[0]} to deny the shot at close range.`,
    (p, m) => `${m}' — ${p[0]} gets down well to palm the low drive around the post.`,
  ],
  foul: [
    (p, m) => `${m}' — ${p[0]} goes in too hard and the referee blows for a foul.`,
    (p, m) => `${m}' — Cynical foul from ${p[0]} to stop the counter-attack.`,
  ],
  sprint: [
    (p, m) => `${m}' — ${p[0]} bursts past two defenders with raw pace before being fouled.`,
    (p, m) => `${m}' — Relentless pressing from ${p[0]}, who covers more ground than anyone.`,
    (p, m) => `${m}' — ${p[0]} makes a lung-bursting 60-yard recovery run to make the challenge.`,
    (p, m) => `${m}' — ${p[0]} accelerates away from ${p[1] ?? "the last defender"} with frightening pace.`,
  ],
  cross: [
    (p, m) => `${m}' — ${p[0]} delivers a whipped cross from the flank — no one gets on the end of it.`,
    (p, m) => `${m}' — ${p[0]} cuts inside and floats a precise cross to the back post.`,
    (p, m) => `${m}' — ${p[0]} picks out ${p[1] ?? "the striker"} at the far post with a weighted delivery.`,
  ],
  positioning: [
    (p, m) => `${m}' — ${p[0]} drifts into space between the lines, always available.`,
    (p, m) => `${m}' — Intelligent movement from ${p[0]}, who drops deep to create an overload.`,
    (p, m) => `${m}' — Smart positioning from ${p[0]} cuts off the passing lane before the ball arrives.`,
  ],
  error: [
    (p, m) => `${m}' — Uncharacteristic mistake from ${p[0]}, misplacing a simple pass.`,
    (p, m) => `${m}' — ${p[0]} dallies on the ball under pressure and is dispossessed.`,
    (p, m) => `${m}' — Heavy first touch from ${p[0]} lets ${p[1] ?? "the defender"} nip in.`,
  ],
  leadership: [
    (p, m) => `${m}' — ${p[0]} organises the defensive shape with loud, clear instructions.`,
    (p, m) => `${m}' — After a difficult spell, ${p[0]} rallies teammates with visible encouragement.`,
    (p, m) => `${m}' — ${p[0]} calls for the ball and takes responsibility when it matters.`,
  ],
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
// Public API
// ---------------------------------------------------------------------------

export function generateMatchPhases(rng: RNG, context: MatchContext): MatchPhase[] {
  const { fixture, homePlayers, awayPlayers, weather } = context;
  const phaseCount = rng.nextInt(12, 18);

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

  const phaseTypePool: MatchPhaseType[] = [
    "buildUp", "buildUp", "buildUp",
    "transition", "transition",
    "setpiece", "setpiece",
    "pressingSequence", "pressingSequence",
    "counterAttack", "counterAttack",
    "possession", "possession", "possession",
  ];

  const phases: MatchPhase[] = [];

  for (let i = 0; i < phaseCount; i++) {
    const minute = startMinutes[i];
    const endMinute = i < phaseCount - 1 ? startMinutes[i + 1] - 1 : 90;
    const phaseType = rng.pick(phaseTypePool);
    const involvedPlayerIds = selectInvolvedPlayers(rng, homePlayers, awayPlayers);
    const eventCount = rng.nextInt(2, 4);
    const events: MatchEvent[] = [];

    for (let e = 0; e < eventCount; e++) {
      const eventType = pickEventType(rng, phaseType);
      const revealed = EVENT_REVEALED[eventType];

      const involved = involvedPlayerIds
        .map((id) => allPlayers.get(id))
        .filter((p): p is Player => !!p);

      const primary = pickEligiblePlayer(rng, eventType, involved, allPlayers);
      const secondary = involved.find((p) => p.id !== primary.id);

      const phaseWidth = Math.max(1, endMinute - minute);
      const eventMinute = minute + Math.floor((phaseWidth / eventCount) * e);

      const quality = computeEventQuality(rng, primary, revealed, weather);

      const templates = COMMENTARY[eventType];
      const template = rng.pick(templates);
      const names = secondary
        ? [`${primary.firstName} ${primary.lastName}`, `${secondary.firstName} ${secondary.lastName}`]
        : [`${primary.firstName} ${primary.lastName}`];
      const description = template(names, eventMinute);

      events.push({
        type: eventType,
        playerId: primary.id,
        attributesRevealed: revealed,
        quality,
        description,
        minute: eventMinute,
      });
    }

    phases.push({
      minute,
      type: phaseType,
      description: rng.pick(PHASE_DESCRIPTIONS[phaseType]),
      involvedPlayerIds,
      events,
      observableAttributes: collectObservableAttributes(events),
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
      weight: Math.max(1, p.attributes.shooting + (ATTACKING.has(p.position) ? 3 : 0)),
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
