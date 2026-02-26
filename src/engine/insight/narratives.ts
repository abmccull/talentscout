/**
 * Insight Narratives
 *
 * Rich, specialization-flavored narrative text for insight action payoffs.
 * Each specialization experiences insights differently:
 *
 * - Youth: Warm, instinctive, paternal. "I've seen this before, thirty years ago..."
 * - First-Team: Analytical, professional, decisive. "The data confirms what the eye suspected..."
 * - Regional: Relationship-driven, local wisdom. "My contacts have been telling me for months..."
 * - Data: Algorithmic, pattern-recognition. "The model converges. The noise clears..."
 */

import type { Specialization } from "@/engine/core/types";
import type { InsightActionId } from "@/engine/insight/types";
import type { RNG } from "@/engine/rng";

// =============================================================================
// NARRATIVE RECORD TYPE
// =============================================================================

interface ActionNarratives {
  youth: string[];
  firstTeam: string[];
  regional: string[];
  data: string[];
  fizzled: string[];
}

// =============================================================================
// HELPER
// =============================================================================

/**
 * Simple {playerName} substitution in a narrative template.
 */
export function formatNarrative(template: string, playerName: string): string {
  return template.replace(/\{playerName\}/g, playerName);
}

// =============================================================================
// NARRATIVE CATALOGUE
// =============================================================================

export const INSIGHT_NARRATIVES: Record<InsightActionId, ActionNarratives> = {
  // ---------------------------------------------------------------------------
  // clarityOfVision — perfect attribute reads, bypassing perception noise
  // ---------------------------------------------------------------------------
  clarityOfVision: {
    youth: [
      "The noise fades. For a crystalline moment, you see {playerName} as they truly are — not the potential, not the projection, but the raw material. Every touch, every decision, reads like an open book.",
      "Thirty years of watching young players and you know when the eye stops lying. Right now, watching {playerName}, the picture is perfectly clear. No wishful thinking. Just truth.",
      "It happens rarely, this kind of clarity. You stop taking notes and you just watch {playerName}. Everything you need to know is written in every movement, every choice, every reaction.",
      "You've been in this job long enough to know the difference between what you hope and what you see. Right now, watching {playerName}, there is only what you see — and it is unambiguous.",
    ],
    firstTeam: [
      "Years of analysis compress into a single frame. {playerName}'s capabilities snap into focus with clinical precision. You know exactly what this player can and cannot do.",
      "The professional eye cuts through the context — the stadium noise, the scoreline, the nerves — and locks onto {playerName} with the focus of a laser. You see the player, not the performance.",
      "Every session in front of footage, every debate in the analytics room, has built toward this moment. Watching {playerName} now, you understand them completely. The assessment is certain.",
      "In this job you rarely get certainty. You work in probabilities, in tendencies, in patterns. But right now, observing {playerName}, you have it. The picture is exact.",
    ],
    regional: [
      "A decade of watching players in this region has trained your eye. Looking at {playerName}, the picture resolves — you see them against the backdrop of every talent you've ever assessed here.",
      "You've watched hundreds of players come through this area. Most blur together over time. But {playerName} stands out in full relief — every quality and limitation visible, no ambiguity left.",
      "Your contacts first mentioned {playerName} months ago. Now you are seeing exactly what they saw, and more. The regional context makes everything sharper. You know this player completely.",
      "Years spent in this territory have given you a reference point that no outsider could replicate. You place {playerName} against that reference now, and the assessment comes instantly.",
    ],
    data: [
      "The algorithm achieves convergence. Every data point on {playerName} aligns, the noise floor drops to zero, and the true signal emerges.",
      "Signal-to-noise ratio: perfect. You've processed hundreds of hours on {playerName} and in this moment every metric resolves. The model is not estimating. It is reading.",
      "A rare thing happens: the statistical picture and the visual picture collapse into one. {playerName}'s outputs and underlying attributes tell an identical story. You have the full truth.",
      "The data pipeline runs clean. Outliers collapse toward the mean, sample size anxiety disappears, and the picture of {playerName} sharpens to pixel-perfect resolution.",
    ],
    fizzled: [
      "The clarity comes in flashes, intermittent, frustrating. You see parts of {playerName} clearly, but the full picture keeps slipping away.",
      "You can feel the insight trying to crystallise, but fatigue keeps fracturing it. {playerName} comes into focus and then softens again. You catch impressions, not certainties.",
      "Something almost clicks. Watching {playerName}, you get moments — sharp, true — but they won't hold. The picture clears and blurs before you can read it properly.",
    ],
  },

  // ---------------------------------------------------------------------------
  // hiddenNature — reveals injury proneness, consistency, temperament, professionalism
  // ---------------------------------------------------------------------------
  hiddenNature: {
    youth: [
      "The tactical picture fades and something else takes over — not what {playerName} can do, but who they are. How they react when it goes wrong. Whether the warmth in their eyes is resolve or performance.",
      "You stop watching the ball and watch {playerName} instead. The patterns are subtle: how they receive a team-talk, how they respond to a bad touch. The character is there to read, if you know what to look for.",
      "Thirty years of working with young players has taught you that ability is only half the conversation. The other half is right there in front of you, written in how {playerName} carries themselves when no one important is watching.",
      "The footballer is a mask. Underneath it is the person, and the person determines everything in the long run. Watching {playerName} today, the mask slips — and what you see underneath tells you everything.",
    ],
    firstTeam: [
      "Character under pressure is the hardest thing to assess and the most important. You run the mental simulation: the big match, the poor run of form, the critical injury. {playerName}'s responses write themselves clearly.",
      "The stats don't capture this. No model accounts for it. But watching {playerName} when the pressure is high and the margin for error is zero — the hidden variables surface. You see them.",
      "In professional football the unseen qualities decide careers: professionalism in training, consistency across a gruelling fixture list, temperament on the biggest stage. {playerName}'s record on all three is now readable.",
      "You've worked with coaches who say character is everything. You've worked with those who say it's overrated. Watching {playerName}, you resolve the debate for yourself — and the answer matters.",
    ],
    regional: [
      "You've known people who knew {playerName} long before this moment. Their conversations, shared over years, have primed you to look in the right places. The hidden qualities were never hidden to the people closest to the game here.",
      "This region talks. Your network sees things before outsiders arrive. By the time you're watching {playerName} today, you already know what to look for — and when it surfaces, you recognise it immediately.",
      "Local reputation is rarely wrong on character. The people who've watched {playerName} week in and week out in this league have formed an opinion, and your eye now confirms or challenges it. Today, it confirms.",
      "The contacts were right. They told you what kind of person {playerName} is before you ever travelled here. Today you see it yourself — the consistency, the professionalism, the real face beneath the football.",
    ],
    data: [
      "The hidden attributes are inaccessible to conventional metrics — but the proxies exist. Availability percentages over three seasons. Performance variance at key junctures. Minutes per injury event. {playerName}'s underlying nature is in the numbers.",
      "You've built a model for this: which surface statistics correlate with the attributes teams can't directly observe. Running {playerName}'s record through it now, the output is unusually clear.",
      "Four attributes. Four proxy metric clusters. The model isolates each one and reports back on {playerName}. The confidence intervals are tighter than usual. The picture is reliable.",
      "Consistency, temperament, professionalism, injury risk — the attributes no one lists in a transfer brochure but everyone values at the highest level. The data on {playerName} speaks to all four, if you know where to look.",
    ],
    fizzled: [
      "You get glimpses — a reaction here, a moment under pressure there — but fatigue keeps you from assembling them into a complete picture of {playerName}.",
      "The hidden nature flickers into view and retreats again. You sense things about {playerName} that you can't fully articulate. Impressions where you needed certainties.",
      "Something is revealing itself in the way {playerName} carries the session, but your concentration keeps slipping. The read is partial. Enough to sense, not enough to know.",
    ],
  },

  // ---------------------------------------------------------------------------
  // theVerdict — masterwork report, +30 quality
  // ---------------------------------------------------------------------------
  theVerdict: {
    youth: [
      "The words come the way they haven't in years — not notes, not bullet points, but a story. You write about {playerName} and the report writes itself. This is the kind of assessment that changes a career.",
      "You've written thousands of reports. Most are competent. A few are good. Once in a while you write something that you'd be proud to read back ten years later. This is one of those.",
      "Watching {playerName}, you realise you aren't building a case — you're telling a truth. The report that emerges is the most honest piece of work you've produced in years.",
      "The instinct and the evidence align. Every observation reinforces the last. By the time you sit down to write about {playerName}, the verdict has already formed itself, and the words are its faithful record.",
    ],
    firstTeam: [
      "The analysis crystallises. All the individual threads — technical profile, physical metrics, tactical intelligence — braid together into a single coherent narrative on {playerName}. The report is the best work you've produced.",
      "A complete report is rarer than it sounds. Usually there are gaps, caveats, things you couldn't observe. On {playerName}, today, there are none. The verdict is whole.",
      "You don't produce work like this every session. When it happens you know it — the certainty in every line, the absence of hedging, the clarity of the recommendation. {playerName}'s report is exactly that.",
      "Your standards are high enough that most reports disappoint you slightly. Not this one. Everything you observed about {playerName} maps cleanly to a conclusion that is both confident and correct.",
    ],
    regional: [
      "You've been building toward this report for months. Every conversation with contacts, every drive to training grounds in this region, every favour called in — it all lands in the assessment of {playerName}. And it is thorough.",
      "The local context transforms the report. You can place {playerName} against a backdrop of the players who have come from this region, this club, this environment — and the comparison makes the verdict unmistakable.",
      "Your network exists precisely for moments like this. You write about {playerName} with the confidence of someone who knows not just the player, but the soil that produced them. It shows in every line.",
      "Years spent building trust in this territory give the report its authority. Anyone can watch {playerName} for ninety minutes. You can write about who they are and where they will be — and the sources to back every word.",
    ],
    data: [
      "The model produces output that is unusually clean. Every metric on {playerName} aligns with the written analysis, and the written analysis aligns with the visual observation. The report is self-consistent in a way that happens rarely.",
      "A masterwork report doesn't mean a flawless player. It means a complete picture. The data on {playerName} gives you that — and the report captures every dimension of it without a gap.",
      "The quantitative verdict on {playerName} is precise enough to stand alone. But you write around it anyway, because the strongest reports are the ones where the numbers and the narrative speak in the same voice.",
      "You run a final check against the model before writing. The output on {playerName} is within the narrowest confidence intervals you've seen this season. The report reflects that certainty on every page.",
    ],
    fizzled: [
      "The report comes out well but not brilliantly. The words are good, the observations sound — but the extraordinary clarity you were reaching for with {playerName} didn't quite arrive.",
      "You produce solid work on {playerName}. Useful work. But the masterwork you felt within reach stays just out of grasp. The fatigue cost you the final edge.",
      "The report is better than most. You write honestly about {playerName} and the picture that emerges is true. But the spark that would have made it exceptional — that one crystallising insight — didn't come.",
    ],
  },

  // ---------------------------------------------------------------------------
  // secondLook — retroactive full detail on an unfocused player
  // ---------------------------------------------------------------------------
  secondLook: {
    youth: [
      "You realise you've been watching the wrong player. The one on the periphery — {playerName} — has been doing something quietly extraordinary all session. You replay the afternoon in your head with fresh eyes.",
      "Experienced scouts know that the star of the session is rarely the most important discovery. {playerName} has been right there the whole time. You turn your full attention back, and the picture floods in.",
      "It's a feeling you've had before — the nagging certainty that you missed something. {playerName}. You reconstruct the session from memory, from notes, from instinct, and it holds together. More than holds.",
      "You trust the feeling. Something about {playerName}, half-glimpsed in the background of a session focused elsewhere, pulls you back. What you find when you look properly is worth the second journey.",
    ],
    firstTeam: [
      "The professional habit is thorough observation. You missed something on {playerName} — or underweighted it — and the professional habit now demands you go back. What you find changes the assessment.",
      "An analyst never ignores the nagging detail. {playerName} was in your peripheral field all session. You now reconstruct their contribution with full analytical attention, and the picture is more interesting than you expected.",
      "The footage doesn't reset. But the mind can. You return to {playerName} with a clarity you didn't have the first time, and the second pass of the session yields something the first pass missed entirely.",
      "Your notes on {playerName} were cursory. You knew it at the time. The instinct that said 'go back' was correct — the full read surfaces qualities that cursory attention would have buried in the summary.",
    ],
    regional: [
      "A contact mentioned {playerName} in passing weeks ago. You'd noted the name and moved on. Now, reconstructing today's session, you understand why the name kept surfacing. You missed the best thing in the room.",
      "Your ear for this region told you something was happening at the edges of the session. {playerName}. Going back with full attention, you see what your subconscious flagged and your conscious mind filed away.",
      "Local knowledge gives the second look its context. {playerName} has a history in this area that makes the retroactive observation richer. You're not just reviewing a player — you're reading a story you already know the opening chapters of.",
      "The network often sees things the visiting eye misses in the first pass. {playerName} is a case in point. The second look confirms what you suspected was there from the moment you arrived.",
    ],
    data: [
      "The session data flagged an anomaly. One player — {playerName} — generated metrics outside the expected range for their current billing. You run the full retrospective analysis.",
      "Statistical review of the session surfaces {playerName} in a cluster that deserved closer attention. The second-pass data tells a story the live feed didn't emphasise.",
      "You build the retrospective model on {playerName} with the session's complete dataset. What the live observation treated as background noise resolves into signal when you have the full numbers.",
      "A post-session audit is standard practice. The audit flags {playerName} for review. Running the full suite of metrics retroactively, the picture that emerges justifies the flag completely.",
    ],
    fizzled: [
      "You go back to {playerName} with the intention of a full retroactive read, but fatigue splinters the memory. You recover impressions, not a complete observation.",
      "The second look happens, but the clarity you hoped for stays partial. {playerName} comes back into focus in pieces — enough to revise the initial read, not enough to complete it.",
      "You trust the instinct that sent you back to {playerName}. The instinct was right — there was something there. But the exhaustion means you catch only a fraction of it.",
    ],
  },

  // ---------------------------------------------------------------------------
  // diamondInTheRough — highest-PA undiscovered prospect at the venue
  // ---------------------------------------------------------------------------
  diamondInTheRough: {
    youth: [
      "Your heart rate quickens. In thirty years of standing on muddy touchlines, you've learned to trust this feeling. One of these players is different. Special. You know it in your bones.",
      "The instinct doesn't announce itself. It settles over you gradually — a change in the quality of attention you're paying to one corner of the pitch. Someone here isn't supposed to be here. Someone is better than this.",
      "You've watched the obvious candidates long enough. The one who matters isn't obvious. You let your eye drift to where no one else is looking, and there it is. The diamond. Unpolished, unnoticed, unmistakable.",
      "The football doesn't lie, if you know how to listen. Somewhere in this session the football has been telling you a name. You've been too focused on the surface to hear it. Now you listen. You hear it.",
    ],
    firstTeam: [
      "Professional instinct, honed by a thousand matches, points you toward one player. The others are good. This one could be more.",
      "The analysis runs on everyone simultaneously. Most players fall where you expect. One doesn't. The metrics, the eye, the accumulated professional judgement — they all converge on the same face.",
      "You've spent a career distinguishing between players who look the part and players who are the part. Here, now, one player is the part. The rest are backdrop.",
      "The professional framework cuts through performance anxiety, opponent quality, and the noise of the session. What it finds is one player standing apart — not in obvious ways, but in the ways that matter.",
    ],
    regional: [
      "Years of knowing this region tell you that one player here doesn't belong at this level. They're too good. Your network was right.",
      "Your contacts don't bring you here for nothing. You scan the session with the patience of someone who has done this journey a hundred times and found exactly nothing — and once in a while, exactly everything.",
      "The territory reveals its secrets slowly. You have the patience for it. And somewhere in the rhythm of today's session, a player begins to separate themselves from the landscape. You've seen this before. Not often.",
      "Years of regional intelligence — conversations, whispers, names passed in the corridors of grounds no outside scout ever visits — crystallise into a single player in front of you today. There they are.",
    ],
    data: [
      "A statistical anomaly jumps off the screen. One player's underlying metrics are dramatically out of line with their current level — a clear market inefficiency.",
      "The model runs a distribution sweep across every player observed in the session. One outlier sits three standard deviations from the mean on the metrics that predict trajectory. The system flags it immediately.",
      "Market inefficiency is the search objective. The market has mispriced one player at this venue by a margin that the algorithm cannot explain with conventional variables. This is the find.",
      "The data doesn't hide talent — it hides the talent of players the market hasn't looked at with the right tools. Today the right tools are running, and one player lights up the system.",
    ],
    fizzled: [
      "You feel the tug of instinct, but it's unclear. Someone here is special, but the picture is fuzzy, like trying to read through frosted glass.",
      "There's a pull toward one player in the session — you sense the diamond rather than see it. The fatigue won't let you sharpen the feeling into certainty.",
      "The instinct fires, but fires weak. Someone here deserves closer attention. You can't isolate who with the confidence you need. The feeling is real; the read is incomplete.",
    ],
  },

  // ---------------------------------------------------------------------------
  // generationalWhisper — enhanced gut feeling, wonderkid-tier specificity
  // ---------------------------------------------------------------------------
  generationalWhisper: {
    youth: [
      "Time stops. You've felt this exactly twice before in your career. Once was a player who went on to win the Ballon d'Or. {playerName} carries that same quiet electricity.",
      "The football brain — the part that has watched ten thousand hours of youth players — fires in a way it hasn't for years. Not excitement. Certainty. {playerName} is going to be something that doesn't come along in a generation.",
      "You don't tell people about moments like this. They sound like the ramblings of someone who has spent too long on the touchline. But they happen, and when they do, you write the name down very carefully. {playerName}.",
      "Your wife will tell you tonight that you came home quiet. She always knows. The ones that shake you most, the ones that make you question whether the job has robbed you of objectivity — they're the ones that are real. {playerName} is real.",
    ],
    firstTeam: [
      "In the analytical part of your mind, you know this feeling is irrational. But in thirty years, it has never been wrong. {playerName} is the real thing.",
      "You've fought to keep the professional and the emotional separate for your entire career. Today they agree. The model says {playerName} is exceptional. The gut says the model is underselling it.",
      "The assessment comes in two parts: the measured, evidence-based evaluation that will satisfy any chief scout in Europe — and the private conviction, unfiltered and certain, that {playerName} is better than the evidence yet proves.",
      "A career in professional analysis trains you to distrust whispers. But the whisper about {playerName} comes from the same place the evidence does — from three decades of watching the best players in the world. It is not a whisper. It is a verdict.",
    ],
    regional: [
      "Every contact in your network, every conversation in every café and bar in this region, has been pointing to this moment. {playerName} is what you've been searching for.",
      "The network doesn't lie, but it exaggerates. You've learned to discount forty per cent of everything you hear. Watching {playerName} today, you give the network its forty per cent back. They were understating it.",
      "This region has produced talent before. Quietly, without fanfare, without the academies and the spotlights. It knows what it has in {playerName}. It just doesn't know the rest of the world is about to find out.",
      "The whisper has been building for months. You followed it because your instincts said to. You arrived sceptical, which is the only honest way to arrive. You are leaving with something close to awe.",
    ],
    data: [
      "The model breaks. {playerName}'s metrics shouldn't be possible at this age, at this level. This isn't an anomaly — it's a generational outlier.",
      "Every model has an edge beyond which it stops being predictive and starts being descriptive. {playerName} sits past that edge. The numbers exist. They simply don't make sense in the context of any player you've ever profiled.",
      "Thirteen years of building and refining the system. Thousands of players processed. You have a feel for what the model considers normal, what it considers promising, and what it considers exceptional. {playerName} is a fourth category.",
      "The output sits in a percentile that has populated three times in the dataset. All three of those players became generational talents. You read the report on {playerName} twice, very slowly, before you are prepared to believe it.",
    ],
    fizzled: [
      "The whisper is there but faint, like hearing a melody through a wall. {playerName} might be something special, but you can't quite be certain.",
      "Something is trying to tell you something about {playerName}. The feeling is real. But it won't resolve into the clarity you need to act on it with confidence. Tantalising and incomplete.",
      "You sense what might be a generational talent, but fatigue keeps you from reaching it. The signal is strong. The receiver is failing. {playerName} deserves better observation than this.",
    ],
  },

  // ---------------------------------------------------------------------------
  // perfectFit — system fit analysis against club tactical requirements
  // ---------------------------------------------------------------------------
  perfectFit: {
    youth: [
      "You've watched enough players at the top level to picture the system they'd thrive in. Watching {playerName}, a specific picture forms — not just of a good player, but of a player who would be exceptional within the right structure.",
      "The tactical instinct fires in a particular direction: {playerName} isn't just talented, they're designed for a specific style of play. You know that style. You know that club. The fit is exact.",
      "There is talent and then there is talent in context. Watching {playerName}, the context is everything — you see them in a system that would amplify everything they do well and protect everything they don't.",
      "The great youth scouts know that finding talent is only part of the job. Finding the right home for the talent is the other part. Watching {playerName}, the right home presents itself with unusual clarity.",
    ],
    firstTeam: [
      "The tactical analysis runs its full cycle. {playerName}'s profile, mapped against your club's current requirements and the manager's preferred system, produces a fit score that clears every threshold.",
      "You know this system from the inside. You know what it demands in each position, what movement patterns it requires, what pressing triggers it relies on. {playerName} could have been designed to play within it.",
      "Every recruitment decision is ultimately a fit decision. Talent is necessary but not sufficient — the player needs to fit the manager, the system, the squad, the culture. On all four dimensions, {playerName} maps cleanly.",
      "The gap in the squad has been a topic of conversation for months. You've been looking for the right profile to fill it. Standing here watching {playerName}, the conversation ends. The profile is found.",
    ],
    regional: [
      "You've placed players from this region before. You know how they translate to the next level, what adjustments they tend to make, what tends to catch them out. {playerName} doesn't have the usual adjustment problems — the fit was always going to be natural.",
      "Regional context shapes technical profile in ways that aren't obvious until you've watched it happen repeatedly. Players from this area tend to bring specific qualities. In {playerName}, those qualities align exactly with what your club needs.",
      "The contacts helped you understand what {playerName} brings before today. Now you see it for yourself, and you can place it against your club's requirements with the precision that only first-hand observation allows.",
      "Years in this territory have produced a mental library of the players who made it and why. {playerName} fits the template of those who thrived — and they fit the system you're recruiting for. The alignment is not accidental.",
    ],
    data: [
      "The system fit model runs its full analysis. Input: {playerName}'s attribute vector. Reference: the club's tactical profile and positional requirement matrix. Output: grades across twelve system dimensions, ten of which are green.",
      "Tactical modelling is the difference between a heuristic and a recommendation. The model processes {playerName} against the club's schematic requirements and returns a fit percentage that makes the recommendation straightforward.",
      "The data answers the right question: not 'is {playerName} good?' but 'is {playerName} good for us?' The distinction matters. The answer, in this case, is the same either way.",
      "Position-by-position modelling against the club's tactical profile. {playerName}'s movement tendencies, pressing output, and off-ball run patterns all map within the tolerance ranges the manager demands. The system accepts this player.",
    ],
    fizzled: [
      "The fit analysis runs but the results are blurred. You get enough to form a tentative view of how {playerName} maps to the system, but not enough to be certain.",
      "Something about {playerName} suggests a strong system fit, but fatigue keeps you from completing the picture. You see the outline of the analysis, not the full read.",
      "The tactical picture of {playerName} in the system forms and then fractures. You're left with a strong impression rather than a complete assessment.",
    ],
  },

  // ---------------------------------------------------------------------------
  // pressureTest — reveals true big-game temperament value
  // ---------------------------------------------------------------------------
  pressureTest: {
    youth: [
      "You run the mental simulation — the cup final, the penalties, the hostile ground. How does {playerName} look in that version of the game? The answer writes itself, and it's unambiguous.",
      "Character in youth players is a hypothesis. You spend careers testing hypotheses and most of them resolve slowly, over years. Occasionally you know the answer now. Watching {playerName}, you know the answer now.",
      "The pressure test is simple: take everything comfortable and remove it. Wrong end of the scoreline, hostile crowd, clock running down. Does {playerName} grow or does {playerName} shrink? The image that forms is clear.",
      "You've watched enough young players to separate the ones who perform for you from the ones who'll perform in September, in December, in a playoff, when it matters. {playerName} is the second kind. You feel it with certainty.",
    ],
    firstTeam: [
      "Mentally simulate a high-pressure scenario to reveal the player's true big-game temperament value. The simulation runs on {playerName}. The result is definitive.",
      "Every signing carries a temperament risk. The question is never 'can they play?' but 'can they play when it matters most?' Your professional read on {playerName}, under the mental pressure test, gives a clear answer.",
      "The biggest matches expose the truth that training ground sessions hide. You project {playerName} into those moments — the deep knockout rounds, the relegation six-pointers — and what you see there settles the question.",
      "Thirty years of watching players succeed and fail in the biggest moments has given you a template. The ones who thrive have something in their eyes that the ones who wilt do not. Watching {playerName} today, you find it — or its absence.",
    ],
    regional: [
      "This region tests players in ways the top leagues don't. Physical, hostile, low-budget, high-stakes for everyone involved. {playerName} has been pressure-tested here for years. You've just been given access to the test results.",
      "The local game is unforgiving. Contacts tell you which players handle the adversity and which ones look for excuses. {playerName}'s reputation in this region on that front has been consistent for years. Today you see it yourself.",
      "Pressure exists here differently than in the academies and the top flights. It is personal, relentless, community-scale. {playerName} has grown up in it. When you apply the pressure test, you're asking a question they've already answered.",
      "The regional filter is one of the best temperament tests available. Players who survive and thrive here have been forged in a way the comfortable academy environments don't allow. {playerName} has been forged. The result is visible.",
    ],
    data: [
      "Big-game performance is statistically measurable. Output variance in high-stakes fixtures, recovery time after adverse events, performance relative to expected value in pressure situations. {playerName}'s record on all three surfaces in the data.",
      "The pressure coefficient model runs on {playerName}'s historical match data. High-stakes fixtures isolated, performance metrics extracted, comparison against baseline run. The temperament picture is data-backed and clear.",
      "Consistency at high-leverage moments separates professionals from elite professionals. The data on {playerName}'s performance curve in must-win games is available. You run it. The trend is unambiguous.",
      "Temperament isn't unquantifiable — it leaves statistical traces. {playerName}'s output in high-pressure samples compared to low-pressure baselines gives a performance coefficient that answers the character question directly.",
    ],
    fizzled: [
      "The pressure simulation runs but stays hypothetical. You get impressions of how {playerName} might handle the big moment, but the fatigue keeps the read from resolving into certainty.",
      "Something about {playerName} suggests a temperament picture, but the pressure test keeps fracturing before you can read the result. You leave with a strong suspicion, not a confirmed answer.",
      "The mental scenario plays out incompletely. {playerName} in the pressure situation — you can see the beginning of the answer but the image degrades before you reach the conclusion.",
    ],
  },

  // ---------------------------------------------------------------------------
  // networkPulse — all contacts share intel simultaneously
  // ---------------------------------------------------------------------------
  networkPulse: {
    youth: [
      "Every contact you've built in this region over thirty years responds at once. Coaches, local journalists, former players turned coaches in Sunday leagues. The intelligence on {playerName} flows from every direction, and it paints a picture that a single conversation never could.",
      "The network isn't built overnight. It's built in car parks and canteen queues and post-match bars over decades. Right now it delivers everything at once — a full portrait of {playerName} assembled from a dozen different vantage points.",
      "Your contacts don't share the same perspective. They're not supposed to. A goalkeeper coach sees different things from a fitness trainer, who sees different things from a local agent. Right now they're all talking, and {playerName} is the subject.",
      "You didn't build the network to use it like this. You built it to do your job every day, conversation by conversation. But occasionally the accumulated trust unlocks something extraordinary — a simultaneous view from every angle on {playerName}.",
    ],
    firstTeam: [
      "Professional networks exist for exactly this. Every contact at every level — agent, journalist, technical director, opposition analyst — contributes their read on {playerName}. The composite intelligence is far more complete than any single source.",
      "The information arrives from unexpected places. A fitness coach who knows {playerName}'s training habits. An opponent who has faced them in decisive moments. A former teammate. Each perspective adds a dimension that the official record doesn't contain.",
      "A scout's network is their competitive advantage. In this moment, that advantage activates fully — every relationship, every favour held in reserve, every trust built carefully over years — all delivering on {playerName} simultaneously.",
      "Intelligence is not the same as data. Data is measurable and public. Intelligence is qualitative, private, and hard-won. What arrives through the network on {playerName} falls into the second category, and it changes the assessment significantly.",
    ],
    regional: [
      "My contacts have been telling me about {playerName} for months. Today they're all telling me at once, and the story they're assembling together is more complete than any one of them could tell alone.",
      "The regional network is the deepest thing you have. You've invested years in it — learning names, learning families, learning the politics of small clubs and local rivalries. Right now it returns on that investment in full.",
      "The information on {playerName} has been there all along, distributed across a dozen people who each knew a part of it. The pulse brings it all together. The picture that emerges is far more complete than the official record suggests.",
      "Trust takes years to build. When it activates, it does so without conditions. Every contact in this territory opens up about {playerName} simultaneously — not because they planned it, but because you've earned that kind of access.",
    ],
    data: [
      "Human intelligence and statistical analysis are the two pillars of the complete picture. The network pulse provides the human intelligence — subjective, qualitative, irreplaceable — on {playerName}, to complement the model.",
      "The qualitative data on {playerName} arrives through channels the statistical model can't access. Training ground behaviour, contract negotiation posture, relationship dynamics with management. The network fills the model's gaps.",
      "Data scouts often undervalue human intelligence. The network pulse is a corrective. What contacts know about {playerName} — the unrecorded patterns, the private assessments, the off-record conversations — is data by another name.",
      "The model provides the skeleton. The network provides the flesh. Right now, both are active on {playerName}, and the full picture is more detailed than either source could produce independently.",
    ],
    fizzled: [
      "The contacts respond, but sporadically. Some of the network stays quiet. What arrives on {playerName} is useful but fragmentary — less a full picture than a collection of independently valuable pieces.",
      "The pulse fires but doesn't quite synchronise. You get intelligence on {playerName} from several sources, but the fatigue means you can't process all of it cleanly. Useful, not comprehensive.",
      "Most of the network activates. A few key voices stay silent. The intelligence on {playerName} that arrives is solid — just not the complete sweep you were hoping for.",
    ],
  },

  // ---------------------------------------------------------------------------
  // territoryMastery — permanent +10% confidence in current sub-region
  // ---------------------------------------------------------------------------
  territoryMastery: {
    youth: [
      "You know this territory now. Not just the clubs and the players, but the rhythms — which coaches develop technical players, which environments produce physical ones, what the local game demands of its young people. This knowledge is permanent.",
      "The years spent here consolidate into something that can't be unlearned. You understand what this region produces and why. The confidence that comes with genuine mastery settles over you — steady, useful, irreplaceable.",
      "Mastery in scouting is regional. You can be good everywhere, but you're exceptional somewhere. Today, this somewhere declares itself. You've earned the kind of understanding here that no outside scout can replicate.",
      "Thirty years teaches you that knowledge accumulates unevenly. Some territories you pass through. Others you absorb. This one has absorbed you, and the understanding runs in both directions now.",
    ],
    firstTeam: [
      "Professional mastery in this sub-region is now confirmed. You know the talent pipeline, the typical development trajectory, the pricing dynamics, the agents, and the clubs with the best infrastructure. This is operational knowledge.",
      "The intelligence accumulated across every visit, every contact, every game watched in this territory locks into a complete operational picture. Future assessments here will carry a confidence no first-time visitor can match.",
      "Territory mastery is a competitive advantage that compounds. The foundation is built. Every future player you assess from this region will benefit from the depth of context you now carry.",
      "There is a version of the scout who watches players in isolation, and there is a version who understands the environment that produced them. In this territory, you are now firmly the second version.",
    ],
    regional: [
      "This is your territory. Not because you claimed it, but because you invested in it — year after year, contact after contact, game after game — until the region began to give you things it gives no one else.",
      "The mastery feels different from expertise. Expertise is something you earn in a room. Mastery is something the territory grants you, and only after it decides you've earned it. Today you feel it settle.",
      "You belong here in a way that visiting scouts never will. The clubs know you. The coaches talk to you honestly. The local press treats you as a fixture. That belonging is now a professional asset encoded permanently in how you work.",
      "Regional scouting is a long game. You've played it the right way — patiently, respectfully, consistently. The territory is returning the investment today in the form of a certainty that will serve every future assignment here.",
    ],
    data: [
      "The regional dataset has reached critical mass. Enough historical observations, enough validated predictions, enough comparative reference points. The model's performance in this sub-region now operates at a reliability level that justifies elevated confidence.",
      "Data mastery in a territory comes from sample size and model validation. Both thresholds have been crossed for this sub-region. Future queries here benefit from a trained and verified model, not a generic one.",
      "The system has learned this region. Every player assessed, every prediction validated or falsified, has trained the local model variant. It is now meaningfully better here than in regions with thinner datasets.",
      "Regional model performance varies inversely with data poverty. This sub-region is no longer data-poor. The model has been calibrated on local conditions and the accuracy improvement is measurable and permanent.",
    ],
    fizzled: [
      "The territory understanding is building, but the moment of full consolidation keeps escaping you. The mastery is approaching; it hasn't quite arrived.",
      "Something almost locks into place. The regional picture is rich and detailed, but the final depth of mastery — the permanent confidence that comes from genuine understanding — isn't fully there yet.",
      "You sense the territory giving up its secrets, but fatigue keeps you from receiving all of them. The foundation is stronger. The full mastery waits for a clearer day.",
    ],
  },

  // ---------------------------------------------------------------------------
  // algorithmicEpiphany — statistical model at perfect accuracy for one query
  // ---------------------------------------------------------------------------
  algorithmicEpiphany: {
    youth: [
      "The numbers and the eye agree completely — which almost never happens. The model is running clean and the output on the youth cohort here is precise. For once, the data isn't lagging behind the instinct.",
      "Youth analytics is a discipline defined by uncertainty. Long development timelines, small sample sizes, confounding environmental factors. Today, in this brief window, the uncertainty collapses. The system runs at perfect resolution.",
      "You've spent years reconciling the model's outputs with what the eye tells you. Today there is nothing to reconcile. The algorithm sees exactly what you see, with no distortion. The output is trustworthy in a way that is genuinely rare.",
      "Perfect accuracy for one query. You choose the question carefully, because the window won't last. The model processes and returns the cleanest output it has produced all season.",
    ],
    firstTeam: [
      "Statistical model runs at perfect accuracy for one query cycle. The conditions are right — sample size, data quality, low noise — and the model knows it. The output is reliable in a way that justifies full confidence.",
      "The model doesn't always run clean. Data quality varies, sample sizes are sometimes thin, and the output reflects that uncertainty in the confidence intervals. Right now, none of those problems exist. The model runs at its ceiling.",
      "An epiphany in statistical analysis is not inspiration — it is the moment when all the variables align and the system can finally speak without hedging. That moment is now. The query runs, and the answer it returns is correct.",
      "You've run this model thousands of times. You know the feel of a clean run versus a noisy one. This is the cleanest run you've seen. The output on the query you've chosen is the most reliable analysis you'll produce this season.",
    ],
    regional: [
      "The regional dataset is at its deepest point of the season. Recent observations, fresh contact intelligence, validated historical predictions — the model has everything it needs to run without compromise.",
      "You've been building the regional data architecture for years. In isolated moments, it produces output of unusual clarity. This is one of those moments. The algorithm sees the territory at full resolution.",
      "Every observation in this region has contributed to the model. Today the cumulative weight of that investment produces an output that the model itself flags as high-confidence. The algorithm has learned this territory. Right now it shows.",
      "Regional models perform best when they have volume and recency. Both conditions are met. The output runs clean, and the epiphany is not inspiration but the payoff of systematic, patient data collection.",
    ],
    data: [
      "The model converges. The noise clears. For one complete query cycle, the algorithm operates at the theoretical maximum of its predictive capacity. The output is exact.",
      "A statistical epiphany is the moment when every variable resolves cleanly — sample adequacy, feature quality, model fit, recency weighting — and the system returns an output you can trust without reservation. That moment has arrived.",
      "Years of model development have been building toward outputs like this. The current data state — quality, volume, recency — has pushed the system past the threshold where confidence intervals become meaningful constraints. The prediction is precise.",
      "You designed the model to run clean under ideal conditions. You rarely see ideal conditions. Right now, for one query, you have them. The algorithm operates without approximation, and the output reflects that.",
    ],
    fizzled: [
      "The model tries to achieve full resolution but fatigue-induced processing errors keep the output noisy. Better than standard accuracy, but not the precision you were reaching for.",
      "The epiphany triggers but stays partial. The query returns above-average output on the target, but the full clarity the model can achieve in perfect conditions doesn't arrive.",
      "The algorithm improves its accuracy for the query but not to the degree the epiphany was supposed to provide. Useful improvement. Not the complete precision you needed.",
    ],
  },

  // ---------------------------------------------------------------------------
  // marketBlindSpot — reveals undervalued players in a league/position combo
  // ---------------------------------------------------------------------------
  marketBlindSpot: {
    youth: [
      "The market is always behind on young players. By the time the big clubs catch up, the window closes. You're scanning this cohort not for who is best recognised, but for who the market has systematically failed to see.",
      "Every era of football has its blind spots — positions or profile types that the mainstream consensus undervalues until someone proves the consensus wrong. This cohort has one. You can see it clearly.",
      "Youth scouting is value scouting by nature. The question is never 'who is the most famous?' but 'who is underpriced relative to their future?' The answer in this pool is not the obvious name.",
      "The instinct that makes you good at youth work is the instinct that finds value. Right now, scanning this environment, the value sits outside the spotlight — as it almost always does.",
    ],
    firstTeam: [
      "The transfer market is an information market, and information markets have inefficiencies. You've located one. The player the market has priced incorrectly is identifiable, and the reason for the mispricing is legible.",
      "Market blind spots are most common at the intersection of unfashionable leagues and unfashionable positions. The analysis identifies the players the market has systematically undervalued — and the gap between their real value and their market value is significant.",
      "The mainstream scouting consensus has a position or a profile that it consistently underweights. Knowing that, and knowing where to look, is a permanent edge. Right now the edge yields a specific, actionable result.",
      "Efficient markets are a myth in football recruitment. The same biases recur: big-club exposure bias, league prestige weighting, positional fashion cycles. The analysis has found the current blindspot and the players sitting in it.",
    ],
    regional: [
      "The market doesn't watch this region with the right tools. You do. The gap between what the mainstream sees here and what the reality is has produced a crop of significantly undervalued players, and you've been positioned to find them.",
      "Regional networks provide access that financial resources cannot buy. You know this territory from the inside. The market prices it from the outside. The gap between those two perspectives is where the value lives.",
      "Your contacts gave you early intelligence on the players the market is sleeping on. The analysis confirms what the network suspected: the undervaluation is real, significant, and time-limited. The window will close.",
      "A decade of regional work has given you credibility and access that visiting scouts — however well-resourced — cannot replicate. The blind spot the market has created here is visible to you, and only to you, at this depth of resolution.",
    ],
    data: [
      "Market Blind Spot reveals undervalued players in a league and position combination. The model has run the full sweep. The inefficiencies are identified. The players are named.",
      "Market valuation is the output of an information process. When the information process has systematic errors — coverage gaps, positional biases, recency weighting flaws — it produces systematic mispricings. The model has found them.",
      "The undervaluation model compares true player value (derived from performance metrics) against market signals (transfer fees, wage demands, interest levels). The gap between them, in this search, is striking. Several players are significantly mispriced.",
      "Statistical arbitrage in football markets requires two things: a model that produces accurate valuations and an information advantage over the market. You have both right now. The blind spot is located. The players within it are identified.",
    ],
    fizzled: [
      "The market inefficiency analysis runs but returns a noisy result. You identify the general area of the blind spot but can't isolate the specific players within it with the precision needed to act decisively.",
      "Something in the market pricing here is off — you can feel it in the data — but the fatigue keeps the analysis from resolving cleanly. The blind spot exists. You just can't quite see all the way into it.",
      "The model flags a region of potential undervaluation but the output confidence is below the threshold for confident action. The blind spot is real. The specific players within it remain partially obscured.",
    ],
  },
};

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Returns a specialization-flavored narrative for the given insight action.
 *
 * If `fizzled` is true, returns a dampened fizzle narrative instead of the
 * full specialization variant.
 *
 * @param actionId       - Which insight action was performed.
 * @param specialization - The scout's active specialization.
 * @param playerName     - Name to substitute for {playerName}.
 * @param fizzled        - Whether the action fizzled (partial effect).
 * @param rng            - RNG instance for variant selection.
 */
export function getInsightNarrative(
  actionId: InsightActionId,
  specialization: Specialization,
  playerName: string,
  fizzled: boolean,
  rng: RNG,
): string {
  const narratives = INSIGHT_NARRATIVES[actionId];

  if (fizzled) {
    const template = rng.pick(narratives.fizzled);
    return formatNarrative(template, playerName);
  }

  const specializationKey = specialization as keyof Omit<
    ActionNarratives,
    "fizzled"
  >;
  const variants = narratives[specializationKey];
  const template = rng.pick(variants);
  return formatNarrative(template, playerName);
}

/**
 * Returns a fizzled narrative for the given action and player name.
 * Convenience wrapper around getInsightNarrative when fizzled state is known.
 *
 * @param actionId   - Which insight action fizzled.
 * @param playerName - Name to substitute for {playerName}.
 * @param rng        - RNG instance for variant selection.
 */
export function getFizzledNarrative(
  actionId: InsightActionId,
  playerName: string,
  rng: RNG,
): string {
  const narratives = INSIGHT_NARRATIVES[actionId];
  const template = rng.pick(narratives.fizzled);
  return formatNarrative(template, playerName);
}
