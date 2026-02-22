/**
 * Gut Feeling mechanic — narrative flash moments during youth scouting.
 *
 * When observing unsigned youth, scouts occasionally get an instinctive
 * "flash" — a gut feeling about a player's hidden potential. These are
 * not data-driven assessments but narrative moments that make youth
 * scouting feel magical and rewarding.
 *
 * All functions are pure: no side effects, no mutation.
 */

import type { RNG } from "@/engine/rng";
import type {
  GutFeeling,
  UnsignedYouth,
  Scout,
  ObservationContext,
  WonderkidTier,
  AttributeDomain,
} from "@/engine/core/types";
import {
  TECHNICAL_ATTRIBUTES,
  PHYSICAL_ATTRIBUTES,
  MENTAL_ATTRIBUTES,
  TACTICAL_ATTRIBUTES,
} from "@/engine/core/types";

// =============================================================================
// NARRATIVE TEMPLATES
// =============================================================================

/**
 * Rich narrative templates indexed by wonderkid tier and attribute domain.
 * Each cell has 2–3 distinct templates so repeated gut feelings feel fresh.
 * The `hidden` domain falls back to `mental` templates.
 */
export const GUT_FEELING_TEMPLATES: Record<
  WonderkidTier,
  Record<AttributeDomain, string[]>
> = {
  generational: {
    technical: [
      "There's something in the way he caresses the ball... I've seen this only twice before in thirty years. This boy has hands for feet.",
      "Watch the first touch. Every time. It's not just good — it's different. The ball obeys him like it knows what he wants before he does.",
      "The technique is not from here. At this age, with this control — I'm struggling to explain what I'm seeing. It's extraordinary.",
    ],
    physical: [
      "The way he moves through space... it's not running, it's gliding. I've never seen a teenager cover ground like this without looking like he's trying.",
      "Raw power and grace in equal measure. When he accelerates, defenders don't just get beaten — they look like they're standing still.",
      "There's a physical presence here that transcends development. He's built for another level entirely.",
    ],
    mental: [
      "He sees passes that don't exist yet. At fourteen. I had to check my notes three times to believe what I was watching.",
      "The composure is eerie for his age. When the ball comes to him in tight spaces, time seems to slow down.",
      "His reading of the game is decades ahead of his years. I've been doing this job a long time — and I'm genuinely shaken.",
    ],
    tactical: [
      "His positioning is instinctive — he finds pockets of space that experienced professionals miss. This is not coached, this is innate.",
      "The way he shapes the press before the ball even moves... at his age that simply shouldn't be possible. This is something special.",
      "He understands structure the way a chess grandmaster understands the board. It's frightening how naturally it comes to him.",
    ],
    hidden: [
      "He sees passes that don't exist yet. At fourteen. I had to check my notes three times to believe what I was watching.",
      "The composure is eerie for his age. When the ball comes to him in tight spaces, time seems to slow down.",
      "His reading of the game is decades ahead of his years. I've been doing this job a long time — and I'm genuinely shaken.",
    ],
  },

  worldClass: {
    technical: [
      "Lovely technique. Clean, efficient, repeatable. He'll be a very good player — the question is just how good.",
      "The touch is well above this level. Give him two years and he'll be too good for anyone here.",
      "There's a clarity to the way he executes — no wasted movement, no hesitation. Top clubs will come for him.",
    ],
    physical: [
      "Strong and quick for his age. Not generational movement, but the athletic base is there for a top-flight career.",
      "The engine is impressive. Covers every blade of grass and still has quality on the ball at the end of it.",
      "Physically, he's already at a different level from his teammates. That gap only grows when professionals start taking care of their bodies.",
    ],
    mental: [
      "Smart player. Makes the right decision more often than not, which at this age is impressive. Could go far.",
      "There's a calmness under pressure that you can't coach. He'll thrive when the stakes get bigger.",
      "His awareness is excellent — always knows where the pressure is coming from, always has an answer ready.",
    ],
    tactical: [
      "He's already thinking like a professional. The positional discipline, the press-triggers — he's ahead of the curriculum.",
      "Tactically mature beyond his years. A top academy will polish what's already there into something very good.",
      "His understanding of shape and compactness is striking. Most pros take years to develop this instinctively.",
    ],
    hidden: [
      "Smart player. Makes the right decision more often than not, which at this age is impressive. Could go far.",
      "There's a calmness under pressure that you can't coach. He'll thrive when the stakes get bigger.",
      "His awareness is excellent — always knows where the pressure is coming from, always has an answer ready.",
    ],
  },

  qualityPro: {
    technical: [
      "Decent technique, well coached. He'll make a living in the game, but I'm not seeing anything that screams top level.",
      "Solid fundamentals. A sensible signing for a mid-table club looking to build depth.",
      "The execution is consistent, if not spectacular. There's a professional career in there for someone who works hard.",
    ],
    physical: [
      "Good engine on him. Covers ground well and wins his share of physical duels. Professional career written all over him.",
      "The physicality is there for the lower reaches of the top flight. Won't blow you away, but won't let you down either.",
      "Strong lad, decent pace. Nothing that makes you stop and stare, but you'd take him in a squad without hesitation.",
    ],
    mental: [
      "Steady head. Nothing flashy, but reliable. The kind of player a coach trusts.",
      "Makes sensible decisions. Won't unlock defences on his own, but won't give it away cheaply either.",
      "Mentally consistent. That's rarer than it sounds at this level, and it'll carry him further than his talent alone might suggest.",
    ],
    tactical: [
      "Positionally sound. He knows where to be and when to be there — the basics are well-drilled.",
      "Good understanding of his defensive responsibilities. A coach who organises well will get solid value from him.",
      "His positioning keeps him out of trouble more often than not. At the professional level, that's half the battle.",
    ],
    hidden: [
      "Steady head. Nothing flashy, but reliable. The kind of player a coach trusts.",
      "Makes sensible decisions. Won't unlock defences on his own, but won't give it away cheaply either.",
      "Mentally consistent. That's rarer than it sounds at this level, and it'll carry him further than his talent alone might suggest.",
    ],
  },

  journeyman: {
    technical: [
      "He's trying hard, but the technical ceiling feels limited. Might find a home in the lower leagues.",
      "Workmanlike. Gets the job done without frills. There's a club out there for him, just not at the top.",
      "The effort is admirable, the execution less so. Good attitude can take a player a long way — he'll need every bit of it.",
    ],
    physical: [
      "Nothing stands out physically. He's competing, but the gap in raw athleticism is visible.",
      "Average athlete at this level. Won't cause problems for opponents, won't get dominated either — just middle of the road.",
      "The physical tools are limited. He compensates with effort, which buys him a career, but not a long one at the top.",
    ],
    mental: [
      "Willing runner but the decision-making is slow. Football intelligence might hold him back.",
      "Tries his hardest, reads the game a beat behind. A patient coach and the right environment could unlock something.",
      "Mentally, he's not quite there yet. Some players grow into it; others don't. I'd be cautious.",
    ],
    tactical: [
      "Positionally naive. Could be coached out of it, but at this age the instincts should be sharper.",
      "He's still learning the basic patterns. Not unworkable, but he's behind where you'd want him to be at this stage.",
      "Lacks tactical awareness. Gets caught out of position more than once — that's a fundamental concern.",
    ],
    hidden: [
      "Willing runner but the decision-making is slow. Football intelligence might hold him back.",
      "Tries his hardest, reads the game a beat behind. A patient coach and the right environment could unlock something.",
      "Mentally, he's not quite there yet. Some players grow into it; others don't. I'd be cautious.",
    ],
  },
};

// =============================================================================
// HELPER: DETERMINE PRIMARY DOMAIN
// =============================================================================

/**
 * Inspect a youth player's true attributes and return the domain with the
 * highest simple average. The "hidden" domain is never returned.
 *
 * Domain groupings (attribute key lists):
 *  - technical: firstTouch, passing, dribbling, crossing, shooting, heading
 *  - physical:  pace, strength, stamina, agility
 *  - mental:    composure, positioning, workRate, decisionMaking, leadership
 *  - tactical:  offTheBall, pressing, defensiveAwareness
 */
export function getPlayerPrimaryDomain(youth: UnsignedYouth): AttributeDomain {
  const attrs = youth.player.attributes;

  const technicalAvg =
    TECHNICAL_ATTRIBUTES.reduce((sum, key) => sum + (attrs[key] ?? 0), 0) /
    TECHNICAL_ATTRIBUTES.length;

  const physicalAvg =
    PHYSICAL_ATTRIBUTES.reduce((sum, key) => sum + (attrs[key] ?? 0), 0) /
    PHYSICAL_ATTRIBUTES.length;

  const mentalAvg =
    MENTAL_ATTRIBUTES.reduce((sum, key) => sum + (attrs[key] ?? 0), 0) /
    MENTAL_ATTRIBUTES.length;

  const tacticalAvg =
    TACTICAL_ATTRIBUTES.reduce((sum, key) => sum + (attrs[key] ?? 0), 0) /
    TACTICAL_ATTRIBUTES.length;

  const scores: [AttributeDomain, number][] = [
    ["technical", technicalAvg],
    ["physical", physicalAvg],
    ["mental", mentalAvg],
    ["tactical", tacticalAvg],
  ];

  // Sort descending; pick the domain with the highest average
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][0];
}

// =============================================================================
// PERK MODIFIERS TYPE
// =============================================================================

export interface GutFeelingPerkModifiers {
  /** Multiplies gut feeling chance by 1.4 for youth under 16. */
  gutFeelingBonus?: boolean;
  /** Appends a PA estimate to the formatted narrative. */
  paEstimate?: boolean;
}

// =============================================================================
// MAIN: ROLL GUT FEELING
// =============================================================================

/**
 * Attempt to generate a gut feeling during an unsigned youth observation.
 *
 * Returns a `GutFeeling` if the roll succeeds, or `null` if the scout has
 * no flash of instinct this session.
 *
 * Chance calculation:
 *   base = 10%
 *   + 2% per point of scout.attributes.intuition above 10
 *   + 1% per specializationLevel when scout.primarySpecialization === "youth"
 *   × context multiplier  (followUpSession = 2×, streetFootball = 1.5×, else 1×)
 *   × 1.4 if perkModifiers.gutFeelingBonus === true AND youth.player.age < 16
 *
 * Reliability:
 *   Math.min(0.85, (intuition + youthSpecLevel) / 40)
 *   where youthSpecLevel = specializationLevel if primarySpecialization === "youth", else 0
 */
export function rollGutFeeling(
  rng: RNG,
  scout: Scout,
  youth: UnsignedYouth,
  context: ObservationContext,
  perkModifiers?: GutFeelingPerkModifiers,
  /** Fractional bonus to gut feeling trigger rate from equipment (e.g. 0.20 = +20%). */
  equipmentGutFeelingBonus?: number,
): GutFeeling | null {
  // --- Compute raw chance ---
  const intuitionBonus = Math.max(0, scout.attributes.intuition - 10) * 0.02;
  const isYouthSpec = scout.primarySpecialization === "youth";
  const specBonus = isYouthSpec ? scout.specializationLevel * 0.01 : 0;

  let chance = 0.10 + intuitionBonus + specBonus;

  // Context multiplier
  if (context === "followUpSession") {
    chance *= 2;
  } else if (context === "streetFootball") {
    chance *= 1.5;
  }

  // Perk multiplier for very young players
  if (perkModifiers?.gutFeelingBonus === true && youth.player.age < 16) {
    chance *= 1.4;
  }

  // Equipment gut feeling bonus (multiplicative with base chance)
  if (equipmentGutFeelingBonus && equipmentGutFeelingBonus > 0) {
    chance *= 1 + equipmentGutFeelingBonus;
  }

  // --- Roll ---
  if (!rng.chance(chance)) {
    return null;
  }

  // --- Determine trigger domain ---
  const triggerDomain = getPlayerPrimaryDomain(youth);

  // --- Pick narrative template ---
  const wonderkidTier: WonderkidTier = youth.player.wonderkidTier;
  const templates = GUT_FEELING_TEMPLATES[wonderkidTier][triggerDomain];
  const narrative = rng.pick(templates);

  // --- Calculate reliability ---
  const youthSpecLevel = isYouthSpec ? scout.specializationLevel : 0;
  const reliability = Math.min(
    0.85,
    (scout.attributes.intuition + youthSpecLevel) / 40,
  );

  // --- Build and return GutFeeling ---
  const gutFeeling: GutFeeling = {
    id: `gf_${rng.nextInt(100000, 999999)}`,
    playerId: youth.player.id,
    narrative,
    triggerDomain,
    reliability,
    // wasAccurate is set retroactively — omit here
    week: 0,   // caller is responsible for setting week/season from GameState
    season: 0, // caller is responsible for setting week/season from GameState
  };

  return gutFeeling;
}

// =============================================================================
// FORMAT: GUT FEELING WITH OPTIONAL PA ESTIMATE
// =============================================================================

/**
 * Return the gut feeling narrative, optionally appended with a rough PA
 * estimate when the scout holds the `paEstimate` perk.
 *
 * The estimate is expressed as a ±5 range around the player's true PA so the
 * display feels like a heuristic guess, not a data readout.
 */
export function formatGutFeelingWithPA(
  gutFeeling: GutFeeling,
  youth: UnsignedYouth,
  perkModifiers?: GutFeelingPerkModifiers,
): string {
  if (perkModifiers?.paEstimate !== true) {
    return gutFeeling.narrative;
  }

  const pa = youth.player.potentialAbility;
  const low = Math.max(1, pa - 5);
  const high = pa + 5;

  return `${gutFeeling.narrative} My best guess? Somewhere between ${low} and ${high} potential ability.`;
}
