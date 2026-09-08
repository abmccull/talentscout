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
import type { Player } from "@/engine/core/types";
import type { ObservationSession, SessionPhase } from "@/engine/observation/types";
import { generateMoments, sampleSessionPerformance } from "@/engine/observation/moments";
import {
  createVenueAtmosphere,
  generateAtmosphereEvent,
} from "@/engine/observation/atmosphere";
import {
  applyAtmosphereToObservationSituation,
  createObservationSituation,
} from "@/engine/observation/situations";
import { buildContextualScoutingQuestions } from "@/engine/observation/questions";

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
      "The whistle cuts across the compact school ground. The teams spread out and the first exchanges begin.",
      "The pitch is short by senior standards but it compresses the action nicely. An early scramble in midfield sets the tone — physical, direct, and eager.",
      "A thin scatter of spectators gathers along the near touchline. Kick-off is brisk. The players are competing hard already — there is something to prove here.",
    ],
    mid: [
      "Play settles into a rhythm. Watch how each side uses the space around midfield.",
      "The match has found its shape. Repeated passages may help put an earlier impression in context.",
      "The next passage offers another observation. Choose a player to follow rather than assuming the whole picture is clear.",
      "Midway through. Keep earlier workload in mind as you watch pressing and recovery.",
      "Midfield pockets offer another place to focus. Watch the movement before deciding whether it creates a useful option.",
    ],
    late: [
      "Final minutes. The closing exchanges offer another chance to watch decisions and recovery runs.",
      "Late in the match, space opens between the lines. Following one runner may mean missing another.",
      "Closing stages. Watch the next effort or response to a setback; one passage cannot settle a judgment about character.",
      "The match approaches its end. Compare a late effort with an earlier passage before judging whether it forms a pattern.",
    ],
  },

  streetFootball: {
    early: [
      "The street game gets going on a concrete court. No referee, no rules, just skill — the first few minutes set the terms by which everyone else plays.",
      "Impromptu sides picked in seconds and the game is live immediately. The concrete surface punishes loose touches and rewards confidence on the ball.",
      "A makeshift pitch and a quick start. The game gets moving as soon as the ball drops.",
      "A cage game with traffic noise as the backdrop. The walls bring different passing angles into play.",
      "Hard surface, no lines, no authority. The opening minutes are a negotiation of respect — who takes control of the ball, who takes control of the space.",
    ],
    mid: [
      "The game flows freely. Players swap positions, try tricks, and take risks without a formal tactical briefing.",
      "The open format leaves room for improvisation. An action here may need testing again in a structured match.",
      "The middle stretch of the game has a looseness to it. Arguments flare and die in seconds. Everything is improvised, everything is alive.",
      "Individual battles are developing all over the court. The competitive spirit is intense even without a referee or a whistle to enforce anything.",
    ],
    late: [
      "The session is nearing its end. A few exchanges remain to revisit an earlier impression.",
      "The final exchanges continue around the court. Choose a player or action to follow before the game stops.",
      "The game winds down naturally. Keep the passages you could follow and leave the unclear ones open.",
      "Last act of the session. No formal end — someone will call time and the ball will stop. Until then, the game belongs to whoever wants it most.",
    ],
  },

  grassrootsTournament: {
    early: [
      "First match of the tournament begins. Parents line the touchline with barely contained energy. The pitch is uneven but nobody is treating it that way.",
      "The opening game of the day. Teams warmed up and ready — coaches with clipboards, players in matching kits that look brand new. Kickoff is decisive.",
      "The tournament gets underway. Both sides gather for the opening fixture before spreading out across the pitch.",
      "The day's first whistle. Multiple pitches running simultaneously, each with its own small crowd. The noise builds as the session finds its rhythm.",
      "First game of the competition. Goals have been promised by every manager. Both sides are earnest and direct — they play the way they've been coached.",
    ],
    mid: [
      "The tournament continues. A new game offers a chance to test whether an earlier observation repeats.",
      "Midway through the programme. Watch recovery between efforts without assuming why a player slows down.",
      "After the first games, the tournament has a familiar rhythm. Keep the level of opposition in mind as you compare passages.",
      "The day is in full swing. Players move between games, giving you another context in which to revisit an early impression.",
      "Group play continues. Different opponents may challenge the same player in different ways.",
    ],
    late: [
      "The final stretch of the tournament adds another competitive setting. Reactions here can add evidence, but cannot reveal everything about a player.",
      "The tournament reaches its closing fixtures. Look for a repeatable response without treating one game as a final verdict.",
      "Final game of the day. Watch decisions after repeated efforts, and keep earlier workload in mind.",
      "Semi-final of the tournament. Tactics tighten, ambitions narrow, and the individual moments carry more weight than at any other point in the day.",
    ],
  },

  academyTrialDay: {
    early: [
      "The academy coaches set up structured drills. Players are numbered, assessed systematically — watched in a way that makes the back of the neck tingle.",
      "Trial day begins with passing drills in grid patterns. The coaches move between stations with clipboards and quiet authority. No one is comfortable yet.",
      "Warm-up complete, first drill underway. Players are already watching each other from the corners of their eyes. The assessment has begun even if no one has said so.",
      "Structured opening session. Possession exercises offer a chance to watch first touch, weight of pass, and receiving options.",
    ],
    mid: [
      "A small-sided game begins. It offers a different setting in which to test an impression from the drills.",
      "The session moves into applied work. Rondos and small-sided games with positional tasks. Players are being asked to think and play simultaneously.",
      "Tactical exercises with pressing triggers and positional rules. Watch how players respond to the instructions.",
      "The session shifts to match-like scenarios. Off-ball movement offers another question to follow.",
      "Position-specific work continues. Tracking, pressing, and finding space each offer a different focus for observation.",
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
      "The festival opens across the complex. Players gather for fixtures against unfamiliar opponents.",
      "Group stage opens. International opposition reveals different styles immediately — the directness of one school colliding with the possession habits of another.",
      "The festival kicks off with a full slate of group games. Parents in national colours line every pitch. The noise level from the start is unlike any club match.",
    ],
    mid: [
      "Second round of group games. International opposition reveals different styles — different rhythms, different physical profiles, different readings of space.",
      "The festival has settled into its schedule. Scouts compare notes near the touchline as another game begins.",
      "Group play continues. Watch how players respond as opponents contest different areas of the pitch.",
      "Midway through group play. The unfamiliar opposition offers another context in which to test your impressions.",
      "Another round of fixtures begins. Moving between pitches brings a fresh set of opponents to consider.",
    ],
    late: [
      "The closing rounds offer a different competitive setting. Observe responses to setbacks without assuming they reveal a fixed character trait.",
      "Semi-final stage. Players who've been reliable across the group games now face the sharpest opponents of the tournament. Everything they have is needed now.",
      "Festival final. The largest crowd of the day is gathered. Scouts have reorganised their position to get the best view. What follows will be remembered.",
      "Final day of the competition. Reaching this stage supplies context; it does not settle an individual player assessment.",
    ],
  },

  attendMatch: {
    early: [
      "Kick-off. The stadium hum lifts instantly and the first phase sets the contest's terms — physicality, tempo, and the first signals about which players will dominate.",
      "Opening minutes of a professional fixture. Both sides are measured, feeling out the opponent. The crowd is alert. The game hasn't found its speed yet.",
      "Early exchanges in a professional fixture. Use the opening passages to establish a reference point for this opposition.",
      "The first phase of what looks like a hard-fought professional match. Intensity is high from the opening whistle. Early pressure is being applied immediately.",
    ],
    mid: [
      "The match has found its shape. Repeated passages may help test the tactical picture you are building.",
      "Midway point. Follow a player through the next passage and compare the action with what you have already seen.",
      "An open period offers different transitions to follow. Decide which movement deserves your attention.",
      "The match continues. Check one tactical action closely instead of assuming the phase is easy to read.",
      "Opening phase of the second half. The substitute has changed the tactical flow. New match dynamics are settling in.",
    ],
    late: [
      "Final minutes. Another passage remains to check effort, decision-making, or recovery against the earlier evidence.",
      "Closing stages of a professional fixture. Late efforts offer another observation, with workload and role still relevant.",
      "Late in the match. Defensive positioning and transition runs offer competing questions to follow.",
      "The clock runs down. Choose one final action to follow before deciding what still needs another look.",
    ],
  },

  reserveMatch: {
    early: [
      "The reserve fixture kicks off on a sparse ground. A few coaches and scouts ring the pitch. The players know what this game means to their careers.",
      "Opening minutes of a reserve match. The standard is uneven but the stakes for individuals are high — this group is competing for a handful of first-team openings.",
      "Early phase of a quiet reserve fixture. A smaller crowd offers a different setting, but attention still has to be directed.",
      "Reserve game starts. Developing youngsters and first-team fringe players share the pitch; their situations may differ.",
    ],
    mid: [
      "The reserve match has found a rhythm. Compare the next passage with an earlier observation before deciding what it means.",
      "The reserve fixture continues. A later passage may support or challenge the impression made earlier.",
      "Midway through the game. Keep the tactical task and opposition in mind as you follow individual actions.",
      "A quiet stretch in the reserve match. Follow a small decision and keep its context alongside the observation.",
    ],
    late: [
      "Final phase of the reserve game. The remaining exchanges offer one more chance to test an impression.",
      "Closing stages. Watch recovery and repeated effort while leaving training history and fitness causes open.",
      "Last few minutes of the reserve fixture. Keep earlier workload in mind when comparing late efforts.",
      "The reserve match winds down. The full-timers ring the pitch still. This was a long 90 minutes for the players who needed to impress — and they know it.",
    ],
  },

  trialMatch: {
    early: [
      "The trial match kicks off with a knowledgeable audience. Every player knows a professional career may hinge on the next 90 minutes. The opening exchanges reflect that weight.",
      "The trial fixture begins. Follow a player through the opening exchanges before drawing conclusions about the response to the occasion.",
      "The trial game begins with scouts positioned around the ground. Watch an opening touch without assuming how the occasion affects it.",
      "Opening exchanges of a trial match. The setting may affect how players respond; the actions still need to be observed.",
    ],
    mid: [
      "The trial continues. Revisit an early impression as the players become familiar with the session.",
      "Midway through the trial match. A fresh passage offers a chance to revisit an early impression.",
      "The trial moves on. Watch how players respond to the team shape and any instructions they receive.",
      "The trial continues. Keep the personal stakes in mind while separating what you saw from what you inferred.",
    ],
    late: [
      "Closing stages. Follow an effort or a response to a loose ball; compare it with earlier evidence before drawing a broader conclusion.",
      "Final phase of the trial. Keep an earlier impression open to challenge through the remaining exchanges.",
      "Late in the trial match. A closing effort adds evidence, but it cannot make the whole case on its own.",
      "Last minutes of the trial fixture. A late run adds another observation, with earlier workload still relevant.",
    ],
  },

  scoutingMission: {
    early: [
      "Opening phase of an unfamiliar fixture at the start of a wider scouting mission. The environment is new — the notes, the expectations, and the eye are all adjusting.",
      "The scouting mission begins. First game of a multi-fixture assignment. The opposition is unknown but that uncertainty is part of the observation value.",
      "Kick-off at an unfamiliar venue. Establish a reference point before deciding which details deserve further attention.",
      "Early stages of a scouting mission match. The pitch, the crowd, and the quality all need assessing before a frame of reference is established. That process starts now.",
    ],
    mid: [
      "The match is in full flow. Decide which target or action to follow through the next passage.",
      "The game continues at an unfamiliar pace. The next passage may add evidence or leave the question open.",
      "Mid-phase of the mission fixture. This match adds a reference point for the league; it cannot establish the whole standard by itself.",
      "The mission fixture continues. Follow an unresolved question that could help the wider report.",
    ],
    late: [
      "Late in the mission fixture. A further look may support or challenge what you saw earlier in the match.",
      "Closing phase of the mission fixture. Review the passages you could follow and identify what remains uncertain.",
      "Final stretch. The scouting mission reaches its most decisive phase. The impressions gathered here will frame the recommendation that goes back to the club.",
      "Last minutes of the mission fixture. Keep what you observed separate from what the report still needs to establish.",
    ],
  },

  trainingVisit: {
    early: [
      "Training begins with a warm-up and passing drills. The format offers another view of habits to compare with match evidence.",
      "The training visit opens with rondos and short passing sequences. The coaching staff is involved but not intrusive. The players are working and talking freely.",
      "Early phase of a training observation. Watch the warm-up as context without treating it as a complete picture of the player.",
      "The session starts with positional shape and activation drills. Follow a specific action to see what this setting can add.",
    ],
    mid: [
      "The session moves to tactical exercises. Position-specific work offers questions about movement when the ball is elsewhere.",
      "Applied tactical work continues. Pressing shapes and defensive compactness provide different tasks to follow.",
      "Technical work gives way to competitive scenarios. Compare an action across the two settings before assuming it will transfer.",
      "Game-like exercises are underway. Watch how a player approaches the next task without assuming the drill reflects match ability.",
      "Mid-session phase. Positional tasks on a tight pitch offer another chance to observe responses to instruction.",
    ],
    late: [
      "The session finishes with a small-sided game. Watch whether anything from the earlier drills appears in this different setting.",
      "Final phase of the training visit: a live practice game. Reactions and improvisation here may need another context before supporting a broader claim.",
      "Closing part of the session. A small-sided game provides a final opportunity to follow effort or movement.",
      "Training draws to a close. Retain the actions you could follow and note which questions still need match evidence.",
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
    "Kick-off. Use the opening exchanges to find a player or action worth following.",
    "The match starts briskly. Decide which physical action or decision to watch through the early exchanges.",
    "Opening exchanges. The tempo is high from the first whistle. Early ball movement patterns suggest which side has prepared for this specific opponent.",
    "Kick-off and the game is immediately competitive. Both managers have set up to be difficult rather than expressive — the opening phase is attritional.",
  ],
  15: [
    "Quarter of the game complete. Compare another passage with the picture you began building at kick-off.",
    "Fifteen minutes in. The first phase of sustained possession for either side has established which midfield is controlling the tempo.",
    "The match has passed its cautious opening. Players are now competing for the ball with conviction rather than consideration.",
    "After a tentative start, the game has found its pace. A cleaner phase now — the transitions are sharp and the individual battles are being decided.",
  ],
  30: [
    "The game approaches the half-hour. Watch how a player carries out a tactical task rather than assuming the plan is fully understood.",
    "Half-hour in. Another passage offers a chance to check whether an earlier pattern repeats.",
    "Thirty minutes. One side is beginning to control possession more consistently. The better-organised unit is starting to squeeze the space.",
    "The game approaches the final stretch of the first half. Keep individual observations in the context of the surrounding play.",
  ],
  45: [
    "Second half begins. Both managers have spoken — formations tightened or released based on what the first half showed. The new phase is starting with visible intent.",
    "The restart after half-time brings a change in tempo. Fresh legs are making more ground than tired ones did in the dying minutes of the first half.",
    "Second-half kick-off. Use the restart to test whether an earlier observation holds in the next passage.",
    "The match continues into its second half. One team's approach has adjusted sharply from the break — it will be interesting to see how long the new structure holds.",
  ],
  60: [
    "An hour of football. Decision-making and recovery offer different questions to follow at this stage.",
    "Sixty minutes in. Keep the match situation in mind when interpreting an attacking risk.",
    "The game continues into its later stages. Watch changes in execution without assuming fatigue explains every action.",
    "One hour gone. The substitutes are having their impact across the pitch. The tactical adjustments are reshaping the game into something different from its first-half form.",
  ],
  75: [
    "Final fifteen minutes. Follow a closing effort or decision before deciding what still needs another look.",
    "With time running out, the game is being decided by individual moments. The space that is appearing on both flanks is being exploited by whoever has the fastest reading.",
    "Late in the match. A further observation may strengthen an impression or leave another question unresolved.",
    "Closing stages. Compare the remaining passages with earlier evidence without assuming that a pattern is already established.",
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
  playerProfiles?: Readonly<Record<string, Player>>,
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
  const contextualPlayers = session.players.map((player) => ({
    ...player,
    naturalRole: player.naturalRole ?? playerProfiles?.[player.playerId]?.naturalRole,
  }));
  const performanceOffsets = sampleSessionPerformance(rng, contextualPlayers, playerProfiles);

  const populatedPhases: SessionPhase[] = session.phases.map((phase) => {
    // 1. Generate player moments for this phase.
    const moments = generateMoments(
      rng,
      contextualPlayers,
      venueType,
      phase.index,
      totalPhases,
      atmosphere,
      playerProfiles,
      session.situation,
      session.opponentContext,
      performanceOffsets,
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

  const situation = applyAtmosphereToObservationSituation(
    session.situation ?? createObservationSituation({
      activityType: session.activityType,
      seed: session.id,
      venueType,
      countryId: session.countryId,
      culturalInsights: session.culturalInsights,
      calendarEffects: session.culturalCalendarEffects,
      travelPosture: session.travelPosture,
    }),
    atmosphere,
    populatedPhases.flatMap((phase) => phase.atmosphereEvent ? [phase.atmosphereEvent] : []),
    session.culturalInsights,
    session.culturalCalendarEffects,
  );
  const targetPlayer = contextualPlayers[0];

  return {
    ...session,
    phases: populatedPhases,
    players: contextualPlayers,
    performanceOffsets,
    venueAtmosphere: atmosphere,
    situation,
    questionOptions: targetPlayer
      ? buildContextualScoutingQuestions({
          player: targetPlayer,
          activityType: session.activityType,
          situation,
          opponent: session.opponentContext,
          observer: session.observerContext,
        })
      : session.questionOptions,
  };
}
