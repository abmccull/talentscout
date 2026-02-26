/**
 * Insight Action Implementations
 *
 * Each insight action is a special "eureka moment" that provides
 * dramatically enhanced scouting outcomes. Actions guarantee accuracy
 * but not value — the risk is in WHEN and WHERE you deploy them.
 */

import type { RNG } from "@/engine/rng";
import type { Player, Scout, Contact, Specialization } from "@/engine/core/types";
import {
  HIDDEN_ATTRIBUTES,
  TECHNICAL_ATTRIBUTES,
  PHYSICAL_ATTRIBUTES,
  MENTAL_ATTRIBUTES,
  TACTICAL_ATTRIBUTES,
} from "@/engine/core/types";
import type { ObservationSession, PlayerMoment } from "@/engine/observation/types";
import type {
  InsightActionId,
  InsightActionResult,
} from "@/engine/insight/types";

// =============================================================================
// CONTEXT
// =============================================================================

/**
 * All data the engine needs to execute any insight action.
 * Callers populate only the fields relevant to the action being triggered;
 * individual handlers guard against missing optional data gracefully.
 */
export interface InsightActionContext {
  /** The scout who triggered the action. */
  scout: Scout;
  /** The active observation session. */
  session: ObservationSession;
  /** Primary player the action targets (where applicable). */
  targetPlayerId?: string;
  /**
   * Full player records — true attributes are visible here.
   * The engine has access to ground truth; scout perception is bypassed
   * intentionally for insight actions.
   */
  players: Record<string, Player>;
  /** All contacts available in the current region. */
  contacts?: Record<string, Contact>;
  /** Sub-region identifier for territory-based actions. */
  subRegionId?: string;
  /** Pre-filtered list of players in the queried league (data actions). */
  leaguePlayers?: Player[];
}

// =============================================================================
// NARRATIVE SYSTEM
// =============================================================================

/**
 * Returns a short prefix phrase that tunes a narrative line to the scout's
 * active specialization, giving each specialization a distinctive voice.
 *
 *  - youth:     warm, paternal, instinctive
 *  - firstTeam: analytical, professional, decisive
 *  - regional:  relationship-based, local-knowledge flavour
 *  - data:      algorithmic, pattern-recognition tone
 */
function getSpecializationFlavor(spec: Specialization): string {
  switch (spec) {
    case "youth":
      return "Something in your gut says";
    case "firstTeam":
      return "The data crystallises:";
    case "regional":
      return "Years in this territory tell you";
    case "data":
      return "The algorithm confirms:";
  }
}

/**
 * Catalogue of narrative templates keyed by action ID and specialization.
 * Each entry contains 2-3 variants; one is chosen at random by the handler.
 */
const INSIGHT_NARRATIVES: Record<
  InsightActionId,
  Record<Specialization | "universal", readonly string[]>
> = {
  clarityOfVision: {
    universal: [
      "The noise falls away. Every touch, every movement — brutally clear.",
      "A moment of perfect stillness. The player's true qualities lay bare.",
      "You stop second-guessing. What you see is exactly what is there.",
    ],
    youth: [
      "The boy's raw talent snaps into focus. No more guessing — you see him.",
      "Your instincts quiet. His real ability shines through the clutter.",
      "It clicks. This kid is exactly what your eye told you he was.",
    ],
    firstTeam: [
      "Signal cuts through noise. His true attribute values are unambiguous.",
      "The assessment calcifies into certainty. No margin for misreading.",
      "Professional clarity: the player's ceiling is now precisely measurable.",
    ],
    regional: [
      "Local familiarity strips the veil. You know this type — you see him clearly.",
      "Knowing this ground so well, the player's real quality is obvious to you.",
      "You've watched hundreds of players here. This one's truth is plain.",
    ],
    data: [
      "The perceptual noise collapses to zero. Pure signal. Perfect reading.",
      "Algorithmic clarity: every attribute value resolves to ground truth.",
      "The filter cuts in. True values, no distortion. Clean output.",
    ],
  },

  hiddenNature: {
    universal: [
      "You sense something beneath the surface — and for once, you are right.",
      "The mask slips. A glimpse of the player's true character.",
      "Hidden for a reason. Now it is yours to know.",
    ],
    youth: [
      "Every young player hides who they really are. Tonight, this one does not.",
      "You've learned to read the signs early. This kid cannot hide from you.",
      "Underneath the potential, you sense the character. It is not what most would see.",
    ],
    firstTeam: [
      "Character under contract pressure reveals everything. You see it clearly.",
      "Proven professionals still hide. Your read strips that defence away.",
      "The hidden architecture of his mentality — exposed.",
    ],
    regional: [
      "People around here talk. You already had suspicions. Now you have truth.",
      "Years of relationships in this region tell you what the eye can't see.",
      "Your network has whispered. Your instinct has now confirmed.",
    ],
    data: [
      "Statistical outliers sometimes point inward. The pattern reveals character.",
      "Hidden attributes leave footprints in the numbers. The algorithm found them.",
      "Variance analysis flags the anomaly. The hidden truth emerges.",
    ],
  },

  theVerdict: {
    universal: [
      "You know exactly what to write. Every word lands with authority.",
      "The report writes itself — the evidence is too clear to misstate.",
      "Your pen moves with conviction. This is the definitive assessment.",
    ],
    youth: [
      "This kid's potential deserves the full weight of your judgment. You deliver it.",
      "You've seen enough. The report becomes a statement of belief.",
      "Every parent, every coach, every director should read this. You make it worthy.",
    ],
    firstTeam: [
      "The verdict is professional-grade. Unambiguous. Decision-ready.",
      "You lay out the case. The report is a masterclass in observed evidence.",
      "Clear prose, clear evidence, clear conclusion. The club will act on this.",
    ],
    regional: [
      "Local knowledge deepens every line. The report carries real texture.",
      "You write with the authority of someone who knows this territory.",
      "The report feels authentic — because it is. Every detail is earned.",
    ],
    data: [
      "Data-backed, narrative-rich. The report sets a new benchmark.",
      "Statistical rigour meets readable prose. The result is exceptional.",
      "The algorithm supplements the eye. The output is flawless.",
    ],
  },

  secondLook: {
    universal: [
      "Out of the corner of your eye — you almost missed him entirely.",
      "There was something there. You circle back. You were right.",
      "Your peripheral read was sharper than you realised. A second look confirms it.",
    ],
    youth: [
      "The boy on the left. Quiet. You nearly walked past. You didn't.",
      "A flicker in your memory: that kid in the 18th minute. You go back.",
      "He wasn't your focus — but he was worth focusing on. You know that now.",
    ],
    firstTeam: [
      "The analysis doubles back. Player two deserved more time than you gave him.",
      "You revisit the footage in your mind. He was there. He was good.",
      "A professional second read. The overlooked player earns attention.",
    ],
    regional: [
      "Old habits: always watch the one everyone ignores. Pays off again.",
      "Local knowledge flags him. The unfocused player has a name here.",
      "You've seen this before — the quiet one is often the real one.",
    ],
    data: [
      "A secondary data signature stands out on review. You go back to the source.",
      "Pattern matching flags an anomaly in your peripheral data. Worth a look.",
      "The secondary subject's metrics warrant a second analytical pass.",
    ],
  },

  diamondInTheRough: {
    universal: [
      "Somewhere in this match, there is someone special. You will find them.",
      "The best player here isn't the one everyone is watching.",
      "You scan the pitch with purpose. One name will leave with you.",
    ],
    youth: [
      "Somewhere in this rabble of kids is one who is genuinely different. You find him.",
      "Every youth session has a diamond if you know how to look. You do.",
      "Your eye catches on something real. The potential is unmistakable.",
    ],
    firstTeam: [
      "Not the headline act — the one who quietly outperforms his surroundings.",
      "The best player here isn't wearing the armband. You've found him.",
      "Your assessment sweeps the squad. One player registers far above the rest.",
    ],
    regional: [
      "Hidden in plain sight. You know this region — you know what to look for.",
      "Local talent often goes unnoticed. Not today. Not by you.",
      "They play for no one important. But their potential is enormous.",
    ],
    data: [
      "The statistical outlier stands out from every angle. This one is different.",
      "Every metric flags the same player. The model is confident. So are you.",
      "Data doesn't lie. The highest ceiling in this squad just revealed itself.",
    ],
  },

  generationalWhisper: {
    universal: [
      "You've never felt this before. This isn't a good player. This is history.",
      "The hairs on the back of your neck. A certainty beyond evidence.",
      "You have seen talent. You have never seen this.",
    ],
    youth: [
      "This kid. This specific kid. He is going to be something that doesn't happen often.",
      "Your career has been worth it just for this moment. The generational read.",
      "You don't tell him. You won't tell anyone yet. But you know.",
    ],
    firstTeam: [
      "The professional certainty is total. This player will be spoken about in decades.",
      "No hesitation. No caveats. You are looking at an elite talent.",
      "Assessment complete. Tier: exceptional. Confidence: absolute.",
    ],
    regional: [
      "This territory has never produced anything like this. Until now.",
      "You've watched players in this region for years. This one is different in every way.",
      "The network already has rumours. You now have certainty.",
    ],
    data: [
      "The model flags a six-sigma outlier. This talent doesn't exist statistically. It does.",
      "No comparable in the dataset. This player resets the baseline.",
      "Algorithmic confidence: maximum. This is a generational talent.",
    ],
  },

  perfectFit: {
    universal: [
      "You see him in your club's shirt. It fits perfectly. Every role, mapped.",
      "The system and the player — they were built for each other.",
      "You close your eyes and imagine him in the starting eleven. It works.",
    ],
    youth: [
      "You see the player he will become — and the system that will make him.",
      "His profile maps to the club's needs in ways that are almost uncanny.",
      "This is not just a good player. This is the right player for this club.",
    ],
    firstTeam: [
      "Positional analysis complete. The fit grades are exceptional across the board.",
      "Every tactical requirement met. The fit data is as clean as it gets.",
      "System compatibility confirmed. This is a plug-and-play signing.",
    ],
    regional: [
      "You've placed players at this club before. This one fits better than any.",
      "The cultural fit complements the tactical fit. A rare alignment.",
      "You can already see how the manager would use him. Perfectly.",
    ],
    data: [
      "The positional fit model runs clean. Every metric maps to a club requirement.",
      "Statistical role alignment confirmed. Fit scores above 80 across all positions.",
      "Data-driven system match: the player's profile is purpose-built for this setup.",
    ],
  },

  pressureTest: {
    universal: [
      "You put him in the biggest moment you can imagine. Watch how he responds.",
      "The lights come on in your mind. He doesn't flinch. Or he does.",
      "You've seen pressure break better players. The question is whether it breaks this one.",
    ],
    youth: [
      "Big games expose young players. You know this boy's truth now.",
      "He'll face moments that define careers. How will he stand up? You know.",
      "The fantasy scenario plays out in your mind. His character emerges.",
    ],
    firstTeam: [
      "High-stakes simulation: the player's big-game response, projected with accuracy.",
      "You've watched him in the biggest moments. The assessment is categorical.",
      "Pressure response grade confirmed. The verdict is in.",
    ],
    regional: [
      "Players from this region carry pressure differently. You know the signs.",
      "You've seen him in tight moments. Now you know exactly what they reveal.",
      "Local derbies, title deciders — you've seen how this type responds.",
    ],
    data: [
      "Pressure performance metrics cross-referenced. Big-game temperament: quantified.",
      "The high-leverage data cluster isolates the variable. Clear read.",
      "Statistical pressure model confirms the assessment. Temperament score locked.",
    ],
  },

  networkPulse: {
    universal: [
      "The network lights up. Everyone has something to say. Tonight, they all say it.",
      "You make the calls. They pick up. They all pick up.",
      "A moment of connection — every contact has been waiting to talk.",
    ],
    youth: [
      "Youth football runs on whispers. Tonight every whisper reaches you.",
      "The network knows about the kids before anyone else does. You tap in.",
      "Coaches, parents, teachers — they talk. Tonight you hear all of it.",
    ],
    firstTeam: [
      "The professional network operates in bursts. Tonight is a burst.",
      "Agents, coaches, club staff — the intel flows without the usual friction.",
      "Your reputation in this world earns moments like this. The contacts deliver.",
    ],
    regional: [
      "Every contact in the region responds at once. A perfect pulse.",
      "This is why you built this network. It pays out in full tonight.",
      "The region speaks. You listen. Every piece of intel arrives cleanly.",
    ],
    data: [
      "Network graph activation: maximum. Signal-to-noise ratio: high.",
      "The human data layer synchronises. Every node returns a clean output.",
      "Contact response rate: 100%. Intel quality: above baseline. Processing.",
    ],
  },

  territoryMastery: {
    universal: [
      "You know this ground as well as you know your own home. It shows.",
      "Something crystallises. This territory is yours.",
      "Every hour spent here adds up. In this moment, it all converges.",
    ],
    youth: [
      "You've watched more youth football in this region than anyone alive.",
      "The fields, the coaches, the patterns — it is all part of you now.",
      "Mastery doesn't happen overnight. But here, right now — it arrives.",
    ],
    firstTeam: [
      "Territorial expertise confirmed. This sub-region is no longer foreign ground.",
      "Assessment fluency in this territory is now maximal. The advantage is permanent.",
      "Professional mastery crystallised. Every future visit here benefits from today.",
    ],
    regional: [
      "This is your territory. Always was. Now the map agrees.",
      "The local knowledge is bone-deep. Every future visit will reflect that.",
      "You've earned the right to call this ground yours. The mastery is real.",
    ],
    data: [
      "Sub-region data model: calibrated to elite precision. Permanent bias correction applied.",
      "The regional algorithm internalises the territory. Confidence ceiling raised.",
      "Data mastery confirmed. This territory's noise floor drops permanently.",
    ],
  },

  algorithmicEpiphany: {
    universal: [
      "The model runs clean. Every parameter aligns. The output is perfect.",
      "A moment of mathematical clarity. The query returns truth.",
      "You've been waiting for this. The algorithm delivers.",
    ],
    youth: [
      "The statistical model sees what the eye misses. Young talent, uncovered.",
      "The numbers point the way. Potential, quantified cleanly.",
      "Data and instinct in perfect agreement. A rare and powerful moment.",
    ],
    firstTeam: [
      "Analytical precision: maximum. The query surface is noise-free.",
      "The model runs at capacity. The output is as clean as data gets.",
      "Perfect recall meets perfect analysis. The epiphany delivers.",
    ],
    regional: [
      "Regional data combined with local knowledge. The result is unprecedented.",
      "The algorithm and the territory speak as one. A rare convergence.",
      "Data precision, earned by presence. The two reinforce each other.",
    ],
    data: [
      "Algorithmic epiphany achieved. Query accuracy: 100%. Model confidence: maximum.",
      "The dataset resolves without distortion. This is what the system was built for.",
      "Perfect query cycle. Every variable controlled. Output: ground truth.",
    ],
  },

  marketBlindSpot: {
    universal: [
      "The market doesn't see what you see. That is the opportunity.",
      "Undervalued. Overlooked. Not by you.",
      "The gap between price and quality — you've found it.",
    ],
    youth: [
      "Young players are chronically mispriced. The market has missed these ones.",
      "Potential that hasn't been monetised yet. You know who to call.",
      "The academy system hasn't caught these names. Your model has.",
    ],
    firstTeam: [
      "Market inefficiency confirmed. The club can act before prices correct.",
      "The valuation gap is real and measurable. These players are available.",
      "Arbitrage opportunity identified. Professional grade, amateur pricing.",
    ],
    regional: [
      "The region is always mispriced by outsiders. You know the truth.",
      "Local market knowledge reveals the blindspot. These names are real.",
      "Under the radar. Under the market. These players are gold.",
    ],
    data: [
      "Market inefficiency model fires. Undervaluation confirmed across all metrics.",
      "The algorithm has found the arbitrage. PA-to-price ratio: exceptional.",
      "Blind spot identified. The market will correct. Move first.",
    ],
  },
};

/**
 * Selects a narrative string for an action, biased toward the scout's
 * active specialization. Falls back to "universal" if the specialization
 * doesn't have a separate entry for the action (it always does here, but the
 * pattern is defensive).
 */
function selectNarrative(
  actionId: InsightActionId,
  spec: Specialization,
  rng: RNG,
): string {
  const actionNarratives = INSIGHT_NARRATIVES[actionId];
  const specLines = actionNarratives[spec];
  const flavor = getSpecializationFlavor(spec);
  const line = rng.pick(specLines);
  // Blend the specialization flavor prefix into the selected line naturally.
  // If the line already starts with a strong opener, append the flavor as a
  // suffix clause rather than a prefix to avoid awkward repetition.
  return `${flavor} — ${line}`;
}

// =============================================================================
// HELPER UTILITIES
// =============================================================================

/**
 * Derives the set of PlayerAttribute keys that were hinted at during the
 * current session's moment history. Used by clarityOfVision to determine
 * which attributes are "in scope" for a perfect read.
 */
function getSessionHintedAttributes(session: ObservationSession): string[] {
  const seen = new Set<string>();
  for (const phase of session.phases) {
    for (const moment of phase.moments) {
      for (const attr of moment.attributesHinted) {
        seen.add(attr);
      }
    }
  }
  return Array.from(seen);
}

/**
 * Returns all PlayerMoments from the session that belong to a given player,
 * across all phases.
 */
function getMomentsForPlayer(
  session: ObservationSession,
  playerId: string,
): PlayerMoment[] {
  const result: PlayerMoment[] = [];
  for (const phase of session.phases) {
    for (const moment of phase.moments) {
      if (moment.playerId === playerId) {
        result.push(moment);
      }
    }
  }
  return result;
}

/**
 * Returns the IDs of players in the session who were NOT focused on at all,
 * ordered by descending average moment quality so the best unfocused player
 * floats to the top.
 */
function getUnfocusedPlayersByQuality(session: ObservationSession): string[] {
  const focusedSet = new Set(
    session.players
      .filter((sp) => sp.focusedPhases.length > 0)
      .map((sp) => sp.playerId),
  );

  // Aggregate moment quality per unfocused player
  const qualityMap = new Map<string, { total: number; count: number }>();
  for (const phase of session.phases) {
    for (const moment of phase.moments) {
      if (focusedSet.has(moment.playerId)) continue;
      const existing = qualityMap.get(moment.playerId) ?? { total: 0, count: 0 };
      qualityMap.set(moment.playerId, {
        total: existing.total + moment.quality,
        count: existing.count + 1,
      });
    }
  }

  return Array.from(qualityMap.entries())
    .map(([playerId, { total, count }]) => ({
      playerId,
      avgQuality: count > 0 ? total / count : 0,
    }))
    .sort((a, b) => b.avgQuality - a.avgQuality)
    .map((entry) => entry.playerId);
}

/**
 * Derives a WonderkidTier label from a raw potentialAbility value.
 * Mirrors the tier boundaries defined in core/types.ts.
 */
function paToWonderkidTier(
  pa: number,
): "generational" | "worldClass" | "qualityPro" | "journeyman" {
  if (pa >= 180) return "generational";
  if (pa >= 150) return "worldClass";
  if (pa >= 100) return "qualityPro";
  return "journeyman";
}

/**
 * Converts a WonderkidTier to a human-readable signal phrase used in
 * generationalWhisper narratives.
 */
function tierToSignalPhrase(
  tier: "generational" | "worldClass" | "qualityPro" | "journeyman",
): string {
  switch (tier) {
    case "generational":
      return "a once-in-a-generation talent";
    case "worldClass":
      return "a future world-class player";
    case "qualityPro":
      return "a quality professional";
    case "journeyman":
      return "a solid journeyman";
  }
}

/**
 * Computes a 0-100 positional fit score for a given player and position.
 * The heuristic weights attributes important to each position.
 *
 * This is deliberately opinionated and simplified — the engine owns "truth"
 * about fit, and the scout's job is to discover it via perfectFit.
 */
function computePositionalFit(player: Player, position: string): number {
  const a = player.attributes;

  // Weight vectors: [attributeKey, weight (0-1)]
  const weights: Record<string, Array<[keyof typeof a, number]>> = {
    GK: [
      ["composure", 0.25],
      ["anticipation", 0.2],
      ["decisionMaking", 0.2],
      ["positioning", 0.2],
      ["jumping", 0.15],
    ],
    CB: [
      ["tackling", 0.2],
      ["heading", 0.2],
      ["defensiveAwareness", 0.2],
      ["strength", 0.15],
      ["marking", 0.15],
      ["composure", 0.1],
    ],
    LB: [
      ["pace", 0.2],
      ["crossing", 0.2],
      ["tackling", 0.15],
      ["defensiveAwareness", 0.15],
      ["stamina", 0.15],
      ["agility", 0.15],
    ],
    RB: [
      ["pace", 0.2],
      ["crossing", 0.2],
      ["tackling", 0.15],
      ["defensiveAwareness", 0.15],
      ["stamina", 0.15],
      ["agility", 0.15],
    ],
    CDM: [
      ["tackling", 0.2],
      ["positioning", 0.2],
      ["pressing", 0.15],
      ["defensiveAwareness", 0.2],
      ["passing", 0.15],
      ["workRate", 0.1],
    ],
    CM: [
      ["passing", 0.2],
      ["vision", 0.2],
      ["stamina", 0.15],
      ["decisionMaking", 0.2],
      ["workRate", 0.1],
      ["firstTouch", 0.15],
    ],
    CAM: [
      ["vision", 0.25],
      ["passing", 0.2],
      ["dribbling", 0.15],
      ["firstTouch", 0.15],
      ["decisionMaking", 0.15],
      ["offTheBall", 0.1],
    ],
    LW: [
      ["pace", 0.25],
      ["dribbling", 0.2],
      ["crossing", 0.15],
      ["finishing", 0.15],
      ["agility", 0.15],
      ["offTheBall", 0.1],
    ],
    RW: [
      ["pace", 0.25],
      ["dribbling", 0.2],
      ["crossing", 0.15],
      ["finishing", 0.15],
      ["agility", 0.15],
      ["offTheBall", 0.1],
    ],
    ST: [
      ["finishing", 0.25],
      ["shooting", 0.2],
      ["heading", 0.15],
      ["strength", 0.15],
      ["pace", 0.1],
      ["offTheBall", 0.15],
    ],
  };

  const posWeights = weights[position];
  if (!posWeights) {
    // Unknown position: return a neutral mid-range score
    return 50;
  }

  // Weighted sum normalised to 0-100.
  // Attribute values are 1-20; max weighted sum = 20 * sum(weights) = 20.
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [attr, weight] of posWeights) {
    const value = a[attr] ?? 1;
    weightedSum += value * weight;
    totalWeight += weight;
  }

  const normalised = weightedSum / (20 * totalWeight);
  return Math.round(normalised * 100);
}

// =============================================================================
// INDIVIDUAL ACTION HANDLERS
// =============================================================================

function clarityOfVision(
  context: InsightActionContext,
  rng: RNG,
  fizzled: boolean,
): InsightActionResult {
  const { session, targetPlayerId, players, scout } = context;
  const narrative = selectNarrative("clarityOfVision", scout.primarySpecialization, rng);

  if (!targetPlayerId) {
    return {
      actionId: "clarityOfVision",
      success: false,
      narrative: `${narrative} — but there was no focused player to apply it to.`,
    };
  }

  const player = players[targetPlayerId];
  if (!player) {
    return {
      actionId: "clarityOfVision",
      success: false,
      narrative: `${narrative} — but the player could not be located.`,
    };
  }

  // Collect all attributes that appeared in session moments (visible scope)
  let attributeScope = getSessionHintedAttributes(session) as Array<
    keyof typeof player.attributes
  >;

  // If no moments hinted at attributes (edge case), fall back to all non-hidden attributes
  if (attributeScope.length === 0) {
    attributeScope = [
      ...TECHNICAL_ATTRIBUTES,
      ...PHYSICAL_ATTRIBUTES,
      ...MENTAL_ATTRIBUTES,
      ...TACTICAL_ATTRIBUTES,
    ] as Array<keyof typeof player.attributes>;
  }

  // Fizzle: reveal only half the attributes at reduced confidence
  const confidence = fizzled ? 0.7 : 1.0;
  const revealCount = fizzled
    ? Math.max(1, Math.floor(attributeScope.length / 2))
    : attributeScope.length;

  const shuffled = rng.shuffle(attributeScope).slice(0, revealCount);

  const observations = shuffled.map((attr) => ({
    playerId: targetPlayerId,
    attribute: attr as string,
    trueValue: player.attributes[attr as keyof typeof player.attributes] ?? 1,
  }));

  const outcomeNote = fizzled
    ? ` (fizzled — ${revealCount} of ${attributeScope.length} attributes revealed at ${confidence} confidence)`
    : ` — all ${revealCount} visible attributes perfectly read.`;

  return {
    actionId: "clarityOfVision",
    success: !fizzled,
    narrative: narrative + outcomeNote,
    observations,
  };
}

function hiddenNature(
  context: InsightActionContext,
  rng: RNG,
  fizzled: boolean,
): InsightActionResult {
  const { targetPlayerId, players, scout } = context;
  const narrative = selectNarrative("hiddenNature", scout.primarySpecialization, rng);

  if (!targetPlayerId) {
    return {
      actionId: "hiddenNature",
      success: false,
      narrative: `${narrative} — but there was no player to reveal.`,
    };
  }

  const player = players[targetPlayerId];
  if (!player) {
    return {
      actionId: "hiddenNature",
      success: false,
      narrative: `${narrative} — but the player data was unavailable.`,
    };
  }

  const allHidden = [...HIDDEN_ATTRIBUTES]; // ["injuryProneness","consistency","bigGameTemperament","professionalism"]
  const revealCount = fizzled ? 2 : allHidden.length;
  const chosen = rng.shuffle(allHidden).slice(0, revealCount);

  const revealedAttributes = chosen.map((attr) => ({
    playerId: targetPlayerId,
    attribute: attr as string,
    value: player.attributes[attr as keyof typeof player.attributes] ?? 1,
  }));

  const outcomeNote = fizzled
    ? ` (fizzled — ${revealCount} of ${allHidden.length} hidden attributes revealed)`
    : ` — all four hidden attributes exposed.`;

  return {
    actionId: "hiddenNature",
    success: !fizzled,
    narrative: narrative + outcomeNote,
    revealedAttributes,
  };
}

function theVerdict(
  context: InsightActionContext,
  rng: RNG,
  fizzled: boolean,
): InsightActionResult {
  const { scout } = context;
  const narrative = selectNarrative("theVerdict", scout.primarySpecialization, rng);
  const bonus = fizzled ? 18 : 30;

  const outcomeNote = fizzled
    ? ` (fizzled — +${bonus} report quality bonus instead of +30)`
    : ` (+${bonus} report quality bonus applied)`;

  return {
    actionId: "theVerdict",
    success: !fizzled,
    narrative: narrative + outcomeNote,
    reportQualityBonus: bonus,
  };
}

function secondLook(
  context: InsightActionContext,
  rng: RNG,
  fizzled: boolean,
): InsightActionResult {
  const { session, players, scout } = context;
  const narrative = selectNarrative("secondLook", scout.primarySpecialization, rng);

  const unfocusedByQuality = getUnfocusedPlayersByQuality(session);
  if (unfocusedByQuality.length === 0) {
    return {
      actionId: "secondLook",
      success: false,
      narrative: `${narrative} — but every player in the session was already focused on.`,
    };
  }

  const chosenPlayerId = unfocusedByQuality[0];
  const player = players[chosenPlayerId];
  if (!player) {
    return {
      actionId: "secondLook",
      success: false,
      narrative: `${narrative} — but the player's data could not be retrieved.`,
    };
  }

  // Collect attributes hinted at in that player's moments
  const playerMoments = getMomentsForPlayer(session, chosenPlayerId);
  const attrSet = new Set<string>();
  for (const m of playerMoments) {
    for (const attr of m.attributesHinted) {
      attrSet.add(attr as string);
    }
  }

  const attributeScope = Array.from(attrSet) as Array<
    keyof typeof player.attributes
  >;

  if (attributeScope.length === 0) {
    return {
      actionId: "secondLook",
      success: false,
      narrative: `${narrative} — but there were no observable moments for that player.`,
    };
  }

  const confidence = fizzled ? 0.6 : 1.0;
  const revealCount = fizzled
    ? Math.max(1, Math.floor(attributeScope.length / 2))
    : attributeScope.length;

  const shuffled = rng.shuffle(attributeScope).slice(0, revealCount);
  const observations = shuffled.map((attr) => ({
    playerId: chosenPlayerId,
    attribute: attr as string,
    trueValue: player.attributes[attr as keyof typeof player.attributes] ?? 1,
  }));

  const outcomeNote = fizzled
    ? ` (fizzled — ${revealCount} attributes at ${confidence} confidence for player ${chosenPlayerId})`
    : ` — ${revealCount} attributes retroactively read for player ${chosenPlayerId}.`;

  return {
    actionId: "secondLook",
    success: !fizzled,
    narrative: narrative + outcomeNote,
    observations,
    discoveredPlayerId: chosenPlayerId,
  };
}

function diamondInTheRough(
  context: InsightActionContext,
  rng: RNG,
  fizzled: boolean,
): InsightActionResult {
  const { session, players, scout } = context;
  const narrative = selectNarrative("diamondInTheRough", scout.primarySpecialization, rng);

  // Scan every player visible in the session
  const sessionPlayerIds = session.players.map((sp) => sp.playerId);
  let bestPlayerId: string | undefined;
  let bestPA = -1;

  for (const pid of sessionPlayerIds) {
    const p = players[pid];
    if (!p) continue;
    if (p.potentialAbility > bestPA) {
      bestPA = p.potentialAbility;
      bestPlayerId = pid;
    }
  }

  if (!bestPlayerId) {
    return {
      actionId: "diamondInTheRough",
      success: false,
      narrative: `${narrative} — but no player data was available.`,
    };
  }

  const player = players[bestPlayerId];

  // Provide a strong signal: true value of one important attribute + PA tier hint
  const tier = paToWonderkidTier(bestPA);
  const tierPhrase = tierToSignalPhrase(tier);

  if (fizzled) {
    // Vague signal: just flag the player, no attribute reads
    return {
      actionId: "diamondInTheRough",
      success: false,
      narrative: `${narrative} — a vague feeling about player ${bestPlayerId}. Something is there, but you can't pin it down.`,
      discoveredPlayerId: bestPlayerId,
    };
  }

  // Strong signal: one confirmed top attribute + PA tier
  const nonHiddenAttrs: Array<keyof typeof player.attributes> = [
    ...TECHNICAL_ATTRIBUTES,
    ...PHYSICAL_ATTRIBUTES,
    ...MENTAL_ATTRIBUTES,
    ...TACTICAL_ATTRIBUTES,
  ] as Array<keyof typeof player.attributes>;

  // Find the player's best visible attribute
  let bestAttr = nonHiddenAttrs[0];
  let bestAttrValue = 0;
  for (const attr of nonHiddenAttrs) {
    const val = player.attributes[attr] ?? 0;
    if (val > bestAttrValue) {
      bestAttrValue = val;
      bestAttr = attr;
    }
  }

  const observations = [
    {
      playerId: bestPlayerId,
      attribute: bestAttr as string,
      trueValue: bestAttrValue,
    },
  ];

  return {
    actionId: "diamondInTheRough",
    success: true,
    narrative: `${narrative} — ${tierPhrase} identified. Their ${bestAttr as string} is exceptional (${bestAttrValue}).`,
    observations,
    discoveredPlayerId: bestPlayerId,
  };
}

function generationalWhisper(
  context: InsightActionContext,
  rng: RNG,
  fizzled: boolean,
): InsightActionResult {
  const { session, players, scout } = context;
  const narrative = selectNarrative("generationalWhisper", scout.primarySpecialization, rng);

  // Identify the highest-PA player in the session
  const sessionPlayerIds = session.players.map((sp) => sp.playerId);
  let bestPlayerId: string | undefined;
  let bestPA = -1;

  for (const pid of sessionPlayerIds) {
    const p = players[pid];
    if (!p) continue;
    if (p.potentialAbility > bestPA) {
      bestPA = p.potentialAbility;
      bestPlayerId = pid;
    }
  }

  if (!bestPlayerId) {
    return {
      actionId: "generationalWhisper",
      success: false,
      narrative: `${narrative} — but you could not isolate the signal.`,
    };
  }

  const tier = paToWonderkidTier(bestPA);
  const tierPhrase = tierToSignalPhrase(tier);
  const reliability = fizzled ? 0.6 : rng.nextFloat(0.9, 1.0);

  const outcomeNote = fizzled
    ? ` (fizzled — reliability reduced to ${reliability.toFixed(2)}): ${tierPhrase} (player ${bestPlayerId})`
    : ` — reliability ${reliability.toFixed(2)}: ${tierPhrase} (player ${bestPlayerId})`;

  return {
    actionId: "generationalWhisper",
    success: !fizzled,
    narrative: narrative + outcomeNote,
    discoveredPlayerId: bestPlayerId,
  };
}

function perfectFit(
  context: InsightActionContext,
  rng: RNG,
  fizzled: boolean,
): InsightActionResult {
  const { targetPlayerId, players, scout } = context;
  const narrative = selectNarrative("perfectFit", scout.primarySpecialization, rng);

  if (!targetPlayerId) {
    return {
      actionId: "perfectFit",
      success: false,
      narrative: `${narrative} — but no target player was specified.`,
    };
  }

  const player = players[targetPlayerId];
  if (!player) {
    return {
      actionId: "perfectFit",
      success: false,
      narrative: `${narrative} — but player data was unavailable.`,
    };
  }

  const allPositions = ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"];

  // Fizzle: only analyse 2 positions instead of all 10
  const positionsToAnalyse = fizzled
    ? rng.shuffle(allPositions).slice(0, 2)
    : allPositions;

  const systemFitData: Record<string, number> = {};
  for (const pos of positionsToAnalyse) {
    systemFitData[pos] = computePositionalFit(player, pos);
  }

  const outcomeNote = fizzled
    ? ` (fizzled — only ${positionsToAnalyse.length} positions analysed)`
    : ` — all 10 positions graded.`;

  return {
    actionId: "perfectFit",
    success: !fizzled,
    narrative: narrative + outcomeNote,
    systemFitData,
  };
}

function pressureTest(
  context: InsightActionContext,
  rng: RNG,
  fizzled: boolean,
): InsightActionResult {
  const { targetPlayerId, players, scout } = context;
  const narrative = selectNarrative("pressureTest", scout.primarySpecialization, rng);

  if (!targetPlayerId) {
    return {
      actionId: "pressureTest",
      success: false,
      narrative: `${narrative} — but no target player was specified.`,
    };
  }

  const player = players[targetPlayerId];
  if (!player) {
    return {
      actionId: "pressureTest",
      success: false,
      narrative: `${narrative} — but player data was unavailable.`,
    };
  }

  const a = player.attributes;

  if (fizzled) {
    // Fizzle: only bigGameTemperament
    return {
      actionId: "pressureTest",
      success: false,
      narrative: `${narrative} (fizzled — only big-game temperament revealed)`,
      revealedAttributes: [
        {
          playerId: targetPlayerId,
          attribute: "bigGameTemperament",
          value: a.bigGameTemperament,
        },
      ],
    };
  }

  return {
    actionId: "pressureTest",
    success: true,
    narrative: `${narrative} — big-game temperament, composure, and leadership exposed.`,
    revealedAttributes: [
      {
        playerId: targetPlayerId,
        attribute: "bigGameTemperament",
        value: a.bigGameTemperament,
      },
      {
        playerId: targetPlayerId,
        attribute: "composure",
        value: a.composure,
      },
      {
        playerId: targetPlayerId,
        attribute: "leadership",
        value: a.leadership,
      },
    ],
  };
}

function networkPulse(
  context: InsightActionContext,
  rng: RNG,
  fizzled: boolean,
): InsightActionResult {
  const { contacts, session, scout } = context;
  const narrative = selectNarrative("networkPulse", scout.primarySpecialization, rng);

  if (!contacts || Object.keys(contacts).length === 0) {
    return {
      actionId: "networkPulse",
      success: false,
      narrative: `${narrative} — but no contacts were available in this region.`,
    };
  }

  const allContacts = Object.values(contacts);
  // Sort by reliability desc so highest-quality contacts go first
  const sorted = [...allContacts].sort((a, b) => b.reliability - a.reliability);

  const contactPool = fizzled
    ? sorted.slice(0, Math.max(1, Math.floor(sorted.length / 2)))
    : sorted;

  const intelTypes: Array<"recommendation" | "warning" | "tip"> = [
    "recommendation",
    "warning",
    "tip",
  ];

  const intelTemplates: Record<"recommendation" | "warning" | "tip", string[]> = {
    recommendation: [
      "has a promising player worth tracking",
      "mentioned someone in their network who is serious talent",
      "recommends you attend the next fixture — there is someone worth seeing",
    ],
    warning: [
      "flagged character concerns about a player you are tracking",
      "warned that the player's attitude in training is a known issue here",
      "cautioned that injury history in this player is more serious than reported",
    ],
    tip: [
      "has heard whispers of a young player coming through quickly",
      "mentioned a contract situation that may open a window soon",
      "tipped that a player's form is about to change significantly",
    ],
  };

  const contactIntel = contactPool.map((contact) => {
    const type = rng.pick(intelTypes);
    const template = rng.pick(intelTemplates[type]);

    // Reference a known player if the contact has any, else give general intel
    const playerId =
      contact.knownPlayerIds.length > 0
        ? rng.pick(contact.knownPlayerIds)
        : null;

    const intel = playerId
      ? `${contact.name} (${contact.organization}) ${template} [player: ${playerId}]`
      : `${contact.name} (${contact.organization}) ${template}`;

    return {
      contactId: contact.id,
      intel,
    };
  });

  const outcomeNote = fizzled
    ? ` (fizzled — ${contactIntel.length} of ${allContacts.length} contacts responded)`
    : ` — ${contactIntel.length} contacts responded.`;

  return {
    actionId: "networkPulse",
    success: !fizzled,
    narrative: narrative + outcomeNote,
    contactIntel,
  };
}

function territoryMastery(
  context: InsightActionContext,
  rng: RNG,
  fizzled: boolean,
): InsightActionResult {
  const { scout, subRegionId } = context;
  const narrative = selectNarrative("territoryMastery", scout.primarySpecialization, rng);

  const bonus = fizzled ? 0.06 : 0.10;
  const regionLabel = subRegionId ?? "current sub-region";

  const outcomeNote = fizzled
    ? ` (fizzled — +${Math.round(bonus * 100)}% confidence in ${regionLabel})`
    : ` — permanent +${Math.round(bonus * 100)}% confidence in ${regionLabel}.`;

  return {
    actionId: "territoryMastery",
    success: !fizzled,
    narrative: narrative + outcomeNote,
    confidenceBonus: bonus,
  };
}

function algorithmicEpiphany(
  context: InsightActionContext,
  rng: RNG,
  fizzled: boolean,
): InsightActionResult {
  const { scout } = context;
  const narrative = selectNarrative("algorithmicEpiphany", scout.primarySpecialization, rng);

  const bonus = fizzled ? 0.6 : 1.0;

  const outcomeNote = fizzled
    ? ` (fizzled — query accuracy bonus reduced to ${bonus})`
    : ` — next database query runs at perfect accuracy (bonus: ${bonus}).`;

  return {
    actionId: "algorithmicEpiphany",
    success: !fizzled,
    narrative: narrative + outcomeNote,
    queryAccuracyBonus: bonus,
  };
}

function marketBlindSpot(
  context: InsightActionContext,
  rng: RNG,
  fizzled: boolean,
): InsightActionResult {
  const { leaguePlayers, scout } = context;
  const narrative = selectNarrative("marketBlindSpot", scout.primarySpecialization, rng);

  if (!leaguePlayers || leaguePlayers.length === 0) {
    return {
      actionId: "marketBlindSpot",
      success: false,
      narrative: `${narrative} — but no league player data was available to analyse.`,
    };
  }

  // Compute undervalue score: high PA relative to low market value
  // Normalise PA (1-200) and market value to a comparable scale.
  // A player is "undervalued" when their PA is high but their market value is low.
  const maxPA = Math.max(...leaguePlayers.map((p) => p.potentialAbility), 1);
  const maxMV = Math.max(...leaguePlayers.map((p) => p.marketValue), 1);

  const scored = leaguePlayers
    .map((player) => {
      const normPA = player.potentialAbility / maxPA; // 0-1
      const normMV = player.marketValue / maxMV; // 0-1
      // High PA + low market value = high undervalue score
      const undervalueScore = normPA - normMV;
      return { playerId: player.id, undervalueScore };
    })
    .filter((entry) => entry.undervalueScore > 0)
    .sort((a, b) => b.undervalueScore - a.undervalueScore);

  const returnCount = fizzled
    ? rng.nextInt(1, 2)
    : Math.min(5, Math.max(3, Math.floor(scored.length * 0.05)));

  const undervaluedPlayers = scored.slice(0, returnCount).map((e) => e.playerId);

  if (undervaluedPlayers.length === 0) {
    return {
      actionId: "marketBlindSpot",
      success: false,
      narrative: `${narrative} — but no undervalued players were found in this dataset.`,
    };
  }

  const outcomeNote = fizzled
    ? ` (fizzled — ${undervaluedPlayers.length} undervalued player${undervaluedPlayers.length > 1 ? "s" : ""} identified)`
    : ` — ${undervaluedPlayers.length} undervalued players identified.`;

  return {
    actionId: "marketBlindSpot",
    success: !fizzled,
    narrative: narrative + outcomeNote,
    undervaluedPlayers,
  };
}

// =============================================================================
// DISPATCH TABLE
// =============================================================================

type ActionHandler = (
  context: InsightActionContext,
  rng: RNG,
  fizzled: boolean,
) => InsightActionResult;

const ACTION_HANDLERS: Record<InsightActionId, ActionHandler> = {
  clarityOfVision,
  hiddenNature,
  theVerdict,
  secondLook,
  diamondInTheRough,
  generationalWhisper,
  perfectFit,
  pressureTest,
  networkPulse,
  territoryMastery,
  algorithmicEpiphany,
  marketBlindSpot,
};

// =============================================================================
// CENTRAL DISPATCH
// =============================================================================

/**
 * Execute an insight action and return its result.
 *
 * @param actionId   - The canonical action identifier.
 * @param context    - All engine data available for this execution.
 * @param rng        - Seeded PRNG for deterministic RNG-driven outcomes.
 * @param fizzled    - When true, the action fires at ~60% effectiveness.
 *                     IP is still spent; cooldown still applies.
 *
 * The dispatcher:
 *  1. Looks up the appropriate handler from the dispatch table.
 *  2. Calls the handler with context, rng, and the fizzle flag.
 *  3. Returns the result exactly as produced by the handler.
 *
 * Fizzle is decided externally (based on scout fatigue and an RNG check in the
 * insight system controller) and passed in here so this module stays pure.
 */
export function executeInsightAction(
  actionId: InsightActionId,
  context: InsightActionContext,
  rng: RNG,
  fizzled: boolean,
): InsightActionResult {
  const handler = ACTION_HANDLERS[actionId];
  return handler(context, rng, fizzled);
}
