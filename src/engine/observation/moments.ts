/**
 * Moment Generation & Flagging
 *
 * Generates player moments during observation phases. Each moment reveals
 * hints about player attributes, with focused players showing detailed
 * descriptions and unfocused players showing vague descriptions.
 *
 * Moment types map to attribute domains:
 * - technicalAction → technical attributes
 * - physicalTest → physical attributes
 * - mentalResponse → mental attributes
 * - tacticalDecision → tactical attributes
 * - characterReveal → hidden/personality attributes
 */

import type { RNG } from "@/engine/rng";
import type { PlayerAttribute } from "@/engine/core/types";
import type { PlayerMoment, SessionPlayer, VenueAtmosphere } from "./types";

// =============================================================================
// TYPES
// =============================================================================

type MomentType = PlayerMoment["momentType"];

type MomentTypeWeights = Record<MomentType, number>;

// =============================================================================
// MOMENT TYPE WEIGHTS BY VENUE
// =============================================================================

/**
 * Weighted distribution of moment types per venue.
 * Weights are relative — they need not sum to 100 but all must be positive.
 *
 * schoolMatch:         Structured environment → more technique and tactics.
 * streetFootball:      Chaotic, athletic → raw technical and physical.
 * grassrootsTournament: Balanced across all types.
 * academyTrialDay:     Controlled drills → tactics and mental responses.
 * youthFestival:       International pressure → character and mental signals.
 * attendMatch/reserveMatch/trialMatch: Tactical bias with balanced spread.
 * trainingVisit:       Drill-based → technical and tactical observation.
 * Default:             Equal weights across all types.
 */
export const MOMENT_TYPE_WEIGHTS: Record<string, MomentTypeWeights> = {
  schoolMatch: {
    technicalAction:  30,
    physicalTest:     15,
    mentalResponse:   15,
    tacticalDecision: 30,
    characterReveal:  10,
  },
  streetFootball: {
    technicalAction:  35,
    physicalTest:     30,
    mentalResponse:   15,
    tacticalDecision: 10,
    characterReveal:  10,
  },
  grassrootsTournament: {
    technicalAction:  20,
    physicalTest:     20,
    mentalResponse:   20,
    tacticalDecision: 20,
    characterReveal:  20,
  },
  academyTrialDay: {
    technicalAction:  20,
    physicalTest:     15,
    mentalResponse:   25,
    tacticalDecision: 30,
    characterReveal:  10,
  },
  youthFestival: {
    technicalAction:  15,
    physicalTest:     15,
    mentalResponse:   30,
    tacticalDecision: 15,
    characterReveal:  25,
  },
  attendMatch: {
    technicalAction:  20,
    physicalTest:     15,
    mentalResponse:   20,
    tacticalDecision: 35,
    characterReveal:  10,
  },
  reserveMatch: {
    technicalAction:  20,
    physicalTest:     20,
    mentalResponse:   20,
    tacticalDecision: 30,
    characterReveal:  10,
  },
  trialMatch: {
    technicalAction:  20,
    physicalTest:     20,
    mentalResponse:   20,
    tacticalDecision: 25,
    characterReveal:  15,
  },
  trainingVisit: {
    technicalAction:  35,
    physicalTest:     15,
    mentalResponse:   15,
    tacticalDecision: 30,
    characterReveal:   5,
  },
  scoutingMission: {
    technicalAction:  20,
    physicalTest:     20,
    mentalResponse:   20,
    tacticalDecision: 25,
    characterReveal:  15,
  },
  // Default fallback (equal weights)
  _default: {
    technicalAction:  20,
    physicalTest:     20,
    mentalResponse:   20,
    tacticalDecision: 20,
    characterReveal:  20,
  },
};

// =============================================================================
// MOMENT DESCRIPTION TEMPLATES
// =============================================================================

/**
 * Tiered description templates keyed by moment type, then quality band.
 * {playerName} is replaced at runtime via formatMomentDescription().
 *
 * Quality bands:
 *   high   → 7-10
 *   medium → 4-6
 *   low    → 1-3
 */
export const MOMENT_DESCRIPTIONS: Record<
  MomentType,
  { high: string[]; medium: string[]; low: string[] }
> = {
  technicalAction: {
    high: [
      "{playerName} executed a precise first touch under pressure, controlling a long diagonal ball with the outside of the foot.",
      "{playerName} played a no-look reverse pass through a tight channel, splitting two defenders with a single touch.",
      "{playerName} cut inside off the left, shifted the ball onto the right foot, and curled a perfectly weighted through-ball into the striker's run.",
      "{playerName} received a bouncing ball under a physical challenge, killed it dead with one touch, and played it forward instantly.",
      "{playerName} dummied the incoming pass to let it run to a teammate, completely fooling the marker — a piece of real quality.",
      "{playerName} chipped a delicate, lofted pass over the press and found a runner in behind with unerring accuracy.",
      "{playerName} produced a moment of individual brilliance — a stepover, a body feint, then drove forward into the space created.",
    ],
    medium: [
      "{playerName} received a pass and played it forward cleanly without fuss.",
      "{playerName} controlled a difficult aerial ball reasonably well and held up play.",
      "{playerName} played a side-foot pass into a teammate's path — simple, reliable.",
      "{playerName} brought the ball down under moderate pressure and kept possession.",
      "{playerName} played a short combination before finding a more advanced option.",
      "{playerName} attempted a dribble and, though not entirely convincing, retained the ball.",
    ],
    low: [
      "{playerName} struggled with a routine pass, the ball bouncing off the shin.",
      "{playerName} failed to control a comfortable ball, giving possession away cheaply.",
      "{playerName} attempted a first-time cross that skipped well wide of its target.",
      "{playerName} dribbled into a dead end and lost the ball trying to force a way through.",
      "{playerName} misplaced a short pass under minimal pressure, frustrating teammates.",
      "{playerName} shanked a shot from a promising position straight into the stands.",
    ],
  },

  physicalTest: {
    high: [
      "{playerName} burst past the defender with explosive acceleration, covering 30 yards in under four seconds.",
      "{playerName} won a physical aerial battle convincingly, outmuscling a much bigger opponent.",
      "{playerName} recovered a seemingly lost cause at pace, tracking back 40 yards to make an important block.",
      "{playerName} showed exceptional balance in a clumsy challenge, regaining control where others would have fallen.",
      "{playerName} outran the last defender in a 60-yard sprint to the corner flag — no one got close.",
      "{playerName} powered through a shove from behind and stayed upright, using lower-body strength to shield possession.",
      "{playerName} showed remarkable agility, switching direction three times in quick succession before finding space.",
    ],
    medium: [
      "{playerName} kept pace with the runner down the wing and held ground.",
      "{playerName} competed in a physical duel and came away with the ball often enough.",
      "{playerName} showed good mobility tracking the run, maintaining position across the ground.",
      "{playerName} jumped for a header and made decent contact — competitive in the air.",
      "{playerName} moved well over 10-15 yards to close the passing lane.",
      "{playerName} held off a challenge using a reasonable degree of strength.",
    ],
    low: [
      "{playerName} was left trailing after failing to keep up with a quick counter.",
      "{playerName} lost the aerial duel comfortably — unable to match the opponent's leap.",
      "{playerName} slipped when changing direction, giving the ball away in a vulnerable position.",
      "{playerName} ran out of legs toward the end of the phase, struggling to cover the ground.",
      "{playerName} was physically bullied out of a challenge, giving away possession cheaply.",
      "{playerName} arrived late to the sprint, unable to close the space before the ball was played.",
    ],
  },

  mentalResponse: {
    high: [
      "{playerName} kept a completely calm head when the game's tempo was at its most frantic — reading the moment beautifully.",
      "{playerName} recovered mentally from an earlier error, immediately pressing aggressively to win the ball back.",
      "{playerName} made a split-second decision under maximum pressure that was exactly right — the composure of someone beyond their years.",
      "{playerName} picked a complex, correct option from three alternatives in a fraction of a second, with defenders closing in.",
      "{playerName} galvanised the team at a difficult moment — a leader's read of the situation and a leader's intervention.",
      "{playerName} held the line intelligently when teammates were drawn out, maintaining the structural shape under pressure.",
      "{playerName} anticipated the opponent's second movement before it happened and was already in position to intercept.",
    ],
    medium: [
      "{playerName} showed reasonable composure under pressure, choosing a safe option when the game got tight.",
      "{playerName} made a quick decision when space closed and managed to keep possession.",
      "{playerName} encouraged a teammate after a mistake — an understated but noticeable act of leadership.",
      "{playerName} tracked a run and closed down efficiently without overcommitting.",
      "{playerName} stayed focused at a set piece, staying in position rather than being drawn to the ball.",
      "{playerName} made the correct if predictable decision in a two-on-one, keeping it simple.",
    ],
    low: [
      "{playerName} appeared rattled after a heavy challenge, making rushed and poor decisions for several minutes.",
      "{playerName} switched off completely at a key moment — a lapse in concentration that was costly.",
      "{playerName} chose the wrong option under moderate pressure when a simpler choice was available.",
      "{playerName} reacted slowly to a change in team shape, leaving a dangerous gap.",
      "{playerName} showed signs of frustration, gesturing toward teammates and losing focus on their defensive duties.",
      "{playerName} made a panicked clearance under minimal pressure, inviting more pressure onto the team.",
    ],
  },

  tacticalDecision: {
    high: [
      "{playerName} made a perfectly timed run in behind — the timing and angle of the movement were exceptional.",
      "{playerName} dropped into the half-space precisely to create an overload, freeing a teammate for a chance.",
      "{playerName} read the press trigger and played through the trap perfectly with a driven pass that broke the lines.",
      "{playerName} adjusted the team's defensive shape verbally before the attack developed — everyone shifted two yards.",
      "{playerName} drew two defenders with a decoy run, opening up an acre of space for the player in behind.",
      "{playerName} pressed from the front and forced a goal kick through smart positioning — a tactical master class in miniature.",
      "{playerName} spotted the gap in the defensive block early and moved to occupy it just before the ball arrived.",
    ],
    medium: [
      "{playerName} made a sensible run to open an option for the player in possession.",
      "{playerName} tracked the runner consistently, maintaining a correct defensive relationship throughout the phase.",
      "{playerName} dropped off the press and settled into a compact shape when the build-up began.",
      "{playerName} played the percentages — nothing spectacular, but the positional decisions were correct.",
      "{playerName} covered the near-post correctly at a set piece, never giving the delivery a free route.",
      "{playerName} picked up the second ball smartly after it broke from a clearance — good anticipation of the situation.",
    ],
    low: [
      "{playerName} made a run too early, signalling the intent and allowing the defence to adjust.",
      "{playerName} stepped out to press and left a dangerous gap that the opposition nearly exploited.",
      "{playerName} drifted too narrow and took themselves out of the play during an attack down their flank.",
      "{playerName} failed to track the runner at the set piece — an obvious miss that almost cost a goal.",
      "{playerName} made the wrong call in the press, closing the wrong man and leaving a free player in space.",
      "{playerName} didn't move to support the ball carrier when the option was clearly there, leaving them isolated.",
    ],
  },

  characterReveal: {
    high: [
      "{playerName} played through what looked like a painful knock without any fuss, jogging it off and continuing.",
      "{playerName} openly encouraged a younger teammate who made a mistake — a telling glimpse of character.",
      "{playerName} remonstrated briefly with the referee but immediately refocused — mature and self-controlled.",
      "{playerName} drove through heavy physical contact repeatedly without ever retreating into safer territory — remarkable resolve.",
      "{playerName} arrived at the session before anyone else and was still working on finishing technique long after the team moved on.",
      "{playerName} responded to a poor referee decision by lifting their own intensity immediately — no sulking, no excuses.",
      "{playerName} was consistently the hardest worker on the pitch in the drills that no one else seemed to enjoy — a professional's mentality.",
    ],
    medium: [
      "{playerName} shook hands warmly with an opponent after a hard foul — no lingering grievance.",
      "{playerName} jogged back into position after losing the ball without theatrics or complaint.",
      "{playerName} acknowledged a teammate's good pass with a thumbs up — a small but consistent signal of team-first thinking.",
      "{playerName} picked up quickly from an error and carried on without visible signs of anxiety.",
      "{playerName} continued playing at full intensity even when the match appeared lost — workrate held up throughout.",
      "{playerName} listened attentively during a tactical instruction session and implemented the change immediately.",
    ],
    low: [
      "{playerName} kicked the ground in frustration after a substitution decision went against them.",
      "{playerName} appeared to take a soft fall to win a foul rather than staying on their feet and continuing.",
      "{playerName} complained audibly to teammates about the referee for several minutes following a decision.",
      "{playerName} visibly dropped their intensity when the team went behind — the body language was poor.",
      "{playerName} walked to their position when a sprint was clearly needed — a concerning drop in work rate.",
      "{playerName} argued with a teammate over a tactical decision and failed to refocus for the remainder of the phase.",
    ],
  },
};

// =============================================================================
// VAGUE DESCRIPTIONS
// =============================================================================

/**
 * Short, non-specific descriptions shown when the scout has not allocated
 * a focus token to the player involved. Peripheral vision only.
 */
export const VAGUE_DESCRIPTIONS: Record<MomentType, string[]> = {
  technicalAction: [
    "A player made an impressive technical play.",
    "Someone produced a moment of skill in the area.",
    "There was a neat bit of technique from one of the outfield players.",
    "A player did something precise and controlled — hard to catch the full picture from here.",
    "One of the players executed something tidy on the ball.",
  ],
  physicalTest: [
    "Someone showed good pace on the break.",
    "A player won a physical contest convincingly.",
    "There was an athletic moment from one of the squad.",
    "A player covered serious ground — hard to tell exactly who.",
    "Someone looked quick and athletic in that exchange.",
  ],
  mentalResponse: [
    "There was an interesting response under pressure from one of the players.",
    "A player seemed composed when others around them were not.",
    "One of the players made a decisive call in a difficult moment.",
    "Someone seemed to settle things down — could be worth a closer look.",
    "A player reacted to a tough situation — hard to read from this angle.",
  ],
  tacticalDecision: [
    "A player made an intelligent positional move.",
    "Someone's run opened up a lane — the decision looked smart.",
    "There was a tactical contribution from one of the players that shifted the phase.",
    "A player seemed to understand the shape well — they were in exactly the right place.",
    "One of them made a clever run off the ball — caught it in the corner of the eye.",
  ],
  characterReveal: [
    "Something happened off the ball that looked significant from a character perspective.",
    "A player's reaction to an incident said something — couldn't quite catch it from here.",
    "One of the players showed something in how they responded to that moment.",
    "There was a brief exchange between players that looked like it was worth noting.",
    "A player's attitude after that moment stood out — details unclear from this distance.",
  ],
};

// =============================================================================
// ATTRIBUTE HINT MAPPING
// =============================================================================

/**
 * Returns the pool of attributes that can be hinted by a given moment type.
 * The generator randomly samples 1-3 of these per moment.
 */
export function getMomentAttributeHints(
  momentType: MomentType,
): PlayerAttribute[] {
  switch (momentType) {
    case "technicalAction":
      return [
        "firstTouch",
        "passing",
        "dribbling",
        "crossing",
        "shooting",
        "heading",
        "tackling",
        "finishing",
      ];
    case "physicalTest":
      return ["pace", "strength", "stamina", "agility", "jumping", "balance"];
    case "mentalResponse":
      return [
        "composure",
        "positioning",
        "workRate",
        "decisionMaking",
        "leadership",
        "anticipation",
      ];
    case "tacticalDecision":
      return [
        "offTheBall",
        "pressing",
        "defensiveAwareness",
        "vision",
        "marking",
        "teamwork",
      ];
    case "characterReveal":
      return [
        "injuryProneness",
        "consistency",
        "bigGameTemperament",
        "professionalism",
      ];
  }
}

// =============================================================================
// TEMPLATE HELPERS
// =============================================================================

/**
 * Replaces the {playerName} placeholder in a description template.
 */
export function formatMomentDescription(
  template: string,
  playerName: string,
): string {
  return template.replace(/\{playerName\}/g, playerName);
}

// =============================================================================
// MOMENT TYPE SELECTION
// =============================================================================

/**
 * Selects a moment type using weighted random selection for the given venue.
 * Falls back to the "_default" equal-weight distribution for unknown venues.
 */
export function selectMomentType(
  rng: RNG,
  venueType: string,
): MomentType {
  const weights = MOMENT_TYPE_WEIGHTS[venueType] ?? MOMENT_TYPE_WEIGHTS["_default"];

  const items = (
    Object.entries(weights) as [MomentType, number][]
  ).map(([momentType, weight]) => ({ item: momentType, weight }));

  return rng.pickWeighted(items);
}

// =============================================================================
// CORE GENERATOR
// =============================================================================

/**
 * Generates all player moments for a single observation phase.
 *
 * Selection rules:
 *   - 3–6 moments per phase.
 *   - Focused players: 50% chance of appearing in each moment slot.
 *   - Unfocused players: 20% chance.
 *   - If no players are selected by chance for a slot, the generator picks
 *     any player at random to guarantee the phase always has content.
 *   - Moment quality is biased by the player's relevant attribute pool
 *     (simulated here via a gaussian draw — the actual attribute values are
 *     not exposed to the scout, this is just internal quality generation).
 *   - pressureContext: 20% base chance, scaled by phase progression and
 *     atmosphere.crowdIntensity.
 *   - isStandout: true when quality >= 8.
 */
export function generateMoments(
  rng: RNG,
  players: SessionPlayer[],
  venueType: string,
  phaseIndex: number,
  totalPhases: number,
  atmosphere?: VenueAtmosphere,
): PlayerMoment[] {
  const momentCount = rng.nextInt(3, 6);
  const moments: PlayerMoment[] = [];

  // Phase progression as a 0–1 scalar (used for pressure scaling).
  const phaseProgress = totalPhases > 1 ? phaseIndex / (totalPhases - 1) : 0;

  // Base pressure probability: 20%, increasing toward the end of the session.
  // Crowd intensity amplifies this further when an atmosphere is provided.
  const crowdBoost = atmosphere ? atmosphere.crowdIntensity * 0.15 : 0;
  const pressureProbability = Math.min(0.2 + phaseProgress * 0.25 + crowdBoost, 0.7);

  for (let i = 0; i < momentCount; i++) {
    // --- Select an involved player ---
    const player = selectMomentPlayer(rng, players);

    // --- Select moment type weighted by venue ---
    const momentType = selectMomentType(rng, venueType);

    // --- Generate quality (1–10, gaussian-biased toward 5) ---
    const rawQuality = rng.gaussian(5.5, 2.0);
    const quality = Math.round(Math.min(10, Math.max(1, rawQuality)));

    // --- Sample 1–3 attribute hints from the relevant pool ---
    const hintPool = getMomentAttributeHints(momentType);
    const hintCount = rng.nextInt(1, Math.min(3, hintPool.length));
    const shuffledPool = rng.shuffle(hintPool);
    const attributesHinted = shuffledPool.slice(0, hintCount) as PlayerAttribute[];

    // --- Generate descriptions ---
    const { description, vagueDescription } = buildDescriptions(
      rng,
      momentType,
      player.name,
      quality,
    );

    // --- Pressure context ---
    const pressureContext = rng.chance(pressureProbability);

    // --- Standout flag ---
    const isStandout = quality >= 8;

    // --- Unique ID for this moment within the session ---
    const id = `moment-p${phaseIndex}-${i}-${player.playerId.slice(0, 8)}`;

    moments.push({
      id,
      playerId: player.playerId,
      momentType,
      quality,
      attributesHinted,
      description,
      vagueDescription,
      pressureContext,
      isStandout,
    });
  }

  return moments;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Selects a player to feature in a moment slot.
 *
 * Focused players have a 50% chance of being selected; unfocused 20%.
 * All players who pass the chance roll are collected; one is picked at random.
 * If none pass, a random player is chosen to guarantee the slot is filled.
 */
function selectMomentPlayer(rng: RNG, players: SessionPlayer[]): SessionPlayer {
  if (players.length === 0) {
    throw new RangeError("selectMomentPlayer: players array must not be empty");
  }

  const candidates: SessionPlayer[] = [];

  for (const player of players) {
    const threshold = player.isFocused ? 0.5 : 0.2;
    if (rng.chance(threshold)) {
      candidates.push(player);
    }
  }

  // Always guarantee at least one player to avoid empty moments.
  if (candidates.length === 0) {
    return rng.pick(players);
  }

  return rng.pick(candidates);
}

/**
 * Builds a detailed description and a vague description for a moment.
 *
 * Quality bands:
 *   high   → 7–10
 *   medium → 4–6
 *   low    → 1–3
 */
function buildDescriptions(
  rng: RNG,
  momentType: MomentType,
  playerName: string,
  quality: number,
): { description: string; vagueDescription: string } {
  const band: "high" | "medium" | "low" =
    quality >= 7 ? "high" : quality >= 4 ? "medium" : "low";

  const detailedTemplates = MOMENT_DESCRIPTIONS[momentType][band];
  const vagueTemplates = VAGUE_DESCRIPTIONS[momentType];

  const detailedTemplate = rng.pick(detailedTemplates);
  const vagueTemplate = rng.pick(vagueTemplates);

  return {
    description: formatMomentDescription(detailedTemplate, playerName),
    vagueDescription: vagueTemplate,
  };
}
