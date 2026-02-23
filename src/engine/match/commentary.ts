/**
 * Commentary Engine
 *
 * Generates rich, quality-aware match commentary for each event type.
 * Templates are keyed by event type then quality band:
 *   - low  (quality 1–3): Generic, no scouting insight
 *   - mid  (quality 4–7): Shows character, moderate scouting value
 *   - high (quality 8–10): Clear scouting moment — scout sits up and notices
 *
 * 3–5 templates per band, 14 event types.
 * Tokens: {playerName}, {clubName}, {minute}
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QualityBand = "low" | "mid" | "high";

interface CommentaryTemplate {
  template: string;
}

// ---------------------------------------------------------------------------
// Template bank
// ---------------------------------------------------------------------------

const COMMENTARY_TEMPLATES: Record<string, Record<QualityBand, string[]>> = {
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Determines the quality band for a given quality score (1–10).
 */
function getQualityBand(quality: number): QualityBand {
  if (quality >= 8) return "high";
  if (quality >= 4) return "mid";
  return "low";
}

/**
 * Replaces {playerName}, {clubName}, {minute} tokens in a template string.
 */
function applyTokens(
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
 * Not cryptographically random — sufficient for display purposes.
 */
function pickTemplate(templates: string[], minute: number): string {
  const index = minute % templates.length;
  return templates[index];
}

/**
 * Returns a commentary string for the given event.
 *
 * @param eventType   - MatchEventType string
 * @param quality     - Event quality 1–10
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
  const typeTemplates = COMMENTARY_TEMPLATES[eventType];
  if (!typeTemplates) {
    // Unknown event type — return a minimal fallback
    return `${minute}' — ${playerName} is involved in the play.`;
  }

  const band = getQualityBand(quality);
  const templates = typeTemplates[band];

  // Fallback chain: if somehow a band is missing, try mid → low
  const resolvedTemplates =
    templates ??
    typeTemplates.mid ??
    typeTemplates.low;

  if (!resolvedTemplates || resolvedTemplates.length === 0) {
    return `${minute}' — ${playerName} is involved in the play.`;
  }

  const template = pickTemplate(resolvedTemplates, minute);
  return applyTokens(template, playerName, clubName, minute);
}

// Export template data for testing
export { COMMENTARY_TEMPLATES };
export type { QualityBand, CommentaryTemplate };
