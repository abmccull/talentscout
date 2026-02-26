/**
 * Commentary Engine
 *
 * Generates rich, context-aware match commentary using the template system
 * from commentaryTemplates.ts. Commentary is position-aware, form-aware,
 * and scouting-relevant.
 *
 * Tokens: {playerName}, {secondaryName}, {minute}, {clubName}
 *
 * Pure engine function — no React imports, no side effects.
 */

import type { Position, MatchEventType } from "@/engine/core/types";
import {
  type CommentaryTemplate,
  COMMENTARY_TEMPLATES,
  FORM_PREFIXES,
  SCOUTING_CONTEXT,
  HISTORICAL_REFERENCES,
} from "./commentaryTemplates";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Context passed into commentary generation for each event. */
export interface CommentaryContext {
  /** The type of match event. */
  eventType: MatchEventType;
  /** Match minute (1-90). */
  minute: number;
  /** Primary player's full name. */
  playerName: string;
  /** Primary player's position. */
  position: Position;
  /** Primary player's form [-3, 3]. */
  form: number;
  /** Whether the primary player is being scouted (focused on). */
  isScoutingTarget: boolean;
  /** Secondary player name (for passes, tackles, etc.). */
  secondaryName?: string;
  /** Club name for token replacement. */
  clubName?: string;
}

// ---------------------------------------------------------------------------
// Form classification
// ---------------------------------------------------------------------------

type FormBand = "high" | "neutral" | "low";

function getFormBand(form: number): FormBand {
  if (form >= 2) return "high";
  if (form <= -2) return "low";
  return "neutral";
}

// ---------------------------------------------------------------------------
// Template selection
// ---------------------------------------------------------------------------

/**
 * Picks a template from an array using minute as a deterministic seed.
 * Not cryptographically random — sufficient for display purposes.
 */
function pickIndex(length: number, minute: number, salt: number = 0): number {
  // Use a simple hash-like formula for variety
  return Math.abs((minute * 7 + salt * 13 + 3) % length);
}

/**
 * Selects the best commentary string from a template, considering:
 * 1. Scouting context (if player is being observed)
 * 2. Position-specific variant (if available for the player's position)
 * 3. Form-aware variant (if player is in high/low form)
 * 4. Generic fallback
 *
 * The priority order ensures scouting-relevant text appears ~40% of the time
 * for scouted players, position-specific ~60% of the time when available,
 * and form ~30% when applicable.
 */
function selectTemplateText(
  template: CommentaryTemplate,
  position: Position,
  formBand: FormBand,
  isScoutingTarget: boolean,
  minute: number,
): string {
  // Scouting context: ~40% chance if available and player is target
  if (isScoutingTarget && template.scoutingRelevant) {
    if ((minute * 11 + 5) % 5 < 2) {
      return template.scoutingRelevant;
    }
  }

  // Position-specific: use if available
  if (template.byPosition) {
    const positionText = template.byPosition[position];
    if (positionText) {
      // ~70% chance to use position-specific when available
      if ((minute * 3 + 7) % 10 < 7) {
        return positionText;
      }
    }
  }

  // Form-aware: use if applicable
  if (template.formAware && formBand !== "neutral") {
    const formText = formBand === "high"
      ? template.formAware.highForm
      : template.formAware.lowForm;
    // ~40% chance to use form variant when applicable
    if ((minute * 13 + 11) % 5 < 2) {
      return formText;
    }
  }

  return template.generic;
}

// ---------------------------------------------------------------------------
// Token replacement
// ---------------------------------------------------------------------------

function applyTokens(
  text: string,
  ctx: CommentaryContext,
): string {
  let result = text;
  result = result.replace(/\{playerName\}/g, ctx.playerName);
  result = result.replace(/\{minute\}/g, String(ctx.minute));
  if (ctx.secondaryName) {
    result = result.replace(/\{secondaryName\}/g, ctx.secondaryName);
  }
  if (ctx.clubName) {
    result = result.replace(/\{clubName\}/g, ctx.clubName);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Form prefix
// ---------------------------------------------------------------------------

/**
 * Returns a form-context prefix ~25% of the time when form is extreme.
 */
function getFormPrefix(formBand: FormBand, minute: number): string {
  if (formBand === "neutral") return "";
  // ~25% chance
  if ((minute * 7 + 3) % 4 !== 0) return "";

  const prefixes = formBand === "high" ? FORM_PREFIXES.high : FORM_PREFIXES.low;
  const idx = pickIndex(prefixes.length, minute, 17);
  return prefixes[idx] + " ";
}

// ---------------------------------------------------------------------------
// Scouting context suffix
// ---------------------------------------------------------------------------

/**
 * Returns a scouting context suffix ~20% of the time for scouted players.
 */
function getScoutingSuffix(isScoutingTarget: boolean, minute: number): string {
  if (!isScoutingTarget) return "";
  // ~20% chance
  if ((minute * 11 + 7) % 5 !== 0) return "";

  const idx = pickIndex(SCOUTING_CONTEXT.length, minute, 23);
  return " " + SCOUTING_CONTEXT[idx];
}

// ---------------------------------------------------------------------------
// Historical reference suffix
// ---------------------------------------------------------------------------

/**
 * Returns a historical reference ~12% of the time.
 */
function getHistoricalReference(minute: number): string {
  // ~12% chance
  if ((minute * 13 + 5) % 8 !== 0) return "";

  const idx = pickIndex(HISTORICAL_REFERENCES.length, minute, 31);
  return " " + HISTORICAL_REFERENCES[idx];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a commentary string for a match event with full context awareness.
 *
 * The generated commentary considers:
 * - Player position (striker goals differ from centre-back goals)
 * - Player form (hot streak vs poor run)
 * - Scouting focus (adds evaluation-relevant observations)
 * - Historical references (occasional callbacks to prior performances)
 *
 * @param ctx - Full context for the commentary event
 * @returns A rich commentary string
 */
export function generateCommentary(ctx: CommentaryContext): string {
  const templates = COMMENTARY_TEMPLATES[ctx.eventType];

  // Fallback for unknown event types
  if (!templates || templates.length === 0) {
    return `${ctx.minute}' — ${ctx.playerName} is involved in the play.`;
  }

  // Pick a template from the bank
  const templateIdx = pickIndex(templates.length, ctx.minute, ctx.eventType.length);
  const template = templates[templateIdx];

  const formBand = getFormBand(ctx.form);

  // Select the best text variant from the template
  const rawText = selectTemplateText(
    template,
    ctx.position,
    formBand,
    ctx.isScoutingTarget,
    ctx.minute,
  );

  // Apply token replacements
  let commentary = applyTokens(rawText, ctx);

  // Prepend form prefix (occasional)
  const formPrefix = getFormPrefix(formBand, ctx.minute);
  if (formPrefix) {
    // Lowercase the first character of commentary after the minute marker
    // We prepend the form prefix after the minute+dash pattern
    const minutePattern = `${ctx.minute}' — `;
    if (commentary.startsWith(minutePattern)) {
      const afterMinute = commentary.slice(minutePattern.length);
      const lowerFirst = afterMinute.charAt(0).toLowerCase() + afterMinute.slice(1);
      commentary = `${minutePattern}${formPrefix}${lowerFirst}`;
    }
  }

  // Append scouting suffix (occasional)
  commentary += getScoutingSuffix(ctx.isScoutingTarget, ctx.minute);

  // Append historical reference (occasional)
  commentary += getHistoricalReference(ctx.minute);

  return commentary;
}

// ---------------------------------------------------------------------------
// Quality-band commentary (used by Commentary.tsx UI component)
// ---------------------------------------------------------------------------

type QualityBand = "low" | "mid" | "high";

const QUALITY_TEMPLATES: Record<string, Record<QualityBand, string[]>> = {
  goal: {
    low: [
      "{minute}' — A scrappy finish from {playerName}. It won't make the highlight reel, but it counts all the same.",
      "{minute}' — {playerName} bundles the ball over the line. More determination than quality, but the net ripples.",
      "{minute}' — It's in! {playerName} manages to find the net despite some sloppy technique. The goalkeeper will be disappointed.",
      "{minute}' — A fortunate deflection falls to {playerName} and they do just enough to prod it home.",
    ],
    mid: [
      "{minute}' — {playerName} finishes well from close range. Composed and clinical when it mattered most.",
      "{minute}' — A well-taken goal by {playerName}. Good movement to create the space, neat finish to punish it.",
      "{minute}' — GOAL! {playerName} picks their spot and the keeper has no chance. Quality strike from {clubName}.",
      "{minute}' — {playerName} controls, sets themselves and drives low into the bottom corner. A solid finish.",
      "{minute}' — Excellent movement from {playerName} creates a yard of space, and they don't need any more than that.",
    ],
    high: [
      "{minute}' — MAGNIFICENT! {playerName} unleashes an absolute thunderbolt! The crowd erupts — that is world-class finishing.",
      "{minute}' — Pure genius from {playerName}! A moment of brilliance that will be replayed for years. What a goal for {clubName}!",
      "{minute}' — INCREDIBLE! {playerName} makes it look effortless — the technique, the composure, the execution. Scouts dream of finding talent like this.",
      "{minute}' — {playerName} with a finish of extraordinary quality! The improvisation, the instant control under pressure — you cannot coach that.",
      "{minute}' — Simply stunning from {playerName}! Off the underside of the bar and in. That is a goal any player in the world would be proud of.",
    ],
  },
  assist: {
    low: [
      "{minute}' — A lucky ricochet puts {playerName} in position to play the pass. The scorer will take the credit.",
      "{minute}' — {playerName} rolls the ball square — the simplest of assists, though the pass was there to be made.",
      "{minute}' — {playerName} lays it off after a mix-up in the defensive line. Right place, right time.",
    ],
    mid: [
      "{minute}' — Brilliant ball from {playerName} sets up the chance. The vision to see the run was impressive.",
      "{minute}' — {playerName} threads the perfect pass to create the opening. A composed delivery under pressure.",
      "{minute}' — Smart combination play from {playerName}, who reads the movement and delivers exactly what was needed.",
      "{minute}' — {playerName} spots the overlap early and the weighted pass splits the defence perfectly.",
    ],
    high: [
      "{minute}' — What a ball from {playerName}! The weight, the angle, the timing — a pass of the highest order that leaves the scorer with a simple finish.",
      "{minute}' — EXCEPTIONAL vision from {playerName}! Nobody else on the pitch saw that run, but {playerName} found it with a pass of ridiculous precision.",
      "{minute}' — {playerName} with an assist that shows exactly why top clubs track this player. The technique, the awareness, the execution — flawless.",
      "{minute}' — That is the pass of the season. {playerName} threads it through five bodies into the only square metre of grass the striker needed. Unbelievable.",
    ],
  },
  shot: {
    low: [
      "{minute}' — {playerName} gets a sight of goal but fires straight at the keeper. Too central, too easy.",
      "{minute}' — A tame effort from {playerName} — the keeper gathers without drama.",
      "{minute}' — {playerName} shoots from distance but it never really threatens. Hopeful rather than purposeful.",
      "{minute}' — Wild effort from {playerName}, sliced well wide from a promising position.",
    ],
    mid: [
      "{minute}' — Powerful effort from {playerName} forces a fine save at full stretch from the goalkeeper.",
      "{minute}' — {playerName} cuts inside and bends one just wide of the far post. Unlucky — that was a quality attempt.",
      "{minute}' — Long-range effort from {playerName} — clips the crossbar and goes over. So close!",
      "{minute}' — {playerName} shapes to shoot and lets fly. The keeper can only parry — good technique to get that away quickly.",
      "{minute}' — {playerName} gets the shot away under pressure. No easy task, and the keeper does well to keep it out.",
    ],
    high: [
      "{minute}' — WHAT A STRIKE from {playerName}! Dipping, swerving from 30 yards — the keeper is helpless, it crashes back off the post!",
      "{minute}' — {playerName} unleashes a ferocious volley — the technique is breathtaking. The keeper tips it over brilliantly but that could easily have been the goal of the season.",
      "{minute}' — Incredible strike from {playerName}! The balance, the contact, the direction — every element of that technique is elite-level.",
      "{minute}' — {playerName} conjures a shot from an impossible angle that somehow ends up kissing the far post. That instinct to create something from nothing is rare.",
    ],
  },
  pass: {
    low: [
      "{minute}' — Safe sideways ball from {playerName}. Keeping it simple, nothing more.",
      "{minute}' — {playerName} recycles possession without making anything happen. A routine pass.",
      "{minute}' — Square ball from {playerName} under no pressure. The crowd expected more.",
    ],
    mid: [
      "{minute}' — {playerName} picks up the ball in midfield and threads a diagonal to the wing. Good awareness of the space.",
      "{minute}' — Delicate flick from {playerName} releases the runner in behind the defensive line.",
      "{minute}' — {playerName} switches play with a sweeping 50-yard ball. Good technique to change the angle of attack.",
      "{minute}' — Quick one-two from {playerName} cuts through the press. Smart and decisive.",
      "{minute}' — Incisive through-ball from {playerName} splits the two centre-backs. Good weight on it.",
    ],
    high: [
      "{minute}' — SENSATIONAL pass from {playerName}! A no-look ball through the eye of a needle that cuts through the entire midfield. You simply cannot teach that.",
      "{minute}' — {playerName} with a 60-yard switch of play hit on the half-volley with the outside of the foot. That kind of range and technique is elite — someone is watching this.",
      "{minute}' — The vision! {playerName} plays it first time to a run that hadn't even started yet. A pass ahead of the game by three or four seconds.",
      "{minute}' — Extraordinary footwork from {playerName} to manufacture space before threading the needle. The precision at that speed is exceptional.",
    ],
  },
  dribble: {
    low: [
      "{minute}' — {playerName} tries to take on the full-back but is closed down too quickly. Possession lost.",
      "{minute}' — Slow, hesitant dribble from {playerName} — the defender reads it easily.",
      "{minute}' — {playerName} attempts to go past the challenge but it's telegraphed, easily read.",
    ],
    mid: [
      "{minute}' — {playerName} takes on the full-back and goes past with a sharp change of direction. Good direct play.",
      "{minute}' — Brilliant footwork from {playerName}, feinting inside before jinking outside to create the crossing opportunity.",
      "{minute}' — {playerName} dribbles into the box, rides two challenges, but eventually runs into a dead end.",
      "{minute}' — Strong direct run from {playerName}, showing great balance and upper-body strength to advance into space.",
    ],
    high: [
      "{minute}' — {playerName} with a dribble of absolute magic — past one, two, three defenders before the foul brings them down. The crowd is on its feet.",
      "{minute}' — Extraordinary skill from {playerName}! The elastico at speed, the shimmy, the burst of acceleration — that sequence had four defenders grasping at shadows.",
      "{minute}' — {playerName} glides past the challenge as if on rails. The low centre of gravity, the explosive change of pace — you are watching something very special here.",
      "{minute}' — The feet! {playerName} produces a piece of individual skill that defies belief — both feet, both directions, then gone. A packed bench goes wild.",
    ],
  },
  tackle: {
    low: [
      "{minute}' — Clumsy challenge from {playerName} — the referee waves play on but it was borderline.",
      "{minute}' — {playerName} slides in but mistimes it. The ball runs loose.",
      "{minute}' — Desperate lunge from {playerName} doesn't quite make contact. Lucky to get away with it.",
    ],
    mid: [
      "{minute}' — {playerName} times the sliding challenge perfectly to dispossess the attacker. Textbook defending.",
      "{minute}' — Muscular challenge from {playerName}, who wins the ball fairly and immediately drives forward.",
      "{minute}' — {playerName} reads the danger and steps in with a decisive interception. Good defensive instincts.",
      "{minute}' — Crunching but fair tackle from {playerName} — a statement of intent that the crowd appreciates.",
    ],
    high: [
      "{minute}' — MAGNIFICENT tackle from {playerName}! Perfectly timed, perfectly executed — the attacker didn't even see it coming. That is elite-level reading of the game.",
      "{minute}' — What defending! {playerName} covers 15 yards, times the challenge to the millisecond and wins the ball cleanly. The whole back line holds its shape. Exceptional.",
      "{minute}' — {playerName} reads the pass before it is even played, intercepts at pace, and drives forward in one fluid movement. That positional intelligence is what top clubs covet.",
      "{minute}' — Brilliant anticipation from {playerName} — a block tackle that looked impossible becomes routine. The composure to hold the challenge until the right moment is rare.",
    ],
  },
  header: {
    low: [
      "{minute}' — {playerName} rises for the corner but heads straight at the keeper. Not enough power.",
      "{minute}' — Mistimed jump from {playerName} — the ball drops harmlessly to the side.",
      "{minute}' — {playerName} gets a head on it but can't direct it anywhere useful.",
    ],
    mid: [
      "{minute}' — Towering header from {playerName} at the near post — straight at the keeper, but the movement was excellent.",
      "{minute}' — {playerName} wins the aerial duel convincingly, powering the ball clear under pressure.",
      "{minute}' — Good attacking run from {playerName} to meet the cross, though the placement lets the effort down.",
      "{minute}' — {playerName} gets up well above the defender to redirect the cross — the keeper does well to keep it out.",
    ],
    high: [
      "{minute}' — {playerName} leaves the ground a full half-second before the nearest defender and attacks the ball at the apex of the jump. A header of absolute authority. The scouts' notebooks are busy.",
      "{minute}' — Phenomenal aerial ability from {playerName}! The timing of the run, the power through the ball, the placement — all elite. GK had no chance.",
      "{minute}' — {playerName} bullies two defenders, rises above both and plants the header into the corner. Dominant, powerful, precise — the complete aerial performance.",
      "{minute}' — The leap! {playerName} seems to hang in the air for an impossible moment before directing the header with extraordinary control. Physical gifts and technique combined at the highest level.",
    ],
  },
  save: {
    low: [
      "{minute}' — Routine stop from {playerName} — a comfortable gather from a speculative effort.",
      "{minute}' — {playerName} positions themselves well and the save is straightforward. Good angles.",
      "{minute}' — Comfortable save from {playerName} — right at them, no difficulty.",
    ],
    mid: [
      "{minute}' — Brilliant reflexes from {playerName} to deny the shot at close range. Instinctive.",
      "{minute}' — {playerName} gets down well to palm the low drive around the post. Good technique.",
      "{minute}' — {playerName} reads the flight early and plucks the cross out of the air with authority.",
      "{minute}' — Good footwork from {playerName} to narrow the angle quickly — the attacker had no choice but to shoot straight at them.",
    ],
    high: [
      "{minute}' — INCREDIBLE save from {playerName}! A full-stretch dive at pace to tip the shot around the post. That came off the foot at 70mph and the reaction time was superhuman.",
      "{minute}' — Penalty stopped! {playerName} goes the right way and gets two hands behind it — the composure, the technique, the sheer nerve. That is elite goalkeeping.",
      "{minute}' — {playerName} produces a save that defies the laws of physics — diving the wrong way, adjusting mid-air and somehow getting fingertips to it. A defining moment.",
      "{minute}' — Three saves in the space of ten seconds — {playerName} is having a match that belongs in coaching manuals. The agility, the command of the area — exceptional.",
    ],
  },
  foul: {
    low: [
      "{minute}' — {playerName} goes in too hard and the referee blows for a foul. A moment of poor discipline.",
      "{minute}' — Cynical foul from {playerName} to stop the counter-attack. Lucky it's only a yellow.",
      "{minute}' — {playerName} mistimes the challenge badly — the referee has no hesitation.",
    ],
    mid: [
      "{minute}' — Tactical foul from {playerName} — reads that the counter is on and makes the professional decision to break it up. Calculated.",
      "{minute}' — {playerName} catches the attacker on the follow-through. No malice, but careless under pressure.",
      "{minute}' — Smart professional foul from {playerName} to protect the defensive shape. The referee books them, but the team benefits.",
    ],
    high: [
      "{minute}' — {playerName} pulls out of the challenge at the last instant to protect the team from a dismissal — the self-discipline to hold back when the tackle was on is a mark of real intelligence.",
      "{minute}' — Interesting decision from {playerName}: concedes a foul to break up a dangerous move, then immediately organises the defensive wall. Leadership in the small margins of the game.",
    ],
  },
  cross: {
    low: [
      "{minute}' — {playerName} delivers a cross from the flank but it drifts harmlessly over everyone.",
      "{minute}' — Overhit cross from {playerName} — sails straight out for a goal kick.",
      "{minute}' — {playerName} tries to whip one in but the contact is poor. No real danger.",
    ],
    mid: [
      "{minute}' — {playerName} delivers a whipped cross from the flank — no one gets on the end of it, but the delivery was dangerous.",
      "{minute}' — {playerName} cuts inside and floats a precise cross to the back post. Well-weighted.",
      "{minute}' — {playerName} picks out the far post with a driven delivery — the striker just can't convert. Excellent ball.",
      "{minute}' — Good work from {playerName} to win space before curling in an inviting cross. The forwards need to do better.",
    ],
    high: [
      "{minute}' — {playerName} hits an in-swinging cross at the perfect pace, at the perfect height, into the perfect corridor. Every centre-forward in the world would score from that delivery.",
      "{minute}' — The crossing technique from {playerName} is extraordinary — right foot, outside of the boot, bending away from the goalkeeper at pace. A ball that demands to be finished.",
      "{minute}' — {playerName} delivers from the byline with the outside of the right foot — generating curl, pace and dip simultaneously. That crossing ability is worth millions.",
    ],
  },
  sprint: {
    low: [
      "{minute}' — {playerName} makes a run but is caught quickly. Effective pace, limited stamina.",
      "{minute}' — {playerName} chases the long ball but can't get there in time. Running out of legs.",
      "{minute}' — Slow recovery run from {playerName} — the defence almost exposes a gap because of it.",
    ],
    mid: [
      "{minute}' — {playerName} bursts past two defenders with raw pace before being fouled. Genuine threat on the run.",
      "{minute}' — Relentless pressing from {playerName}, who covers more ground than anyone on the pitch this half.",
      "{minute}' — {playerName} makes a lung-bursting 60-yard recovery run to make the challenge. Outstanding work rate.",
      "{minute}' — {playerName} accelerates away from the last defender with frightening pace. Physical gifts on full display.",
    ],
    high: [
      "{minute}' — The PACE! {playerName} reaches top speed in three strides and is gone — no defender in this league is catching that. GPS data is going to show something extraordinary.",
      "{minute}' — {playerName} covers 50 yards in what seems like four seconds in full sprint to win the ball. This level of physical conditioning is elite. Someone is going to invest heavily in this player.",
      "{minute}' — {playerName} leaves three defenders behind, not with tricks — just with pure, devastating acceleration. In today's game, that kind of speed is priceless.",
      "{minute}' — Extraordinary engine from {playerName}: full sprint to press, win the ball, full sprint to support. 95 minutes of that requires elite-level conditioning. Take note.",
    ],
  },
  positioning: {
    low: [
      "{minute}' — {playerName} drifts out of position — a gap forms that the opposition nearly exploits.",
      "{minute}' — Lazy shape from {playerName}. Not tracking the run properly.",
      "{minute}' — {playerName} doesn't make the movement — the passing option is lost.",
    ],
    mid: [
      "{minute}' — {playerName} drifts into space between the lines, always an available option for the ball-carrier.",
      "{minute}' — Intelligent movement from {playerName}, who drops deep to create an overload in midfield.",
      "{minute}' — Smart positioning from {playerName} cuts off the passing lane before the ball even arrives. Anticipation.",
      "{minute}' — {playerName} finds the pocket of space behind the midfield and holds it until the moment arrives.",
    ],
    high: [
      "{minute}' — {playerName} is a ghost — drifting in and out of zones, always a step ahead of the defensive shape. A positioning masterclass that creates space for three teammates.",
      "{minute}' — Watch {playerName} off the ball. Every movement is deliberate, every position chosen to create a problem for the defence. That tactical IQ is at the very top of the game.",
      "{minute}' — {playerName} occupies the exact half-space that the opposition's defensive structure cannot cover. Who coached this player to understand space at this level?",
      "{minute}' — {playerName} covers three different defensive zones in ten seconds — anticipating the transition, blocking the passing lane, then pinning the last man. Exceptional reading of the game.",
    ],
  },
  error: {
    low: [
      "{minute}' — Uncharacteristic mistake from {playerName}, misplacing a simple pass.",
      "{minute}' — {playerName} dallies on the ball under pressure and is dispossessed. A bad moment.",
      "{minute}' — Heavy first touch from {playerName} lets the defender nip in. Poor control.",
      "{minute}' — {playerName} switches off for a moment — fortunate the side doesn't pay a heavier price.",
    ],
    mid: [
      "{minute}' — Under pressure, {playerName} makes a misjudgement on the pass. It happens — but in this context it's a learning moment.",
      "{minute}' — {playerName} overcomplicates a simple situation and loses possession. Concentration lapses under the intensity of this press.",
      "{minute}' — A positional error from {playerName} leaves a gap — quickly covered by the team, but the composure wobbled.",
    ],
    high: [
      "{minute}' — Even the best make mistakes: {playerName} immediately presses to win the ball back, showing the mentality of an elite player. The error matters; the response matters more.",
      "{minute}' — A rare mistake from {playerName}. What is instructive is the body language — head stays up, already communicating with teammates. This is a player who manages pressure well.",
    ],
  },
  leadership: {
    low: [
      "{minute}' — {playerName} calls out to a teammate. The noise of the crowd swallows most of it.",
      "{minute}' — A gesture from {playerName} to reorganise the defensive line. Routine.",
      "{minute}' — {playerName} attempts to rally the team during the break in play.",
    ],
    mid: [
      "{minute}' — {playerName} organises the defensive shape with loud, clear instructions. Taking responsibility.",
      "{minute}' — After a difficult spell, {playerName} rallies teammates with visible encouragement. Good character.",
      "{minute}' — {playerName} calls for the ball and takes responsibility when others are hiding. A captain's instinct.",
      "{minute}' — {playerName} gathers the group after a goal, steady voice, pointing out positions. A calming influence.",
    ],
    high: [
      "{minute}' — {playerName} takes the ball, slows the game right down and speaks individually to three teammates in the space of thirty seconds. That is game management from someone beyond their years.",
      "{minute}' — INSPIRATIONAL from {playerName}! The captain's armband is incidental — this is natural leadership. A dressing room speech made public. The team is visibly lifted.",
      "{minute}' — Watch the effect {playerName} has on the players around them: the energy changes, the shape tightens, the confidence returns. That intangible quality is what wins trophies.",
      "{minute}' — {playerName} takes full accountability after a defensive error — pointing at themselves, not a teammate. That psychological intelligence and self-awareness marks out the truly elite.",
    ],
  },
};

/**
 * Determines the quality band for a given quality score (1-10).
 */
function getQualityBand(quality: number): QualityBand {
  if (quality >= 8) return "high";
  if (quality >= 4) return "mid";
  return "low";
}

/**
 * Replaces {playerName}, {clubName}, {minute} tokens in a template string.
 */
function applyQualityTokens(
  template: string,
  playerName: string,
  clubName: string,
  minute: number,
): string {
  return template
    .replace(/\{playerName\}/g, playerName)
    .replace(/\{clubName\}/g, clubName)
    .replace(/\{minute\}/g, String(minute));
}

/**
 * Picks a deterministic-looking template from an array using minute as seed.
 */
function pickQualityTemplate(templates: string[], minute: number): string {
  const index = minute % templates.length;
  return templates[index];
}

/**
 * Returns a quality-band-aware commentary string for the given event.
 * Used by the Commentary.tsx UI component.
 *
 * @param eventType   - MatchEventType string
 * @param quality     - Event quality 1-10
 * @param playerName  - Full name of the primary player
 * @param clubName    - Name of the player's club
 * @param minute      - Match minute (used for template selection)
 */
export function getCommentary(
  eventType: string,
  quality: number,
  playerName: string,
  clubName: string,
  minute: number,
): string {
  const typeTemplates = QUALITY_TEMPLATES[eventType];
  if (!typeTemplates) {
    return `${minute}' — ${playerName} is involved in the play.`;
  }

  const band = getQualityBand(quality);
  const templates = typeTemplates[band];

  const resolvedTemplates =
    templates ??
    typeTemplates.mid ??
    typeTemplates.low;

  if (!resolvedTemplates || resolvedTemplates.length === 0) {
    return `${minute}' — ${playerName} is involved in the play.`;
  }

  const template = pickQualityTemplate(resolvedTemplates, minute);
  return applyQualityTokens(template, playerName, clubName, minute);
}

// ---------------------------------------------------------------------------
// Score-state commentary prefixes
// ---------------------------------------------------------------------------

export interface ScoreContext {
  homeGoals: number;
  awayGoals: number;
  minute: number;
  /** Is the acting player on the home team? */
  isHome: boolean;
}

const SCORE_STATE_PREFIXES: Record<string, string[]> = {
  leading: [
    "With the hosts firmly in control...",
    "Leading comfortably now...",
    "Pressing for another, and...",
    "Protecting their advantage...",
  ],
  trailing: [
    "Desperate for an equalizer...",
    "Trailing and running out of time...",
    "Chasing the game now...",
    "With the deficit growing...",
  ],
  drawn: [
    "Level and tense...",
    "Neither side able to break the deadlock...",
    "With the scores level...",
    "All square and neither side willing to blink...",
  ],
  closeGame: [
    "A single goal separating the sides...",
    "The tension is palpable...",
    "Razor-thin margins now...",
    "With so little between the two sides...",
  ],
  blowout: [
    "The contest all but over...",
    "This has become a rout...",
    "With the result beyond doubt...",
    "A damage-limitation exercise now...",
  ],
  lateEqualizer: [
    "The equalizer still fresh in the memory...",
    "Momentum has completely shifted...",
    "The stadium is alive after that goal...",
    "Galvanized by the equaliser...",
  ],
};

function getScoreState(ctx: ScoreContext): string | null {
  const { homeGoals, awayGoals, minute, isHome } = ctx;
  const diff = homeGoals - awayGoals;
  const playerLeading = isHome ? diff > 0 : diff < 0;
  const playerTrailing = isHome ? diff < 0 : diff > 0;
  const absDiff = Math.abs(diff);

  if (absDiff >= 3) return "blowout";
  if (absDiff === 1) return "closeGame";
  if (diff === 0 && minute > 75) return "drawn";
  if (diff === 0) return "drawn";
  if (playerLeading) return "leading";
  if (playerTrailing) return "trailing";
  return null;
}

/**
 * Returns a score-state prefix ~40% of the time, or empty string.
 */
export function getScoreStatePrefix(ctx: ScoreContext, minute: number): string {
  const state = getScoreState(ctx);
  if (!state) return "";
  const prefixes = SCORE_STATE_PREFIXES[state];
  if (!prefixes || prefixes.length === 0) return "";
  // Only prepend ~40% of the time
  if ((minute * 7 + ctx.homeGoals * 13) % 10 >= 4) return "";
  return prefixes[minute % prefixes.length] + " ";
}

// ---------------------------------------------------------------------------
// Weather commentary interjections
// ---------------------------------------------------------------------------

const WEATHER_INTERJECTIONS: Record<string, string[]> = {
  rain: [
    "The ball skids off the wet surface...",
    "Tricky conditions with the drizzle making the pitch slick.",
    "The rain is making handling difficult.",
    "Wet underfoot, and it shows in the touch.",
    "The ball zips across the damp turf.",
  ],
  heavyRain: [
    "Conditions are becoming almost unplayable in this downpour.",
    "The heavy rain is turning the pitch into a quagmire.",
    "Players are struggling to keep their footing in this deluge.",
    "Visibility is poor \u2014 even the linesman is squinting through the rain.",
    "The ball holds up in the standing water near the touchline.",
  ],
  snow: [
    "The snow is making footing treacherous.",
    "An orange ball today \u2014 the white one disappeared ten minutes ago.",
    "The groundsman will have his work cut out after this.",
    "Players leaving deep prints in the snow as they chase every ball.",
    "Freezing conditions \u2014 you can see the breath of every player on the pitch.",
  ],
  windy: [
    "Gusty conditions make that cross almost impossible to judge.",
    "The wind is playing havoc with long passes.",
    "A swirling wind wreaks havoc with the flight of the ball.",
    "The conditions are favouring neither side \u2014 the wind is brutal today.",
    "That was heading for the top corner until the wind took it.",
  ],
};

/**
 * Returns a weather interjection string ~25% of the time in adverse weather.
 */
export function getWeatherInterjection(weather: string, minute: number): string {
  const templates = WEATHER_INTERJECTIONS[weather];
  if (!templates || templates.length === 0) return "";
  // Only interject ~25% of the time
  if ((minute * 11 + 3) % 4 !== 0) return "";
  return " " + templates[minute % templates.length];
}

// ---------------------------------------------------------------------------
// Contextual commentary chains (same player in consecutive events)
// ---------------------------------------------------------------------------

const CHAIN_TEMPLATES: string[] = [
  "It's all {playerName} right now.",
  "{playerName} again \u2014 their second involvement in as many minutes.",
  "The same man, demanding the ball once more.",
  "{playerName} is everywhere on this pitch.",
  "Back-to-back involvements for {playerName}.",
  "There's no escaping {playerName} today.",
  "{playerName} refuses to let anyone else take control of this match.",
  "Once again it's {playerName} at the centre of the action.",
  "{playerName} \u2014 involved in everything of note right now.",
  "Another touch, another moment of quality from {playerName}.",
  "They can't get the ball off {playerName} at the moment.",
  "{playerName} making their presence felt once more.",
];

/**
 * Returns a chain commentary string if the player appeared in recent events.
 */
export function getChainCommentary(
  currentPlayerId: string,
  recentPlayerIds: string[],
  playerName: string,
  minute: number,
): string {
  const consecutiveCount = recentPlayerIds.filter(id => id === currentPlayerId).length;
  if (consecutiveCount < 1) return "";
  const template = CHAIN_TEMPLATES[minute % CHAIN_TEMPLATES.length];
  return " " + template.replace(/\{playerName\}/g, playerName);
}

// ---------------------------------------------------------------------------
// Momentum commentary
// ---------------------------------------------------------------------------

export const MOMENTUM_COMMENTARY = {
  high: [
    "Complete dominance from one side.",
    "The crowd senses blood \u2014 waves of pressure now.",
    "It's been one-way traffic for the last ten minutes.",
    "The momentum is irresistible right now.",
    "All the energy, all the intent \u2014 flowing in one direction.",
  ],
  low: [
    "A scrappy spell with neither side able to build any rhythm.",
    "The game has lost its shape completely.",
    "Neither side able to gain a foothold in this passage.",
    "Disjointed play \u2014 the quality has dropped off a cliff.",
    "Ugly, stop-start football with no flow whatsoever.",
  ],
  shift: [
    "The momentum has shifted dramatically.",
    "A complete swing in the flow of the match.",
    "Something has changed \u2014 the energy is different now.",
    "A turning point, perhaps.",
    "The tide is turning before our eyes.",
  ],
} as const;

export function getMomentumCommentary(momentum: number, prevMomentum: number, minute: number): string {
  // Detect big momentum shift
  if (Math.abs(momentum - prevMomentum) > 30) {
    const templates = MOMENTUM_COMMENTARY.shift;
    return templates[minute % templates.length] + " ";
  }
  if (momentum > 70) {
    const templates = MOMENTUM_COMMENTARY.high;
    // Only ~30% of the time
    if ((minute * 3 + 7) % 10 < 3) return templates[minute % templates.length] + " ";
  }
  if (momentum < 30) {
    const templates = MOMENTUM_COMMENTARY.low;
    if ((minute * 3 + 7) % 10 < 3) return templates[minute % templates.length] + " ";
  }
  return "";
}

// Re-export template types for consumers
export type { CommentaryTemplate } from "./commentaryTemplates";
export { COMMENTARY_TEMPLATES } from "./commentaryTemplates";
