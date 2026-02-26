/**
 * Full Observation Mode
 *
 * Generates phase content for live-observation activities: matches,
 * tournaments, training sessions, and trial days. Each phase contains
 * player moments that the scout observes, with venue-specific atmosphere
 * and dynamic events affecting what's visible.
 *
 * This module populates the skeleton phases created by session.ts with
 * rich, interactive content.
 */

import type { RNG } from "@/engine/rng";
import type { ObservationSession, SessionPhase } from "@/engine/observation/types";
import { generateMoments } from "@/engine/observation/moments";
import {
  createVenueAtmosphere,
  generateAtmosphereEvent,
} from "@/engine/observation/atmosphere";

// =============================================================================
// SEGMENT CLASSIFICATION
// =============================================================================

/**
 * Returns the narrative segment a phase belongs to based on its position within
 * the overall session. The boundaries use integer math so the first third maps
 * to 'early', the last third to 'late', and everything in between is 'mid'.
 *
 * Single-phase sessions always return 'early'.
 * Two-phase sessions return 'early' for phase 0 and 'late' for phase 1.
 */
export function getPhaseSegment(
  phaseIndex: number,
  totalPhases: number,
): "early" | "mid" | "late" {
  if (totalPhases <= 1) {
    return "early";
  }

  const thirdLength = totalPhases / 3;

  if (phaseIndex < thirdLength) {
    return "early";
  }

  if (phaseIndex >= totalPhases - thirdLength) {
    return "late";
  }

  return "mid";
}

// =============================================================================
// VENUE DESCRIPTION BANKS
// =============================================================================

/**
 * Narrative descriptions for each venue type, keyed by phase segment.
 * Each segment has 4–5 variants to prevent repetition across sessions.
 * Variants are picked via rng.pick() at generation time.
 */
export const VENUE_DESCRIPTIONS: Record<
  string,
  Record<"early" | "mid" | "late", string[]>
> = {
  schoolMatch: {
    early: [
      "The school match kicks off on a well-kept grass pitch. The PE teacher blows the whistle and both sides fan out instinctively — no preamble, just football.",
      "Bright afternoon light on a compact school ground. The whistle blows sharply and the teams get straight to business. Formation is loose, but enthusiasm is high.",
      "The pitch is short by senior standards but it compresses the action nicely. An early scramble in midfield sets the tone — physical, direct, and eager.",
      "A thin scatter of spectators gathers along the near touchline. Kick-off is brisk. The players are competing hard already — there is something to prove here.",
    ],
    mid: [
      "Play settles into a rhythm. The better-organised side controls possession in tidy triangles while the other defends with numbers and energy.",
      "The match has found its shape now. Individual quality is starting to separate itself from the collective effort — the patterns are becoming readable.",
      "A lull in the scoring opens up space for proper observation. Players are moving more freely and the game reads more naturally from the touchline.",
      "Midway through. Tiredness hasn't arrived yet but legs are beginning to carry the weight of the tempo. Pressing intensity has dropped slightly for both sides.",
      "The better players are beginning to drift into the pockets where the game lives. Their movement is starting to stand out from the surrounding noise.",
    ],
    late: [
      "Final minutes. Both teams pushing for a result — the urgency strips away the careful touches and reveals who still has the legs and the will.",
      "Late in the match, gaps appear everywhere. The players who can exploit them under tired legs are making themselves known.",
      "Closing stages. The fitness differential is deciding the shape of the game now. Character is on full display — who is still running, who has quietly stopped.",
      "Last ten minutes. The score doesn't matter as much as the attitude. A couple of players here are still working as hard as they did in the opening minute.",
    ],
  },

  streetFootball: {
    early: [
      "The street game gets going on a concrete court. No referee, no rules, just skill — the first few minutes set the terms by which everyone else plays.",
      "Impromptu sides picked in seconds and the game is live immediately. The concrete surface punishes loose touches and rewards confidence on the ball.",
      "Evening light and a makeshift pitch. The game explodes into life as soon as the ball drops — nobody is easing in here.",
      "A cage game with traffic noise as the backdrop. The walls come into play immediately — the better players are already reading the angles.",
      "Hard surface, no lines, no authority. The opening minutes are a negotiation of respect — who takes control of the ball, who takes control of the space.",
    ],
    mid: [
      "The game flows freely. Players swap positions, try tricks, take risks — there is no tactical briefing here, only instinct and personality.",
      "Skill moves that would never appear in a structured match are on show now. The freedom of the format is drawing out something unfiltered and real.",
      "The middle stretch of the game has a looseness to it. Arguments flare and die in seconds. Everything is improvised, everything is alive.",
      "Individual battles are developing all over the court. The competitive spirit is intense even without a referee or a whistle to enforce anything.",
    ],
    late: [
      "The sun is setting. Last few plays before darkness calls time on the session — the best players here always seem to save something for the finish.",
      "Fading light but the intensity hasn't dropped. The final exchanges are fierce. These players are competing for something only they can articulate.",
      "The game winds down naturally as the light goes. What remains is the memory of who was outstanding — the one or two who made this pitch feel small.",
      "Last act of the session. No formal end — someone will call time and the ball will stop. Until then, the game belongs to whoever wants it most.",
    ],
  },

  grassrootsTournament: {
    early: [
      "First match of the tournament begins. Parents line the touchline with barely contained energy. The pitch is uneven but nobody is treating it that way.",
      "The opening game of the day. Teams warmed up and ready — coaches with clipboards, players in matching kits that look brand new. Kickoff is decisive.",
      "Tournament morning, first fixture. The dew is still on the grass. Both sides are fresh and nervy — the early exchanges are careful and exploratory.",
      "The day's first whistle. Multiple pitches running simultaneously, each with its own small crowd. The noise builds as the session finds its rhythm.",
      "First game of the competition. Goals have been promised by every manager. Both sides are earnest and direct — they play the way they've been coached.",
    ],
    mid: [
      "Second match of the tournament. The stronger players are beginning to stand out from the group — the accumulated evidence is becoming easier to read.",
      "Midway through the day's programme. Fatigue is beginning to show for some. The players who recover quickly between games are making a note of themselves.",
      "After the first few games the tournament takes shape. The teams at the top of the group know each other now. Individual quality is finding space in the familiarity.",
      "The day is in full swing. The pitch is worn and the crowd has moved around. Players who began nervously have found their confidence — the real performances are arriving.",
      "Group stage continues. The competition level has lifted as the day progresses. The gap between the top players and the average ones is widening with each game.",
    ],
    late: [
      "Tournament final. The pressure is on, and composure separates the talented from the merely athletic — the last game of the day reveals everything.",
      "Knockout stages. The margin for error has gone. Players who've been competent throughout are suddenly facing the true test of whether they can produce when it matters.",
      "Final game of the day. Everyone is tired but the better players are hiding it well. The quality of decision-making under fatigue is the most honest signal left.",
      "Semi-final of the tournament. Tactics tighten, ambitions narrow, and the individual moments carry more weight than at any other point in the day.",
    ],
  },

  academyTrialDay: {
    early: [
      "The academy coaches set up structured drills. Players are numbered, assessed systematically — watched in a way that makes the back of the neck tingle.",
      "Trial day begins with passing drills in grid patterns. The coaches move between stations with clipboards and quiet authority. No one is comfortable yet.",
      "Warm-up complete, first drill underway. Players are already watching each other from the corners of their eyes. The assessment has begun even if no one has said so.",
      "Structured opening session. Possession exercises designed to expose first touch, weight of pass, and willingness to receive under pressure. The environment is controlled and revealing.",
    ],
    mid: [
      "Small-sided game begins. Now the real test — can they translate drill performance into match intelligence? Several players look completely different in the open game.",
      "The session moves into applied work. Rondos and small-sided games with positional tasks. Players are being asked to think and play simultaneously.",
      "Tactical exercises with pressing triggers and positional rules. The players who understand what's being asked of them are standing out immediately.",
      "The afternoon session shifts to match-realistic scenarios. The coaches are watching movement patterns off the ball more than anything else — that's where the decisions live.",
      "Position-specific work reveals understanding. Who tracks, who presses, who finds the pocket — the coaches are building a picture with each repetition.",
    ],
    late: [
      "Full scrimmage. The coaches are watching closely. This is where careers can change — unstructured football after a long structured day strips everything back.",
      "Final phase of the trial. An open game to finish. Players who've been disciplined in structure are now testing the limits of what they'll do with freedom.",
      "Closing scrimmage. The coaches are no longer moving — they're standing and watching. The assessment is entering its decisive stretch.",
      "Last exercise of the day. A competitive game with consequences built in. The trial is almost done and the players who've paced themselves well are lifting now.",
    ],
  },

  youthFestival: {
    early: [
      "Teams from multiple nations warm up on adjacent pitches. The atmosphere is electric for these young players — languages mixing, scouts everywhere, high stakes.",
      "Festival morning. Opening fixtures across the complex. The air is thick with anticipation. For many of these players, this is the biggest stage they've stood on.",
      "Group stage opens. International opposition reveals different styles immediately — the directness of one school colliding with the possession habits of another.",
      "The festival kicks off with a full slate of group games. Parents in national colours line every pitch. The noise level from the start is unlike any club match.",
    ],
    mid: [
      "Second round of group games. International opposition reveals different styles — different rhythms, different physical profiles, different readings of space.",
      "The festival has settled into its structure. Standout players are already being talked about in clusters near the touchline. The scouting community is paying attention.",
      "Group stage progressing. The better teams have identified the key players and begun to shape their tactics around them. The competition has become genuinely interesting.",
      "Midway through the group stages. Some players are handling the international environment brilliantly — elevated, sharper, more present than in any domestic setting.",
      "The afternoon fixtures begin. The surface has taken a beating but the players are still flying. The quality on display varies wildly from pitch to pitch.",
    ],
    late: [
      "The pressure of knockout rounds brings out true character — who rises to international competition and who retreats to what is safe and familiar.",
      "Semi-final stage. Players who've been reliable across the group games now face the sharpest opponents of the tournament. Everything they have is needed now.",
      "Festival final. The largest crowd of the day is gathered. Scouts have reorganised their position to get the best view. What follows will be remembered.",
      "Final day of the competition. Results have shaped the draw and now the bracket is set. The players left standing are the ones who wanted this most.",
    ],
  },

  attendMatch: {
    early: [
      "Kick-off. The stadium hum lifts instantly and the first phase sets the contest's terms — physicality, tempo, and the first signals about which players will dominate.",
      "Opening minutes of a professional fixture. Both sides are measured, feeling out the opponent. The crowd is alert. The game hasn't found its speed yet.",
      "Early exchanges in a compact, high-tempo match. The pitch is excellent. The standard is clear from the first three passes — this is serious football.",
      "The first phase of what looks like a hard-fought professional match. Intensity is high from the opening whistle. Early pressure is being applied immediately.",
    ],
    mid: [
      "The match has found its shape. Both teams are settled. The patterns are repeatable and observable — the tactical picture is becoming clear.",
      "Midway point. The contest has opened up and players are making more decisive runs. This is when individual quality separates itself from collective structure.",
      "A relatively open period in the match. The transitions are sharp and revealing. Wide areas are being exploited for the first time.",
      "Late in the first half. The match is in its most legible phase — the shape is set, the personnel are positioned, and the picture is clean from the touchline.",
      "Opening phase of the second half. The substitute has changed the tactical flow. New match dynamics are settling in.",
    ],
    late: [
      "Final minutes. The result is still in the balance. Tired legs and tactical substitutions are compressing the game — the players who still look fresh are answering the biggest question.",
      "Closing stages of a professional fixture. The match is still competitive. The level of intensity from the individuals who are still pressing is remarkable.",
      "Late pressure from the trailing side. Defensive blocks and transitional runs are creating the clearest physical and mental signals of the match.",
      "The clock runs down. Injury time approaches. The players who are still driving — still working — are the ones worth the flight back for.",
    ],
  },

  reserveMatch: {
    early: [
      "The reserve fixture kicks off on a sparse ground. A few coaches and scouts ring the pitch. The players know what this game means to their careers.",
      "Opening minutes of a reserve match. The standard is uneven but the stakes for individuals are high — this group is competing for a handful of first-team openings.",
      "Early phase of a quiet reserve fixture. The silence makes the good moments easier to pick out. Every mistake is audible from here.",
      "Reserve game starts. Both squads are a mix of developing youngsters and first-team fringe players. The quality differential within each team is visible from the opening phase.",
    ],
    mid: [
      "The reserve match has found a rhythm. The better players are beginning to control the game's tempo. The gap between the ready and the not-quite-ready is expanding.",
      "Second half of the reserve fixture. The players who were strongest in the first half are consolidating that impression. A couple of others are still fighting to change the narrative.",
      "Midway through the game. Fatigue is not yet a factor. The tactics are clear and simple. What's left is just individual quality — how well can each player play?",
      "A quiet stretch in the reserve match. The ball moves at a deliberate pace. In this stillness, small decisions become visible in a way they can't at higher intensity.",
    ],
    late: [
      "Final phase of the reserve game. Players who have had a strong match are beginning to look for the moment that cements it.",
      "Closing stages. The fitness work that was done in pre-season is separating the players who are training-ground-ready from those who are match-ready.",
      "Last few minutes of the reserve fixture. The substitutes have had their time. The original starters who are still on are answering the question of durability.",
      "The reserve match winds down. The full-timers ring the pitch still. This was a long 90 minutes for the players who needed to impress — and they know it.",
    ],
  },

  trialMatch: {
    early: [
      "The trial match kicks off with a knowledgeable audience. Every player knows a professional career may hinge on the next 90 minutes. The opening exchanges reflect that weight.",
      "High-stakes trial fixture. Kick-off is clean and both sides start with purpose. The players who look most comfortable right now — despite everything riding on this — are the interesting ones.",
      "Trial game begins. The scouts are positioned around the ground. The pressure is physical — you can feel it in the over-tight touches of the opening minutes.",
      "Opening exchanges of a trial match. Several players are already carrying the visible weight of the occasion. The first few who shed it and just play are worth watching closely.",
    ],
    mid: [
      "The trial has found its competitive level. Players who started nervously are now beginning to play. The ones who were composed from the start are consolidating.",
      "Midway through the trial match. The chaos of the first half has settled. Individual moments are carrying more interpretive weight now that the nerves have been worked off.",
      "Second phase of the trial. Tactics have emerged. The players who've adapted to the team shape fastest are distinguishing themselves from those still looking for instruction.",
      "The trial match is in its most readable phase. Players have settled and the personal stakes are being expressed through the football rather than around it.",
    ],
    late: [
      "Closing stages. A handful of players are still pushing — driving for the ball, pressing for the loose touch — with everything already decided. That says more than any drill.",
      "Final phase of the trial. The players who've impressed throughout are trying to ensure the impression holds. The ones who haven't are making their last push.",
      "Late in the trial match. The coaches have been taking notes all game. The players who still look fresh and competitive in these final minutes have made a compelling case.",
      "Last minutes of a trial fixture. Fatigue is visible across the pitch but one or two players are still running at the pace they set in the first minute. That matters.",
    ],
  },

  scoutingMission: {
    early: [
      "Opening phase of an unfamiliar fixture at the start of a wider scouting mission. The environment is new — the notes, the expectations, and the eye are all adjusting.",
      "The scouting mission begins. First game of a multi-fixture assignment. The opposition is unknown but that uncertainty is part of the observation value.",
      "Kick-off in a venue that required a long journey to reach. The unfamiliarity keeps the eye sharper — every detail feels novel and worth recording.",
      "Early stages of a scouting mission match. The pitch, the crowd, and the quality all need assessing before a frame of reference is established. That process starts now.",
    ],
    mid: [
      "The match is in full flow. Patterns are becoming readable across the pitch. The specific targets are beginning to stand out from the surrounding picture.",
      "The game continues at an unfamiliar pace. The scouting mission is producing a richer picture than expected — one or two players here are operating at an unexpected level.",
      "Mid-phase of the mission fixture. The wider context of the league is becoming clearer through the match. The standard here will calibrate everything that follows this week.",
      "The match's tactical shape is now clear. The observations being gathered will feed into a wider report. Individual standouts are now the priority.",
    ],
    late: [
      "Late in the match at the end of a long scouting mission. The target is still producing — that durability and quality across a full game is exactly what the report needed.",
      "Closing phase of the mission fixture. The standard here has become clear. The targets identified in the early phase have either grown or diminished during the full picture.",
      "Final stretch. The scouting mission reaches its most decisive phase. The impressions gathered here will frame the recommendation that goes back to the club.",
      "Last minutes of the final fixture on this mission. The full picture is assembling. The journey was worth it if the analysis confirms what the eye has been suggesting.",
    ],
  },

  trainingVisit: {
    early: [
      "Training session begins with a warm-up and passing drills. No audience, no pressure — the movements are habitual and honest. This is what the player actually does.",
      "The training visit opens with rondos and short passing sequences. The coaching staff is involved but not intrusive. The players are working and talking freely.",
      "Early phase of a training observation. The warm-up is professional and purposeful. The way a player approaches these invisible minutes says a great deal.",
      "The session starts with positional shape and activation drills. Technical habits that are invisible in matches are appearing clearly here — there is no adrenaline to compensate.",
    ],
    mid: [
      "The session moves to tactical exercises. Position-specific work reveals understanding — who positions intelligently when the ball is on the other side, who drifts and disconnects.",
      "Applied tactical phase of the training session. Pressing shapes and defensive compactness are being drilled. The players who understand the detail without needing it repeated are the ones to follow.",
      "The session's technical work has given way to competitive scenarios. The transition between drill habits and match habits is the most revealing part of any training observation.",
      "Game-realistic exercises underway. The intensity has risen and the patterns are being stress-tested. A couple of players are working above the level of the session.",
      "Mid-session phase. Complex positional tasks on a tight pitch. The players who don't need the coach to set them right after each repetition are quickly identifiable.",
    ],
    late: [
      "The session finishes with a small-sided game. The tactical and technical work of the session feeds directly into this — who has absorbed the session's lessons is now clear.",
      "Final phase of the training visit: a live practice game. The freedom of the format after a structured session draws out personality and improvisation in equal measure.",
      "Closing part of the session. A competitive small-sided game to finish. Players are competing hard despite the late stage of the day — the workrate standard here is high.",
      "End of the training session. The small-sided game that closes the day is as revealing as any fixture. The players who sustain their standard all the way to the final whistle are noted.",
    ],
  },
};

// =============================================================================
// GENERIC MATCH DESCRIPTIONS (MINUTE-BASED FALLBACK)
// =============================================================================

/**
 * Minute-range descriptions for generic match venues that do not have a
 * dedicated entry in VENUE_DESCRIPTIONS (or as a fallback for edge cases).
 * Keyed by the lower bound of each 15-minute bracket.
 */
const GENERIC_MATCH_DESCRIPTIONS: Record<number, string[]> = {
  0: [
    "Kick-off. Both sides feel each other out with probing passes and high defensive lines. The opening moves are revealing in their own careful way.",
    "The match starts briskly. High press from both teams in the first minutes — the physical and mental signals are unusually clear this early.",
    "Opening exchanges. The tempo is high from the first whistle. Early ball movement patterns suggest which side has prepared for this specific opponent.",
    "Kick-off and the game is immediately competitive. Both managers have set up to be difficult rather than expressive — the opening phase is attritional.",
  ],
  15: [
    "Quarter of the game complete. The pressing traps have settled and both teams are beginning to play through the lines. The picture is clarifying.",
    "Fifteen minutes in. The first phase of sustained possession for either side has established which midfield is controlling the tempo.",
    "The match has passed its cautious opening. Players are now competing for the ball with conviction rather than consideration.",
    "After a tentative start, the game has found its pace. A cleaner phase now — the transitions are sharp and the individual battles are being decided.",
  ],
  30: [
    "The game's tactical spine is now visible. Both managers are operating the shapes they drilled in the week — the test is whether the players execute them under pressure.",
    "Half-hour in. The match is in its deepest phase of structure before the half-time adjustments. Patterns are reliable and readable from the touchline.",
    "Thirty minutes. One side is beginning to control possession more consistently. The better-organised unit is starting to squeeze the space.",
    "The game is approaching the final stretch of the first half. Both sides are still competitive but the balance of quality is starting to tilt one way.",
  ],
  45: [
    "Second half begins. Both managers have spoken — formations tightened or released based on what the first half showed. The new phase is starting with visible intent.",
    "The restart after half-time brings a change in tempo. Fresh legs are making more ground than tired ones did in the dying minutes of the first half.",
    "Second half kick-off. One substitution from each bench has changed the shape slightly. The early second-half period reveals which team has the more adaptable plan.",
    "The match continues into its second half. One team's approach has adjusted sharply from the break — it will be interesting to see how long the new structure holds.",
  ],
  60: [
    "An hour of football. The physical peaks have passed and tactical intelligence is carrying the teams forward. Decision-making speed is the metric now.",
    "Sixty minutes in. The scoreline matters here — the team that needs a goal is taking risks. Those risks are creating the most legible attacking moments of the match.",
    "The game enters its most interpretively rich phase. Tiredness is bringing honesty to every action — the technically sound players are maintaining their level while others decline.",
    "One hour gone. The substitutes are having their impact across the pitch. The tactical adjustments are reshaping the game into something different from its first-half form.",
  ],
  75: [
    "Final fifteen minutes. The result is approaching its conclusion. The players who are still pressing, still defending with sharpness — they are answering the biggest question of the evening.",
    "With time running out, the game is being decided by individual moments. The space that is appearing on both flanks is being exploited by whoever has the fastest reading.",
    "Late in the match. Fatigue is tangible on both sides but a handful of players are still driving the tempo. Those are the ones worth the journey to see.",
    "Closing stages. The game is in its final phase. The players who've maintained their level — technical quality, pressing intensity, positional discipline — all the way through are standing out.",
  ],
};

// =============================================================================
// PHASE DESCRIPTION GENERATOR
// =============================================================================

/**
 * Returns the minute bracket key that best covers the given match minute.
 * Brackets are 0, 15, 30, 45, 60, 75 — the highest bracket that does not
 * exceed the current minute is selected.
 */
function getMinuteBracket(minute: number): number {
  const brackets = [75, 60, 45, 30, 15, 0] as const;
  for (const bracket of brackets) {
    if (minute >= bracket) {
      return bracket;
    }
  }
  return 0;
}

/**
 * Generates a narrative description for a single observation phase.
 *
 * For venues with entries in VENUE_DESCRIPTIONS, the segment ('early', 'mid',
 * 'late') determines which description pool is used and rng.pick() selects
 * a specific variant. For generic match types and unknown venues, descriptions
 * are driven by the match minute range instead.
 *
 * @param venueType   - The activity/venue type string (matches keys in VENUE_DESCRIPTIONS).
 * @param phaseIndex  - 0-based index of the current phase.
 * @param totalPhases - Total phases in the session.
 * @param minute      - Match minute or step counter assigned to this phase.
 * @param rng         - Seeded RNG instance for variant selection.
 */
export function generatePhaseDescription(
  venueType: string,
  phaseIndex: number,
  totalPhases: number,
  minute: number,
  rng: RNG,
): string {
  const venueBank = VENUE_DESCRIPTIONS[venueType];

  if (venueBank) {
    const segment = getPhaseSegment(phaseIndex, totalPhases);
    const pool = venueBank[segment];
    return rng.pick(pool);
  }

  // Fallback: minute-bracket generic match descriptions.
  const bracket = getMinuteBracket(minute);
  const pool = GENERIC_MATCH_DESCRIPTIONS[bracket] ?? GENERIC_MATCH_DESCRIPTIONS[0];
  return rng.pick(pool);
}

// =============================================================================
// ATMOSPHERE PROBABILITY SCALING
// =============================================================================

/**
 * Applies a per-phase atmosphere event to a phase if one fires.
 * Returns a new phase with the atmosphereEvent field set, or the
 * original phase unchanged when no event fires.
 *
 * The atmosphere must already be created before calling this function.
 */
function applyAtmosphereEvent(
  phase: SessionPhase,
  rng: RNG,
  atmosphere: ReturnType<typeof createVenueAtmosphere>,
  totalPhases: number,
): SessionPhase {
  const event = generateAtmosphereEvent(rng, atmosphere, phase.index, totalPhases);

  if (event === null) {
    return phase;
  }

  return { ...phase, atmosphereEvent: event };
}

// =============================================================================
// CORE POPULATOR
// =============================================================================

/**
 * Populates all skeleton phases of a Full Observation session with content:
 * moments, atmosphere events, and narrative descriptions.
 *
 * Input contract:
 *   - session.state must be 'setup'.
 *   - session.phases contains skeleton phases created by session.ts
 *     (moments: [], description: "", atmosphereEvent: undefined).
 *   - session.players must contain at least one SessionPlayer.
 *
 * Returns a new session object in 'setup' state with all phases populated.
 * The caller (store or game-loop function) transitions the session to 'active'
 * by calling startSession() from session.ts.
 *
 * Guard behaviour: if the session is not in 'setup' state, or the mode is not
 * 'fullObservation', the session is returned unchanged. This allows callers
 * to defensively call populateFullObservationPhases without checking mode first.
 */
export function populateFullObservationPhases(
  session: ObservationSession,
  rng: RNG,
): ObservationSession {
  if (session.state !== "setup") {
    return session;
  }

  if (session.mode !== "fullObservation") {
    return session;
  }

  if (session.players.length === 0) {
    return session;
  }

  // Resolve the effective venue type. Prefer the venueAtmosphere's venueType
  // when already set (e.g. pre-populated by caller), otherwise use activityType.
  const venueType = session.venueAtmosphere?.venueType ?? session.activityType;

  // Create venue atmosphere if one does not already exist on the session.
  const atmosphere =
    session.venueAtmosphere ?? createVenueAtmosphere(venueType, rng);

  const totalPhases = session.phases.length;

  const populatedPhases: SessionPhase[] = session.phases.map((phase) => {
    // 1. Generate player moments for this phase.
    const moments = generateMoments(
      rng,
      session.players,
      venueType,
      phase.index,
      totalPhases,
      atmosphere,
    );

    // 2. Generate a narrative description for this phase.
    const description = generatePhaseDescription(
      venueType,
      phase.index,
      totalPhases,
      phase.minute,
      rng,
    );

    // 3. Optionally attach an atmosphere event.
    const phaseWithMoments: SessionPhase = {
      ...phase,
      moments,
      description,
    };

    return applyAtmosphereEvent(phaseWithMoments, rng, atmosphere, totalPhases);
  });

  return {
    ...session,
    phases: populatedPhases,
    venueAtmosphere: atmosphere,
  };
}
