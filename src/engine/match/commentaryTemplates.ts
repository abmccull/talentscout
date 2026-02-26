/**
 * Commentary Templates — Position-aware, form-aware, and scouting-relevant
 *
 * Each event type has a bank of CommentaryTemplate objects. A template contains:
 *   - generic: a default string for any position
 *   - byPosition: optional overrides for specific positions
 *   - formAware: optional variants when a player is in high/low form
 *   - scoutingRelevant: optional variant shown when the player is being scouted
 *
 * Tokens: {playerName}, {secondaryName}, {minute}, {clubName}
 *
 * Pure data module — no side effects, no React imports.
 */

import type { Position, MatchEventType } from "@/engine/core/types";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CommentaryTemplate {
  generic: string;
  byPosition?: Partial<Record<Position, string>>;
  formAware?: { highForm: string; lowForm: string };
  scoutingRelevant?: string;
}

// ---------------------------------------------------------------------------
// Historical reference fragments (appended ~15% of the time)
// ---------------------------------------------------------------------------

export const HISTORICAL_REFERENCES: string[] = [
  "Reminiscent of their display last month.",
  "A repeat of what we saw earlier this season.",
  "Shades of their performance against the league leaders.",
  "Not unlike what the scouts noted in the derby.",
  "Echoes of that memorable cup tie performance.",
  "Just like their showing in the midweek fixture.",
  "That same quality was on display in pre-season, too.",
  "A theme that's been developing over recent weeks.",
  "Consistent with what we've observed in the last three matches.",
  "A pattern any good scout would have spotted by now.",
];

// ---------------------------------------------------------------------------
// Form modifier fragments (prepended to commentary)
// ---------------------------------------------------------------------------

export const FORM_PREFIXES = {
  high: [
    "Continuing their excellent run of form,",
    "In scintillating form right now,",
    "Riding a wave of confidence,",
    "On a hot streak and it shows —",
    "Playing with the swagger of someone who can do no wrong,",
  ],
  low: [
    "Another difficult moment in a poor run,",
    "Struggling for form recently,",
    "Confidence looks fragile right now —",
    "It's been a tough spell and it shows,",
    "Not at their best for several weeks now,",
  ],
};

// ---------------------------------------------------------------------------
// Scouting context fragments (appended when player is focused)
// ---------------------------------------------------------------------------

export const SCOUTING_CONTEXT: string[] = [
  "Exactly the sort of moment you'd want highlighted in a scouting report.",
  "Worth noting in the assessment — this is what you're here to evaluate.",
  "A key data point for anyone watching this player specifically.",
  "File that away — it tells you something about the player's ceiling.",
  "That's the kind of detail that separates thorough scouting from casual observation.",
  "The notebook is busy. This is the evidence you need.",
  "A revealing moment for anyone evaluating this player's potential.",
  "This is exactly what the dossier needs — real match evidence.",
];

// ---------------------------------------------------------------------------
// Template bank — 14 event types, 8+ templates each
// ---------------------------------------------------------------------------

export const COMMENTARY_TEMPLATES: Record<MatchEventType, CommentaryTemplate[]> = {
  // =========================================================================
  // GOAL
  // =========================================================================
  goal: [
    {
      generic: "{minute}' — {playerName} latches onto a loose ball and drives it low into the corner. GOAL!",
      byPosition: {
        ST: "{minute}' — Classic centre-forward's goal from {playerName}, who peels off the shoulder of the last defender and finishes clinically.",
        CAM: "{minute}' — {playerName} arrives late in the box and slots home — the kind of goal creative midfielders dream about.",
        CB: "{minute}' — {playerName} storms up from centre-back to power a header home! An unlikely goalscorer.",
        LW: "{minute}' — {playerName} cuts in from the left flank and curls one into the far corner. GOAL!",
        RW: "{minute}' — {playerName} drifts inside from the right and fires across the keeper. GOAL!",
      },
      formAware: {
        highForm: "{minute}' — GOAL! {playerName} simply cannot stop scoring — that's another one to add to a remarkable run of form.",
        lowForm: "{minute}' — GOAL! Could this be the turning point? {playerName} has been desperate for that and the relief is palpable.",
      },
      scoutingRelevant: "{minute}' — GOAL! {playerName} finishes with the composure of a player who belongs at a higher level. A moment the scouts will circle in red ink.",
    },
    {
      generic: "{minute}' — GOAL! {playerName} is unmarked at the far post and nods it home.",
      byPosition: {
        ST: "{minute}' — GOAL! {playerName} drifts across the front of goal and taps in from close range. The poacher's instinct.",
        CB: "{minute}' — GOAL! {playerName} rises above everyone from the set piece — commanding aerial presence.",
        CDM: "{minute}' — GOAL! {playerName} arrives at the far post unmarked — a midfielder's run that nobody tracked.",
      },
      formAware: {
        highForm: "{minute}' — GOAL! Everything {playerName} touches turns to gold right now.",
        lowForm: "{minute}' — GOAL! A massive moment for {playerName} who needed that badly after a difficult spell.",
      },
    },
    {
      generic: "{minute}' — Clinical finish from {playerName}, who cuts inside and curls it beyond the keeper.",
      byPosition: {
        LW: "{minute}' — {playerName} receives on the left touchline, cuts onto the right foot, and bends it into the far corner. Textbook winger's goal.",
        RW: "{minute}' — {playerName} comes inside from the right, shifts it to the left foot, and curls it home. A move rehearsed a thousand times.",
        ST: "{minute}' — {playerName} takes a touch to control, another to set, and the finish is pure class. Clinical.",
      },
      scoutingRelevant: "{minute}' — The technique on that finish from {playerName} is outstanding. Scouts will have taken note — the composure under pressure tells you everything.",
    },
    {
      generic: "{minute}' — {playerName} smashes it into the roof of the net from eight yards! GOAL!",
      byPosition: {
        ST: "{minute}' — {playerName} reacts fastest in the six-yard box and prods it home. The striker's instinct at its finest.",
        CM: "{minute}' — {playerName} times the run from midfield perfectly and arrives to sweep the ball home. GOAL!",
        LB: "{minute}' — {playerName} gallops forward from left-back and finishes like a seasoned striker! An extraordinary goal.",
        RB: "{minute}' — {playerName} bombs up from right-back and slots it home — an adventurous full-back rewarded!",
      },
    },
    {
      generic: "{minute}' — A scrappy finish from {playerName}, but they all count! GOAL!",
      formAware: {
        highForm: "{minute}' — {playerName} makes it look easy — GOAL! When you're in this kind of form, everything falls into place.",
        lowForm: "{minute}' — {playerName} scrambles it over the line — ugly, but who cares? Every goal counts when confidence is low.",
      },
    },
    {
      generic: "{minute}' — {playerName} pounces on a defensive error and finishes calmly. GOAL!",
      byPosition: {
        ST: "{minute}' — The pressing from {playerName} forces the mistake, and the finish is ruthless. A striker's goal from start to finish.",
        LW: "{minute}' — {playerName} capitalises on a defensive slip, races clear and coolly slots home. GOAL!",
        RW: "{minute}' — {playerName} intercepts the poor pass and bears down on goal. Composed finish — GOAL!",
      },
    },
  ],

  // =========================================================================
  // ASSIST
  // =========================================================================
  assist: [
    {
      generic: "{minute}' — Brilliant ball from {playerName} sets up the chance.",
      byPosition: {
        CAM: "{minute}' — {playerName} threads a beautiful through-ball from the number 10 position — the kind of pass that justifies the creative licence.",
        CM: "{minute}' — {playerName} picks the lock from deep in midfield with a perfectly weighted ball.",
        LW: "{minute}' — {playerName} delivers from the left flank — a pinpoint cross that the striker can't miss.",
        RW: "{minute}' — {playerName} whips in a delivery from the right that finds its target perfectly.",
        LB: "{minute}' — Overlapping run from {playerName} at left-back, and the cross is inch-perfect. Excellent assist.",
        RB: "{minute}' — {playerName} advances from right-back and delivers a ball that deserved a goal. Assist!",
        ST: "{minute}' — Unselfish from {playerName}, who squares it instead of shooting. A striker with awareness beyond their years.",
      },
      formAware: {
        highForm: "{minute}' — {playerName} has been creating chances for fun lately — another exquisite assist.",
        lowForm: "{minute}' — A flash of the quality we know {playerName} possesses. Perhaps a sign the form is returning.",
      },
      scoutingRelevant: "{minute}' — That vision from {playerName} is exceptional. The ability to see and execute a pass of that quality under pressure is rare at this level.",
    },
    {
      generic: "{minute}' — {playerName} threads the perfect pass to create the opening.",
      byPosition: {
        CAM: "{minute}' — A moment of pure invention from {playerName} in the pocket — the defence didn't see the pass coming.",
        CDM: "{minute}' — {playerName} looks up from the base of midfield and finds a pass that bypasses three lines. Outstanding range.",
        CB: "{minute}' — {playerName} steps forward from the back line and plays a 40-yard diagonal that sets up the goal. Ball-playing centre-back at its finest.",
      },
      scoutingRelevant: "{minute}' — The weight and timing of that ball from {playerName} is exactly what top-level scouts look for. That kind of passing is hard to coach.",
    },
    {
      generic: "{minute}' — Smart combination play from {playerName} creates the opening.",
      byPosition: {
        CM: "{minute}' — Quick feet and a quicker brain from {playerName} in midfield — the one-two carves the defence apart.",
        ST: "{minute}' — {playerName} links play brilliantly, laying it off with a deft backheel. More than just a goalscorer.",
      },
    },
    {
      generic: "{minute}' — {playerName} spots the run early and delivers a ball that demands to be finished.",
      byPosition: {
        LW: "{minute}' — {playerName} looks up from the left touchline and picks out the striker with a measured cross. Wonderful delivery.",
        RW: "{minute}' — From the right, {playerName} floats in a cross that hangs in the air just long enough. Perfect assist.",
        CAM: "{minute}' — {playerName} slips it through with the outside of the boot — outrageous technique to create the chance.",
      },
    },
    {
      generic: "{minute}' — A fortunate ricochet puts {playerName} in position to play the final ball.",
    },
    {
      generic: "{minute}' — {playerName} plays a simple ball that unlocks the entire defensive structure. Vision.",
      formAware: {
        highForm: "{minute}' — {playerName} continues to see passes that nobody else on the pitch can see. Superb form.",
        lowForm: "{minute}' — A moment of quality from {playerName} after a difficult period. The talent is still there.",
      },
    },
  ],

  // =========================================================================
  // SHOT
  // =========================================================================
  shot: [
    {
      generic: "{minute}' — {playerName} gets a sight of goal but fires straight at the keeper.",
      byPosition: {
        ST: "{minute}' — {playerName} gets the shot away from the edge of the box — a striker's effort, but it lacks conviction.",
        CDM: "{minute}' — {playerName} lets fly from 30 yards. The holding midfielder has a dig — straight at the keeper.",
        CB: "{minute}' — {playerName} ventures forward and tries a shot. Centre-backs don't score often, and this one shows why.",
      },
      formAware: {
        highForm: "{minute}' — Even in excellent form, not every shot finds the net. {playerName} fires one at the keeper.",
        lowForm: "{minute}' — {playerName}'s confidence is visibly lacking — the shot is tame and central. No conviction.",
      },
    },
    {
      generic: "{minute}' — Powerful effort from {playerName} forces a fine save at full stretch.",
      byPosition: {
        ST: "{minute}' — {playerName} shifts the ball onto the right foot and unleashes a thunderbolt. The keeper does brilliantly.",
        LW: "{minute}' — {playerName} cuts in from the left and lets fly. A stinging effort that forces a sharp save.",
        RW: "{minute}' — {playerName} comes inside and fires with the left foot. Power and precision — only the goalkeeper prevents a goal.",
        CM: "{minute}' — {playerName} drives forward from midfield and tests the goalkeeper with a rasping drive.",
      },
      scoutingRelevant: "{minute}' — That shot from {playerName} had everything — technique, power, conviction. The quality of the strike tells you about the level this player can reach.",
    },
    {
      generic: "{minute}' — {playerName} cuts inside and bends one just wide of the far post. Unlucky.",
      byPosition: {
        LW: "{minute}' — {playerName} shifts it onto the right foot from the left channel and curls it just wide. So close.",
        RW: "{minute}' — {playerName} cuts in from the right and whips one towards the far corner. Inches away.",
        CAM: "{minute}' — {playerName} drifts into space in the hole and lets fly — it shaves the post on its way wide.",
      },
    },
    {
      generic: "{minute}' — Long-range effort from {playerName} — clips the crossbar and goes over.",
      byPosition: {
        CM: "{minute}' — {playerName} strikes it cleanly from distance. It rattles the bar — what a hit from a midfielder.",
        CDM: "{minute}' — {playerName} tries their luck from deep. It smashes the woodwork — a thunderous strike.",
      },
    },
    {
      generic: "{minute}' — Wild effort from {playerName}, sliced well wide from a promising position.",
      formAware: {
        highForm: "{minute}' — A rare miss from {playerName} — you'd expect better given their recent form.",
        lowForm: "{minute}' — Another wasteful effort from {playerName}. The body language tells the whole story.",
      },
    },
    {
      generic: "{minute}' — {playerName} shapes to shoot and lets fly. The keeper can only parry.",
      byPosition: {
        ST: "{minute}' — {playerName} swivels and shoots in one movement. Quick feet, quick thinking — the keeper does well to keep it out.",
        CAM: "{minute}' — {playerName} finds a pocket of space and stings the keeper's palms from 20 yards.",
      },
    },
    {
      generic: "{minute}' — Half-chance for {playerName}, who drags it across the face of goal. Close, but not close enough.",
    },
    {
      generic: "{minute}' — {playerName} lets fly from the edge of the area. Decent connection but it sails over the bar.",
      scoutingRelevant: "{minute}' — {playerName} shows good technique in the strike even though it doesn't hit the target. The willingness to shoot from range is a positive trait.",
    },
  ],

  // =========================================================================
  // PASS
  // =========================================================================
  pass: [
    {
      generic: "{minute}' — {playerName} picks up the ball in midfield and threads a diagonal to the wing.",
      byPosition: {
        GK: "{minute}' — Excellent distribution from {playerName} in goal — a raking pass out to the full-back that bypasses the press entirely.",
        CB: "{minute}' — {playerName} steps out from the back and plays a measured ball through midfield. Composed on the ball for a centre-back.",
        CDM: "{minute}' — {playerName} receives in the pivot and sprays a 40-yard switch of play. That range from the holding role is invaluable.",
        CM: "{minute}' — {playerName} threads a diagonal from deep midfield that cuts through two lines of defence.",
        CAM: "{minute}' — {playerName} drifts into the pocket and plays a delightful ball round the corner. The number 10 at work.",
      },
      scoutingRelevant: "{minute}' — The weight and precision of that pass from {playerName} are noteworthy. That kind of technique under pressure separates levels.",
    },
    {
      generic: "{minute}' — Delicate flick from {playerName} releases the runner in behind.",
      byPosition: {
        CAM: "{minute}' — {playerName} sees the run before anyone else and plays a first-time flick into the channel. Pure instinct from the playmaker.",
        ST: "{minute}' — {playerName} drops deep, holds the ball under pressure, and plays a clever flick to release the overlapping runner.",
        CM: "{minute}' — {playerName} plays a one-touch ball that sets the counter in motion. Intelligent and incisive.",
      },
      formAware: {
        highForm: "{minute}' — {playerName} is playing with supreme confidence right now — that pass was outrageous.",
        lowForm: "{minute}' — A glimmer of the quality that seems to have deserted {playerName} in recent weeks.",
      },
    },
    {
      generic: "{minute}' — {playerName} switches play with a sweeping 50-yard ball to the far side.",
      byPosition: {
        CB: "{minute}' — Superb range of passing from {playerName} — a ball-playing centre-back who can open the pitch up.",
        CDM: "{minute}' — {playerName} hits a crossfield ball on the half-volley that finds the winger in stride. Outstanding technique.",
        GK: "{minute}' — {playerName} launches a precise goal kick that finds the striker's chest 60 yards away. Modern goalkeeping.",
      },
    },
    {
      generic: "{minute}' — Quick one-two between {playerName} and a teammate cuts through the press.",
      byPosition: {
        CM: "{minute}' — {playerName} plays a sharp wall-pass that leaves two defenders flat-footed. Intelligent combination play.",
        CAM: "{minute}' — One-touch football from {playerName} in tight spaces. The ability to play in confined areas is rare.",
        LW: "{minute}' — {playerName} exchanges a quick one-two with the full-back and bursts past the marker.",
        RW: "{minute}' — {playerName} links with the overlapping right-back to work the ball into a dangerous area.",
      },
    },
    {
      generic: "{minute}' — Safe sideways ball from {playerName}. Keeping it simple, nothing more.",
      formAware: {
        highForm: "{minute}' — Even the simple passes from {playerName} are crisp and precise today. Confidence is everything.",
        lowForm: "{minute}' — {playerName} opts for the safe option. Playing within themselves — no risks.",
      },
    },
    {
      generic: "{minute}' — Incisive through-ball from {playerName} splits the two centre-backs.",
      byPosition: {
        CAM: "{minute}' — {playerName} threads the needle from the number 10 position — a pass that required vision, timing and technique in equal measure.",
        CM: "{minute}' — {playerName} plays a ball that no one else on the pitch saw — splitting the defence with surgical precision.",
      },
      scoutingRelevant: "{minute}' — Take note of that pass from {playerName}. The vision to see it, the technique to deliver it — that's top-level quality.",
    },
    {
      generic: "{minute}' — {playerName} recycles possession under pressure. Tidy and reliable.",
      byPosition: {
        CDM: "{minute}' — {playerName} receives under pressure, shields it, and plays the simple ball. The unglamorous work that makes teams tick.",
        CB: "{minute}' — {playerName} plays it short under pressure — composure from a centre-back who trusts their own ability on the ball.",
      },
    },
  ],

  // =========================================================================
  // DRIBBLE
  // =========================================================================
  dribble: [
    {
      generic: "{minute}' — {playerName} takes on the full-back and goes past with a sharp change of direction.",
      byPosition: {
        LW: "{minute}' — {playerName} drives at the right-back from the left flank, drops a shoulder and glides past. Electric.",
        RW: "{minute}' — {playerName} isolates the left-back one-on-one and beats them with devastating pace on the outside.",
        ST: "{minute}' — {playerName} drops deep, picks up the ball and drives at the heart of the defence. Powerful carry from the striker.",
        CAM: "{minute}' — {playerName} receives between the lines, turns, and ghosts past the nearest marker. Sublime close control.",
        CM: "{minute}' — {playerName} drives forward from midfield, evading two challenges with quick feet. Progressive carrying from the engine room.",
      },
      scoutingRelevant: "{minute}' — Watch the body shape from {playerName} — the low centre of gravity, the explosive change of pace. That dribbling profile is worth tracking.",
    },
    {
      generic: "{minute}' — Brilliant footwork from {playerName}, feints inside before jinking outside.",
      byPosition: {
        LW: "{minute}' — {playerName} shapes to cut inside, then explodes down the line. The full-back is left trailing.",
        RW: "{minute}' — Stepover from {playerName} on the right — the defender bites and is beaten completely.",
        CAM: "{minute}' — {playerName} wriggles free in a tight area. The feet are mesmerising when given space.",
      },
      formAware: {
        highForm: "{minute}' — {playerName} is unplayable right now — dancing past defenders like they aren't there.",
        lowForm: "{minute}' — {playerName} tries the trick but it doesn't quite come off. The confidence to attempt it is notable, at least.",
      },
    },
    {
      generic: "{minute}' — {playerName} dribbles into the box, rides two challenges, but runs into a dead end.",
      byPosition: {
        ST: "{minute}' — {playerName} takes on too many and eventually loses out. Brave but overcomplicated.",
        LW: "{minute}' — {playerName} beats one, beats two, but a third defender marshals them into the corner flag.",
      },
    },
    {
      generic: "{minute}' — Strong direct run from {playerName}, showing great balance to advance.",
      byPosition: {
        LB: "{minute}' — {playerName} surges forward from left-back with a powerful carry — the modern full-back in all their glory.",
        RB: "{minute}' — {playerName} gallops forward from right-back, beating the press with a direct run that creates an overload.",
        CDM: "{minute}' — {playerName} drives forward from deep, carrying the ball with purpose through the midfield third.",
      },
    },
    {
      generic: "{minute}' — Slow, hesitant dribble from {playerName} — the defender reads it easily.",
      formAware: {
        highForm: "{minute}' — A rare misstep from {playerName} — even the best get caught occasionally.",
        lowForm: "{minute}' — {playerName} hesitates and the chance to commit the defender is lost. The indecision speaks volumes.",
      },
    },
    {
      generic: "{minute}' — {playerName} drops a shoulder and bursts clear. Explosive acceleration off the mark.",
      byPosition: {
        ST: "{minute}' — {playerName} takes the ball in stride, knocks it past the defender, and uses raw power to drive forward.",
        LW: "{minute}' — {playerName} leaves the right-back grasping at air with a devastating burst of speed.",
        RW: "{minute}' — {playerName} beats the full-back with pace alone — no tricks needed when you're this quick.",
      },
      scoutingRelevant: "{minute}' — The acceleration from {playerName} is genuinely elite. First two yards of pace like that can't be taught — make a note of it.",
    },
  ],

  // =========================================================================
  // TACKLE
  // =========================================================================
  tackle: [
    {
      generic: "{minute}' — {playerName} times the sliding challenge perfectly to dispossess the attacker.",
      byPosition: {
        CB: "{minute}' — {playerName} times the challenge to perfection — a commanding slide tackle that epitomises centre-back play.",
        CDM: "{minute}' — {playerName} snaps into the tackle from the holding role. Aggressive but clean — exactly what the position demands.",
        LB: "{minute}' — {playerName} slides in from the left-back position to win the ball and immediately transition to attack.",
        RB: "{minute}' — {playerName} puts in a crunching tackle down the right flank. Full-back defending at its finest.",
        CM: "{minute}' — {playerName} gets across sharply and times the tackle well. Midfield industry at its best.",
      },
      scoutingRelevant: "{minute}' — The timing on that tackle from {playerName} is outstanding. That defensive technique at this age is rare.",
    },
    {
      generic: "{minute}' — Muscular challenge from {playerName}, who wins the ball fairly and drives forward.",
      byPosition: {
        CB: "{minute}' — {playerName} uses their physicality to dominate the challenge. A no-nonsense centre-back who wins the ball cleanly.",
        CDM: "{minute}' — {playerName} wins the ball with a strong challenge and immediately plays the first pass forward. The complete holding midfielder.",
      },
      formAware: {
        highForm: "{minute}' — {playerName} is reading the game beautifully right now — winning every duel they contest.",
        lowForm: "{minute}' — A solid challenge from {playerName}, though the positioning to be in that situation was questionable.",
      },
    },
    {
      generic: "{minute}' — {playerName} reads the danger and steps in with a decisive interception.",
      byPosition: {
        CB: "{minute}' — {playerName} reads the play and steps out from the back line to intercept. Proactive defending from the centre-half.",
        CDM: "{minute}' — {playerName} screens the back four and intercepts the pass before it reaches the danger zone.",
        LB: "{minute}' — {playerName} anticipates the switch of play and is there to cut it out on the left.",
        RB: "{minute}' — {playerName} reads the winger's intent and nips in to steal the ball on the right flank.",
      },
    },
    {
      generic: "{minute}' — Crunching but fair tackle from {playerName} — a statement of intent.",
      byPosition: {
        CB: "{minute}' — A thundering challenge from {playerName} that sends a message to every attacker on the pitch.",
        CDM: "{minute}' — {playerName} leaves one on the striker to let everyone know the midfield belongs to them. Fair, but firm.",
      },
    },
    {
      generic: "{minute}' — Clumsy challenge from {playerName} — the referee waves play on but it was borderline.",
      formAware: {
        highForm: "{minute}' — A rare mistimed challenge from {playerName}. Even top defenders misjudge one now and then.",
        lowForm: "{minute}' — Sloppy from {playerName} — the timing has been off for a few games now.",
      },
    },
    {
      generic: "{minute}' — Desperate lunge from {playerName} doesn't quite make contact. Lucky to get away with it.",
      byPosition: {
        CB: "{minute}' — {playerName} dives in recklessly — a centre-back should know better. The manager will have words.",
        LB: "{minute}' — {playerName} commits fully and misses. The winger has a free run now.",
      },
    },
    {
      generic: "{minute}' — {playerName} wins the ball back with a perfectly timed standing tackle. Textbook.",
      scoutingRelevant: "{minute}' — The defensive instincts from {playerName} are impressive. Clean in the challenge, quick to transition — a defender with a modern skillset.",
    },
  ],

  // =========================================================================
  // HEADER
  // =========================================================================
  header: [
    {
      generic: "{minute}' — Corner kick. {playerName} rises highest but heads wide under pressure.",
      byPosition: {
        CB: "{minute}' — {playerName} attacks the ball at the near post — a centre-back who dominates in the air but can't direct this one.",
        ST: "{minute}' — {playerName} gets above the defender to meet the cross but the header flies over. Close.",
        CDM: "{minute}' — {playerName} arrives at the back post and gets a head on it, but it drifts wide.",
      },
    },
    {
      generic: "{minute}' — Towering header from {playerName} at the near post — straight at the keeper.",
      byPosition: {
        CB: "{minute}' — {playerName} rises imperiously from the back line and powers the header at goal. Good save denies them.",
        ST: "{minute}' — {playerName} peels away from the marker and meets the cross with a bullet header. Only the keeper prevents a goal.",
      },
      formAware: {
        highForm: "{minute}' — {playerName} is dominant in the air right now — attacking every cross with conviction.",
        lowForm: "{minute}' — {playerName} gets the header away but there's no power behind it. The confidence is lacking.",
      },
      scoutingRelevant: "{minute}' — The aerial ability from {playerName} is notable. The timing of the jump, the connection — mark it down.",
    },
    {
      generic: "{minute}' — {playerName} wins the aerial duel convincingly, powering it clear.",
      byPosition: {
        CB: "{minute}' — {playerName} is absolutely dominant in the air — nobody is winning a header against that. A centre-back's bread and butter.",
        CDM: "{minute}' — {playerName} rises in the midfield to clear the high ball. Good aerial presence from the holding player.",
        LB: "{minute}' — {playerName} clears the cross from the left with a decisive header. Doesn't happen often for a full-back, but executed well.",
        RB: "{minute}' — {playerName} heads clear from the far post. Good defensive header from the right-back.",
      },
    },
    {
      generic: "{minute}' — {playerName} gets up well above the defender to redirect the cross.",
      byPosition: {
        ST: "{minute}' — {playerName} times the run perfectly to meet the delivery. The header is solid — forces the keeper into action.",
        CB: "{minute}' — {playerName} arrives at the far post and heads across goal. A threat from set pieces.",
      },
    },
    {
      generic: "{minute}' — Mistimed jump from {playerName} — the ball drops harmlessly to the side.",
      formAware: {
        highForm: "{minute}' — An uncharacteristic mistiming from {playerName}, who has been so good in the air recently.",
        lowForm: "{minute}' — {playerName} gets the timing wrong again. The lack of confidence is affecting even basic aerial challenges.",
      },
    },
    {
      generic: "{minute}' — {playerName} bullies the marker and powers a header goalward.",
      byPosition: {
        ST: "{minute}' — {playerName} shrugs off the defender and meets the cross with real conviction. A striker who relishes aerial duels.",
        CB: "{minute}' — {playerName} shows the aerial dominance that makes them a threat at every set piece.",
      },
      scoutingRelevant: "{minute}' — The physical presence of {playerName} in the air is a real asset. That kind of aerial ability has clear value at the highest level.",
    },
  ],

  // =========================================================================
  // SAVE
  // =========================================================================
  save: [
    {
      generic: "{minute}' — Brilliant reflexes from {playerName} to deny the shot at close range.",
      byPosition: {
        GK: "{minute}' — Outstanding save from {playerName}! Lightning reactions to parry the close-range effort. Top-class goalkeeping.",
      },
      formAware: {
        highForm: "{minute}' — {playerName} is in inspired form between the posts — another magnificent save.",
        lowForm: "{minute}' — A good save from {playerName}, who has been shaky recently. Perhaps a confidence booster.",
      },
      scoutingRelevant: "{minute}' — The reaction speed from {playerName} is exceptional. That save tells you everything about their shot-stopping ability.",
    },
    {
      generic: "{minute}' — {playerName} gets down well to palm the low drive around the post.",
      byPosition: {
        GK: "{minute}' — Textbook save from {playerName} — good footwork to set the position, then a strong hand to push it wide.",
      },
    },
    {
      generic: "{minute}' — Routine stop from {playerName} — a comfortable gather from a speculative effort.",
      byPosition: {
        GK: "{minute}' — {playerName} collects comfortably. Solid positioning means the save looks easier than it is.",
      },
    },
    {
      generic: "{minute}' — {playerName} reads the flight early and plucks the cross out of the air with authority.",
      byPosition: {
        GK: "{minute}' — {playerName} comes to claim the cross with authority — commanding their area like an experienced keeper.",
      },
      scoutingRelevant: "{minute}' — The command of the area from {playerName} is impressive. A goalkeeper who dominates their box is worth their weight in gold.",
    },
    {
      generic: "{minute}' — Good footwork from {playerName} to narrow the angle — the attacker has no choice but to shoot straight at them.",
      byPosition: {
        GK: "{minute}' — {playerName} makes the save look routine by getting the angles right. Good positioning is the hallmark of a top keeper.",
      },
    },
    {
      generic: "{minute}' — {playerName} dives full-stretch to tip the shot around the post! Extraordinary reflexes.",
      byPosition: {
        GK: "{minute}' — WHAT A SAVE from {playerName}! Full-stretch, fingertips, around the post. That's a save that wins matches.",
      },
      formAware: {
        highForm: "{minute}' — {playerName} is absolutely unbeatable today. Another world-class save adds to a remarkable run.",
        lowForm: "{minute}' — Out of nowhere, {playerName} produces a save of real quality. A reminder of the ability that's been missing recently.",
      },
    },
  ],

  // =========================================================================
  // FOUL
  // =========================================================================
  foul: [
    {
      generic: "{minute}' — {playerName} goes in too hard and the referee blows for a foul.",
      byPosition: {
        CB: "{minute}' — {playerName} misjudges the challenge from the back — a clumsy foul that gives away a free kick.",
        CDM: "{minute}' — {playerName} catches the attacker with a late challenge in midfield. The referee has no hesitation.",
        LB: "{minute}' — {playerName} clips the winger's heels from behind. A careless foul from the left-back.",
        RB: "{minute}' — {playerName} brings down the attacker on the right flank. A professional foul but it earns a booking.",
      },
      formAware: {
        highForm: "{minute}' — Uncharacteristic foul from {playerName}, who has been so disciplined recently.",
        lowForm: "{minute}' — Another rash challenge from {playerName}. The frustration is showing in their game.",
      },
    },
    {
      generic: "{minute}' — Cynical foul from {playerName} to stop the counter-attack.",
      byPosition: {
        CDM: "{minute}' — Tactical foul from {playerName} — the holding midfielder does the dirty work to break up the counter.",
        CM: "{minute}' — {playerName} hauls down the attacker to stop the break. Smart if cynical — the team needed that.",
        CB: "{minute}' — {playerName} brings down the striker on the halfway line. The professional foul — knows exactly what they're doing.",
      },
      scoutingRelevant: "{minute}' — Note the game intelligence from {playerName} — the decision to foul was calculated and correct. Tactical maturity beyond their years.",
    },
    {
      generic: "{minute}' — {playerName} mistimes the challenge badly — the referee has no hesitation.",
      byPosition: {
        CB: "{minute}' — Dangerous challenge from {playerName} — the centre-back goes to ground too early and the referee reaches for the card.",
        LB: "{minute}' — {playerName} lunges in from behind at left-back. Lucky that's only a yellow.",
        RB: "{minute}' — Reckless from {playerName} — the right-back slides in with studs showing.",
      },
    },
    {
      generic: "{minute}' — {playerName} catches the attacker on the follow-through. Careless under pressure.",
    },
    {
      generic: "{minute}' — Smart professional foul from {playerName} to protect the defensive shape.",
      byPosition: {
        CDM: "{minute}' — {playerName} takes one for the team — a professional foul from the holding midfielder that prevents a 3-on-2.",
        CB: "{minute}' — {playerName} knows exactly what they're doing — a foul that breaks up the most dangerous attack of the half.",
      },
    },
  ],

  // =========================================================================
  // CROSS
  // =========================================================================
  cross: [
    {
      generic: "{minute}' — {playerName} delivers a whipped cross from the flank — no one gets on the end of it.",
      byPosition: {
        LB: "{minute}' — {playerName} overlaps on the left and whips in a dangerous cross. Good delivery from the full-back, but nobody attacks it.",
        RB: "{minute}' — {playerName} bombs forward on the right and delivers an inviting ball into the box. The strikers can't get there.",
        LW: "{minute}' — {playerName} reaches the byline on the left and cuts it back, but the cross eludes everyone in the area.",
        RW: "{minute}' — {playerName} drives to the right touchline and delivers a deep cross. Just too much on it for the far post.",
        CM: "{minute}' — {playerName} drifts wide and delivers a cross into the danger area from midfield. Versatile play.",
      },
      formAware: {
        highForm: "{minute}' — The delivery from {playerName} is superb — shame nobody got on the end of it. The form deserves a goal.",
        lowForm: "{minute}' — {playerName} overhits the cross again. The consistency has been an issue for weeks.",
      },
    },
    {
      generic: "{minute}' — {playerName} cuts inside and floats a precise cross to the back post.",
      byPosition: {
        LW: "{minute}' — {playerName} comes inside from the left and clips a beautiful ball to the far post with the right foot.",
        RW: "{minute}' — {playerName} drifts inside from the right and picks out the back post with a measured delivery.",
        LB: "{minute}' — {playerName} underlaps from left-back and delivers a teasing ball into the area. Quality delivery.",
        RB: "{minute}' — {playerName} advances from right-back and curls in a delightful cross. Excellent going forward.",
      },
      scoutingRelevant: "{minute}' — That crossing technique from {playerName} is first-class. The ability to deliver consistently from wide positions is a premium skill.",
    },
    {
      generic: "{minute}' — {playerName} picks out the far post with a weighted delivery. The striker just can't convert.",
      byPosition: {
        LW: "{minute}' — {playerName} measures the cross perfectly from the left — the striker should do better.",
        RW: "{minute}' — {playerName} finds the gap in the defence with a wicked delivery from the right.",
        LB: "{minute}' — {playerName} reaches the byline from left-back and stands up a cross that hangs invitingly.",
      },
    },
    {
      generic: "{minute}' — Overhit cross from {playerName} — sails straight out for a goal kick.",
      formAware: {
        highForm: "{minute}' — A rare poor delivery from {playerName}. Can't nail every one, even in top form.",
        lowForm: "{minute}' — {playerName} misjudges the cross completely. Another wasted opportunity from a player low on confidence.",
      },
    },
    {
      generic: "{minute}' — {playerName} tries to whip one in but the contact is poor. No real danger.",
    },
    {
      generic: "{minute}' — Good work from {playerName} to win space before curling in an inviting cross.",
      byPosition: {
        RW: "{minute}' — {playerName} beats the marker on the right, reaches the byline, and stands up a cross that causes panic.",
        LW: "{minute}' — {playerName} drives past the full-back on the left and delivers a cross that demands to be attacked.",
        RB: "{minute}' — {playerName} overlaps, beats the winger for pace, and delivers a cross of genuine quality.",
        LB: "{minute}' — {playerName} provides the width from left-back and clips in a cross that the centre-back only just clears.",
      },
      scoutingRelevant: "{minute}' — The crossing ability from {playerName} is a genuine weapon. That delivery — pace, accuracy, curve — is top-level quality.",
    },
  ],

  // =========================================================================
  // SPRINT
  // =========================================================================
  sprint: [
    {
      generic: "{minute}' — {playerName} bursts past two defenders with raw pace before being fouled.",
      byPosition: {
        LW: "{minute}' — {playerName} engages the afterburners down the left flank — the full-back can only resort to a foul.",
        RW: "{minute}' — {playerName} explodes past the left-back with devastating pace on the right. Unstoppable when in full flight.",
        ST: "{minute}' — {playerName} spins off the last defender and accelerates away — the striker's pace is a genuine weapon.",
        LB: "{minute}' — Incredible burst of speed from {playerName} at left-back — recovering to make a challenge that looked impossible.",
        RB: "{minute}' — {playerName} sprints the length of the right flank to support the attack. Outstanding engine from the full-back.",
      },
      scoutingRelevant: "{minute}' — The raw pace from {playerName} is eye-catching. Speed like that is a premium asset at every level of the game.",
    },
    {
      generic: "{minute}' — Relentless pressing from {playerName}, who covers more ground than anyone.",
      byPosition: {
        CM: "{minute}' — {playerName} is box-to-box in the truest sense — the engine that drives this midfield.",
        CDM: "{minute}' — {playerName} covers every blade of grass in front of the back four. The industry is relentless.",
        ST: "{minute}' — {playerName} leads the press from the front with tireless running. The defenders get no peace.",
        CAM: "{minute}' — {playerName} presses from the number 10 position with incredible energy. Not just a creator — a worker too.",
      },
      formAware: {
        highForm: "{minute}' — {playerName} is covering ground like a player possessed right now. The energy levels are extraordinary.",
        lowForm: "{minute}' — {playerName} is trying, but the legs look heavy. The pressing lacks the intensity of previous weeks.",
      },
    },
    {
      generic: "{minute}' — {playerName} makes a lung-bursting 60-yard recovery run to make the challenge.",
      byPosition: {
        CB: "{minute}' — {playerName} shows surprising pace to recover from an exposed position. A centre-back with genuine wheels.",
        CDM: "{minute}' — {playerName} tracks the runner for 50 yards and gets there just in time. Outstanding defensive commitment.",
        LB: "{minute}' — {playerName} sprints back from an advanced position to make a last-ditch tackle. Full-back doing full-back things.",
        RB: "{minute}' — {playerName} races back to cover after being caught high up. The recovery speed is impressive.",
      },
    },
    {
      generic: "{minute}' — {playerName} accelerates away from the last defender with frightening pace.",
      byPosition: {
        ST: "{minute}' — {playerName} leaves the centre-back for dead with a burst of acceleration. The gap between them grows with every stride.",
        LW: "{minute}' — {playerName} hits top speed in three strides down the left. Nobody is catching that.",
        RW: "{minute}' — {playerName} turns on the jets and the full-back is left standing. Devastating speed.",
      },
      formAware: {
        highForm: "{minute}' — {playerName} looks sharper than ever — that first-yard pace is devastating when the confidence is high.",
        lowForm: "{minute}' — {playerName} has the pace but seems hesitant to commit to the sprint. Running within themselves.",
      },
      scoutingRelevant: "{minute}' — That acceleration from {playerName} is a genuine differentiator. The physical profile is exceptional — worth flagging for the database.",
    },
    {
      generic: "{minute}' — Slow recovery run from {playerName} — the defence almost exposes a gap because of it.",
    },
    {
      generic: "{minute}' — {playerName} chases the long ball but can't get there in time. Running out of legs.",
      formAware: {
        highForm: "{minute}' — Even {playerName} can't win every footrace. Good effort, though — the desire is clear.",
        lowForm: "{minute}' — {playerName} is visibly fatigued. The energy that defines their game has been missing lately.",
      },
    },
  ],

  // =========================================================================
  // POSITIONING
  // =========================================================================
  positioning: [
    {
      generic: "{minute}' — {playerName} drifts into space between the lines, always available.",
      byPosition: {
        CAM: "{minute}' — {playerName} finds the pocket between the midfield and defence — the number 10's habitat. Always available, always thinking.",
        ST: "{minute}' — {playerName} peels off the shoulder of the last defender, timing the run to stay onside by inches. A striker's intelligence.",
        CM: "{minute}' — {playerName} positions themselves to receive on the half-turn — it's the angle that creates the option to play forward.",
        CDM: "{minute}' — {playerName} sits in the space in front of the back four. The discipline to hold position while others attack is underrated.",
        GK: "{minute}' — {playerName} sweeps behind the high line, reading the danger before it develops. A modern goalkeeper's positioning.",
      },
      scoutingRelevant: "{minute}' — The positional intelligence from {playerName} is exceptional for their age. Understanding space at this level suggests a very high ceiling.",
    },
    {
      generic: "{minute}' — Intelligent movement from {playerName}, who drops deep to create an overload.",
      byPosition: {
        ST: "{minute}' — {playerName} drops into midfield to create a numerical advantage. Smart movement that shows tactical maturity.",
        CAM: "{minute}' — {playerName} drops deep to collect the ball and draw defenders out of position. Creating space for others.",
        LW: "{minute}' — {playerName} tucks inside from the left, dragging the full-back and creating space on the overlap.",
        RW: "{minute}' — {playerName} comes narrow from the right, pulling defenders and opening the channel for the full-back.",
      },
    },
    {
      generic: "{minute}' — Smart positioning from {playerName} cuts off the passing lane before the ball arrives.",
      byPosition: {
        CB: "{minute}' — {playerName} reads the play and positions themselves to cut off the through-ball. Proactive defending from the centre-half.",
        CDM: "{minute}' — {playerName} screens the passing lane with perfect body shape. The holding midfielder's positioning is a masterclass.",
        LB: "{minute}' — {playerName} tucks in to cover the centre, recognising the danger before anyone else.",
        RB: "{minute}' — {playerName} narrows the space on the right, forcing the opposition to go long. Disciplined positioning.",
      },
      formAware: {
        highForm: "{minute}' — {playerName} is reading the game two moves ahead right now. Every position is considered, every angle covered.",
        lowForm: "{minute}' — {playerName} is caught out of position again. The concentration has been an issue recently.",
      },
    },
    {
      generic: "{minute}' — {playerName} drifts out of position — a gap forms that the opposition nearly exploits.",
      formAware: {
        highForm: "{minute}' — A rare lapse in concentration from {playerName}, who has been so sharp positionally.",
        lowForm: "{minute}' — {playerName} switches off again. The positional discipline has been poor for weeks now.",
      },
    },
    {
      generic: "{minute}' — {playerName} finds the pocket of space behind the midfield and holds it until the moment arrives.",
      byPosition: {
        CAM: "{minute}' — {playerName} occupies the half-space with perfect timing. The ability to find space in congested areas is a hallmark of elite playmakers.",
        ST: "{minute}' — {playerName} lurks in the channel between centre-back and full-back. The movement is subtle but devastating.",
      },
      scoutingRelevant: "{minute}' — The off-the-ball movement from {playerName} is outstanding. They find space where none seems to exist — that's a skill that transfers to any league.",
    },
    {
      generic: "{minute}' — Lazy shape from {playerName}. Not tracking the run properly.",
    },
  ],

  // =========================================================================
  // ERROR
  // =========================================================================
  error: [
    {
      generic: "{minute}' — Uncharacteristic mistake from {playerName}, misplacing a simple pass.",
      byPosition: {
        GK: "{minute}' — Horror moment for {playerName}! The goalkeeper dwells on the ball and almost gifts a goal. Heart-stopping.",
        CB: "{minute}' — {playerName} plays a loose pass from the back that almost lets the striker in. Concentration lapse from the centre-half.",
        CDM: "{minute}' — {playerName} gives the ball away cheaply in a dangerous area. The holding midfielder can't afford mistakes there.",
        CM: "{minute}' — Sloppy from {playerName} in midfield — a simple pass goes astray and the opposition transition quickly.",
      },
      formAware: {
        highForm: "{minute}' — Even in this run of form, {playerName} shows they're human. A rare error that's quickly forgotten.",
        lowForm: "{minute}' — Another mistake from {playerName}. The errors are becoming a pattern now — something to monitor.",
      },
      scoutingRelevant: "{minute}' — Note the error from {playerName} — it's important context. One mistake doesn't define a player, but frequency and response do.",
    },
    {
      generic: "{minute}' — {playerName} dallies on the ball under pressure and is dispossessed.",
      byPosition: {
        GK: "{minute}' — {playerName} takes too long on the ball and the press forces a panicked clearance. Lucky it didn't cost a goal.",
        CB: "{minute}' — {playerName} takes an extra touch when the simple ball was on. The press catches them napping.",
        CDM: "{minute}' — {playerName} dwells on the ball in the pivot and is robbed. A dangerous area to lose possession.",
      },
    },
    {
      generic: "{minute}' — Heavy first touch from {playerName} lets the defender nip in.",
      byPosition: {
        ST: "{minute}' — {playerName}'s first touch deserts them — the ball bounces off the shin and the chance evaporates.",
        CAM: "{minute}' — {playerName} fumbles the control in a promising area. The technical demands at this level leave no margin.",
        LW: "{minute}' — {playerName} can't control the pass on the run and it spills to the defender.",
        RW: "{minute}' — {playerName}'s touch is heavy and the opportunity to beat the full-back is gone.",
      },
      formAware: {
        highForm: "{minute}' — A poor touch from {playerName} — surprising given the quality they've shown recently.",
        lowForm: "{minute}' — {playerName}'s touch has been unreliable all game. When confidence drains, the basics suffer first.",
      },
    },
    {
      generic: "{minute}' — {playerName} switches off for a moment — fortunate the side doesn't pay a heavier price.",
      byPosition: {
        CB: "{minute}' — {playerName} switches off at the back and the striker steals in. Lucky the offside flag rescues the situation.",
        GK: "{minute}' — {playerName} loses concentration momentarily — the ball almost squirms through. A warning.",
      },
    },
    {
      generic: "{minute}' — A positional error from {playerName} leaves a gap — quickly covered by the team.",
      scoutingRelevant: "{minute}' — The recovery from {playerName} after the error is worth noting. Mistakes happen — the response tells you about the mentality.",
    },
    {
      generic: "{minute}' — {playerName} overcomplicates a simple situation and loses possession.",
      formAware: {
        highForm: "{minute}' — {playerName} tries something ambitious and it doesn't come off. The confidence to try is a positive, even when it fails.",
        lowForm: "{minute}' — {playerName} should have kept it simple. The attempt to force it speaks to a player searching for form.",
      },
    },
  ],

  // =========================================================================
  // LEADERSHIP
  // =========================================================================
  leadership: [
    {
      generic: "{minute}' — {playerName} organises the defensive shape with loud, clear instructions.",
      byPosition: {
        CB: "{minute}' — {playerName} marshals the back line with authority. Pointing, shouting, organising — a centre-back who commands respect.",
        CDM: "{minute}' — {playerName} takes control of the midfield shape, barking instructions to get players into position.",
        GK: "{minute}' — {playerName} organises the wall and positions the defence with the authority of a veteran goalkeeper.",
        CM: "{minute}' — {playerName} takes responsibility for the team's shape, directing traffic from the heart of midfield.",
        ST: "{minute}' — {playerName} leads from the front, directing the press and telling teammates where to position.",
      },
      scoutingRelevant: "{minute}' — The leadership qualities from {playerName} are evident. Vocal, composed, and willing to take responsibility — those traits add immense value to any squad.",
    },
    {
      generic: "{minute}' — After a difficult spell, {playerName} rallies teammates with visible encouragement.",
      byPosition: {
        CB: "{minute}' — {playerName} gathers the back four together after a shaky period. The calming influence of an experienced defender.",
        CAM: "{minute}' — {playerName} claps hands and demands the ball. A creative player showing courage when the team needs it most.",
        ST: "{minute}' — {playerName} refuses to hide. Dropping deep, encouraging teammates, demanding higher standards. Leading by example.",
      },
      formAware: {
        highForm: "{minute}' — {playerName} leads with the confidence of someone in superb form. The team follows willingly.",
        lowForm: "{minute}' — Credit to {playerName} — still leading despite their own difficult run. That character is worth noting.",
      },
    },
    {
      generic: "{minute}' — {playerName} calls for the ball and takes responsibility when it matters.",
      byPosition: {
        CM: "{minute}' — {playerName} demands the ball in a tight moment. The willingness to be accountable under pressure is a rare quality in midfield.",
        CAM: "{minute}' — {playerName} wants the ball in every situation. The creative player who refuses to hide — that's what sets the best apart.",
        CB: "{minute}' — {playerName} steps into midfield to collect the ball and calm the situation. A centre-back who leads with the ball at their feet.",
      },
      scoutingRelevant: "{minute}' — That moment from {playerName} reveals genuine leadership character. Taking responsibility under pressure is what separates good players from great ones.",
    },
    {
      generic: "{minute}' — A gesture from {playerName} to reorganise the defensive line. Routine but necessary.",
    },
    {
      generic: "{minute}' — {playerName} gathers the group after conceding. Steady voice, pointing out positions.",
      byPosition: {
        GK: "{minute}' — {playerName} calls the defenders together immediately after the goal. A goalkeeper who takes ownership of the collective defence.",
        CB: "{minute}' — {playerName} is the first to rally the troops. The setback is acknowledged and the response is demanded. Real leadership.",
      },
      formAware: {
        highForm: "{minute}' — {playerName} handles the setback with the composure of someone in superb form. The team trusts them completely.",
        lowForm: "{minute}' — Even through their own struggles, {playerName} puts the team first. Character revealed in adversity.",
      },
    },
    {
      generic: "{minute}' — {playerName} takes the ball, slows the game down and speaks to teammates. Game management.",
      scoutingRelevant: "{minute}' — {playerName} shows maturity beyond their years here. The ability to manage the tempo of a match is a sign of genuine footballing intelligence.",
    },
  ],

  // =========================================================================
  // AERIAL DUEL
  // =========================================================================
  aerialDuel: [
    {
      generic: "{minute}' — {playerName} and {secondaryName} contest a high ball — {playerName} wins it convincingly.",
      byPosition: {
        CB: "{minute}' — {playerName} rises above the striker to win the aerial duel. Dominant in the air — a centre-back's bread and butter.",
        ST: "{minute}' — {playerName} outmuscles the defender to win the flick-on. Useful aerial presence for a striker.",
        CDM: "{minute}' — {playerName} wins the second ball in the air. A midfield anchor who competes physically.",
      },
      scoutingRelevant: "{minute}' — {playerName} wins another aerial contest. The consistency of their jumping and timing is worth noting — a genuine asset at set pieces.",
    },
    {
      generic: "{minute}' — Towering leap from {playerName}, who dominates the aerial challenge to clear the danger.",
      byPosition: {
        CB: "{minute}' — {playerName} times the jump perfectly, heading clear with authority. Aerially dominant at the back.",
        ST: "{minute}' — {playerName} powers the header across the box. A forward who gives the defence no peace in the air.",
      },
      formAware: {
        highForm: "{minute}' — {playerName} wins everything in the air today. Confidence translating into physical dominance.",
        lowForm: "{minute}' — {playerName} misjudges the flight and loses the aerial duel. Timing has been off recently.",
      },
    },
    {
      generic: "{minute}' — An aggressive aerial battle — {playerName} gets there first and nods it clear.",
    },
    {
      generic: "{minute}' — {playerName} times the jump perfectly, powering the header across the box.",
      scoutingRelevant: "{minute}' — The aerial ability of {playerName} is a clear strength. Timing, leap, and aggression — all present in abundance.",
    },
  ],

  // =========================================================================
  // INTERCEPTION
  // =========================================================================
  interception: [
    {
      generic: "{minute}' — {playerName} reads the pass before it's played and steps in to cut it out.",
      byPosition: {
        CB: "{minute}' — {playerName} reads the striker's movement and intercepts the through-ball. Anticipation of the highest order from the centre-back.",
        CDM: "{minute}' — {playerName} sits in front of the back four and snuffs out the danger before it develops. A defensive midfielder doing their job perfectly.",
        LB: "{minute}' — {playerName} anticipates the wide pass and steps across to intercept. Intelligent defending from the full-back.",
        RB: "{minute}' — {playerName} reads the switch of play and gets across early to intercept. Alert defending.",
      },
      scoutingRelevant: "{minute}' — {playerName} reads the game superbly here. The ability to anticipate and intercept is a skill that doesn't show up in highlight reels but wins matches.",
    },
    {
      generic: "{minute}' — Excellent anticipation from {playerName}, who ghosts in to intercept the through-ball.",
      formAware: {
        highForm: "{minute}' — {playerName} is reading everything today. Another interception — they're a step ahead of the opposition.",
        lowForm: "{minute}' — {playerName} finally reads one correctly after a shaky spell. A confidence-boosting interception.",
      },
    },
    {
      generic: "{minute}' — {playerName} tracks the runner perfectly and picks the pocket at exactly the right moment.",
      byPosition: {
        CB: "{minute}' — {playerName} steps out of the line to intercept. Brave defending — if they'd missed it, the striker was through.",
        CDM: "{minute}' — {playerName} sweeps up in front of the back line. The positioning to be in the right place time after time is a real quality.",
      },
    },
    {
      generic: "{minute}' — Sharp interception by {playerName} — sniffed out the danger before it developed.",
    },
  ],

  // =========================================================================
  // THROUGH BALL
  // =========================================================================
  throughBall: [
    {
      generic: "{minute}' — Exquisite through-ball from {playerName} slices the defence open and finds {secondaryName} in behind.",
      byPosition: {
        CAM: "{minute}' — {playerName} sees the run early and threads the needle between two centre-backs. That's the vision of a genuine number ten.",
        CM: "{minute}' — {playerName} picks up the ball in the centre circle and plays a laser-guided pass that splits the defence. Quality from deep.",
        CDM: "{minute}' — {playerName} surprises everyone with a raking through-ball from the holding position. The range of passing is exceptional.",
      },
      scoutingRelevant: "{minute}' — That through-ball from {playerName} was special. The vision to see the pass and the technique to execute it — that's a player who can unlock any defence.",
    },
    {
      generic: "{minute}' — {playerName} spots the run and slips the ball between two centre-backs — sublime vision.",
      formAware: {
        highForm: "{minute}' — {playerName} is seeing passes that nobody else can today. Another defence-splitting through-ball.",
        lowForm: "{minute}' — {playerName} tries the ambitious through-ball but overhits it. The intention was right, the execution lacking.",
      },
    },
    {
      generic: "{minute}' — Perfectly weighted pass from {playerName} releases {secondaryName} clear on goal.",
      byPosition: {
        CAM: "{minute}' — {playerName} plays a disguised through-ball that completely deceives the back line. Creative genius.",
        LW: "{minute}' — {playerName} cuts inside and threads a through-ball across the face of the defence. Vision from the wing.",
        RW: "{minute}' — {playerName} looks up and plays a diagonal through-ball that nobody expected. Rare quality from the wide position.",
      },
    },
    {
      generic: "{minute}' — {playerName} picks up the ball, takes one touch, then threads a laser pass through the lines.",
      scoutingRelevant: "{minute}' — The passing range and vision from {playerName} is outstanding. That kind of incisive ball is what separates the elite playmakers.",
    },
  ],

  // =========================================================================
  // HOLD UP
  // =========================================================================
  holdUp: [
    {
      generic: "{minute}' — {playerName} receives with back to goal, holds off {secondaryName} with great strength, and lays it off.",
      byPosition: {
        ST: "{minute}' — {playerName} takes the long ball on the chest, shields it from the centre-back, and brings teammates into play. Textbook target-man work.",
        CAM: "{minute}' — {playerName} drops deep, receives under pressure, and holds possession long enough to set the next phase of attack.",
        LW: "{minute}' — {playerName} holds the ball up on the touchline, waiting for support to arrive. Good strength for a wide player.",
        RW: "{minute}' — {playerName} takes the ball in a tight space on the flank, holds off the full-back, and waits for the overlap.",
      },
      scoutingRelevant: "{minute}' — {playerName} shows excellent hold-up ability. The strength and awareness to bring others into play is a quality that makes the whole team function better.",
    },
    {
      generic: "{minute}' — Excellent link-up play from {playerName}, who holds the ball up and brings others into play.",
      formAware: {
        highForm: "{minute}' — {playerName} is winning every physical battle today. Another superb piece of hold-up play.",
        lowForm: "{minute}' — {playerName} tries to hold it up but is muscled off the ball too easily. The touch has been heavy today.",
      },
    },
    {
      generic: "{minute}' — {playerName} takes the ball under pressure, shields it brilliantly, and waits for support.",
      byPosition: {
        ST: "{minute}' — {playerName} pins the defender with their body, takes the ball on the half-turn, and lays it off first time. Intelligent forward play.",
      },
    },
    {
      generic: "{minute}' — Strong first touch from {playerName} kills the long ball instantly and holds position under a heavy challenge.",
      scoutingRelevant: "{minute}' — The first touch and physical presence of {playerName} under pressure is exactly what you want in a link player. Quality hold-up work.",
    },
  ],

  // =========================================================================
  // INJURY
  // =========================================================================
  injury: [
    {
      generic: "{minute}' — {playerName} goes down clutching the back of the thigh. The physio is on immediately.",
    },
    {
      generic: "{minute}' — {playerName} pulls up sharply during a sprint and signals to the bench. This doesn't look good.",
    },
    {
      generic: "{minute}' — A sickening collision leaves {playerName} in a heap. The medical team rush on with the stretcher.",
    },
    {
      generic: "{minute}' — {playerName} lands awkwardly and immediately grabs the knee. Play is stopped.",
    },
  ],

  // =========================================================================
  // SUBSTITUTION
  // =========================================================================
  substitution: [
    {
      generic: "{minute}' — The board goes up. {playerName} is replaced and limps off to sympathetic applause.",
    },
    {
      generic: "{minute}' — Forced change. {playerName} cannot continue and is helped down the tunnel.",
    },
    {
      generic: "{minute}' — {playerName} walks off slowly, clearly frustrated to be leaving the pitch early.",
    },
  ],
  card: [
    {
      generic: "{minute}' — The referee shows a card to {playerName}.",
    },
    {
      generic: "{minute}' — {playerName} is cautioned by the referee.",
    },
  ],
};
