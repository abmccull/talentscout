/**
 * Activity Quality System — rolls quality tiers for weekly activities,
 * producing XP multipliers, discovery modifiers, and narrative descriptions.
 *
 * Pure module, no side effects. Uses the seeded RNG for deterministic results.
 */

import type { ActivityType, ScoutSkill, Scout } from "@/engine/core/types";
import type { RNG } from "@/engine/rng";

// =============================================================================
// TYPES
// =============================================================================

export type ActivityQualityTier =
  | "poor"
  | "average"
  | "good"
  | "excellent"
  | "exceptional";

export interface ActivityQualityResult {
  activityType: ActivityType;
  tier: ActivityQualityTier;
  /** XP multiplier: 0.4x to 2.0x */
  multiplier: number;
  /** Descriptive text for inbox/summary */
  narrative: string;
  /** For scouting activities: ±players discovered */
  discoveryModifier: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const TIER_CONFIG: Record<
  ActivityQualityTier,
  { multiplier: number; discoveryModifier: number }
> = {
  poor:        { multiplier: 0.4, discoveryModifier: -1 },
  average:     { multiplier: 0.8, discoveryModifier: 0 },
  good:        { multiplier: 1.0, discoveryModifier: 0 },
  excellent:   { multiplier: 1.4, discoveryModifier: 1 },
  exceptional: { multiplier: 2.0, discoveryModifier: 2 },
};

/** Base weights for quality tier distribution (sum = 100). */
const BASE_WEIGHTS: Record<ActivityQualityTier, number> = {
  poor: 10,
  average: 35,
  good: 30,
  excellent: 20,
  exceptional: 5,
};

/** Which scout skill influences quality for each activity type. */
const PRIMARY_SKILL_MAP: Partial<Record<ActivityType, ScoutSkill>> = {
  attendMatch: "technicalEye",
  watchVideo: "tacticalUnderstanding",
  writeReport: "dataLiteracy",
  networkMeeting: "psychologicalRead",
  trainingVisit: "physicalAssessment",
  academyVisit: "technicalEye",
  youthTournament: "technicalEye",
  study: "dataLiteracy",
  // Youth venue activities
  schoolMatch: "technicalEye",
  grassrootsTournament: "technicalEye",
  streetFootball: "technicalEye",
  academyTrialDay: "technicalEye",
  youthFestival: "technicalEye",
  followUpSession: "technicalEye",
  parentCoachMeeting: "psychologicalRead",
  writePlacementReport: "dataLiteracy",
  // First-team exclusive
  reserveMatch: "playerJudgment",
  scoutingMission: "tacticalUnderstanding",
  oppositionAnalysis: "tacticalUnderstanding",
  agentShowcase: "playerJudgment",
  trialMatch: "playerJudgment",
  contractNegotiation: "psychologicalRead",
  // Free agent activities
  freeAgentOutreach: "playerJudgment",
  // Data-exclusive
  databaseQuery: "dataLiteracy",
  deepVideoAnalysis: "dataLiteracy",
  statsBriefing: "dataLiteracy",
  dataConference: "dataLiteracy",
  algorithmCalibration: "dataLiteracy",
  marketInefficiency: "dataLiteracy",
  analyticsTeamMeeting: "dataLiteracy",
  // Review/management
  reviewNPCReport: "dataLiteracy",
  managerMeeting: "psychologicalRead",
  boardPresentation: "psychologicalRead",
  // Loan activities
  loanMonitoring: "playerJudgment",
  loanRecommendation: "playerJudgment",
};

// =============================================================================
// NARRATIVE TEMPLATES
// =============================================================================

const NARRATIVES: Partial<
  Record<ActivityType, Record<ActivityQualityTier, string[]>>
> = {
  study: {
    poor: [
      "A frustrating study session — you struggled to concentrate and made little progress.",
      "The material felt impenetrable today. You'll need to revisit these concepts.",
    ],
    average: [
      "A routine study session. You covered the basics but nothing clicked in a new way.",
      "Steady progress through your reading material, though nothing stood out.",
    ],
    good: [
      "A productive study session. You connected several concepts and feel sharper for it.",
      "Good session — your notes are well-organized and the methods are starting to feel intuitive.",
    ],
    excellent: [
      "An excellent study session! A complex statistical technique suddenly made sense, opening new analytical possibilities.",
      "Highly productive studying. You identified patterns in the data that most scouts would miss.",
    ],
    exceptional: [
      "A breakthrough study session! You developed a novel analytical framework that connects data patterns you'd never noticed before.",
      "A revelation — you found a way to cross-reference performance metrics that could give you a genuine edge over rival scouts.",
    ],
  },
  attendMatch: {
    poor: [
      "A disappointing match to scout — poor weather and a defensive stalemate gave you little to work with.",
      "Frustrating match. Your target player was substituted early with a knock, limiting observation time.",
    ],
    average: [
      "A decent match for scouting. You gathered some useful observations, though nothing remarkable.",
      "Standard match day. The game flowed predictably and you logged steady observations.",
    ],
    good: [
      "A good match for scouting. Several players caught your eye with interesting moments of quality.",
      "Productive match attendance. The tempo was high and you captured plenty of meaningful data.",
    ],
    excellent: [
      "An excellent match! High intensity and attacking play gave you clear reads on multiple attributes.",
      "Outstanding match for scouting. A player's exceptional performance gave you crystal-clear assessment data.",
    ],
    exceptional: [
      "A match you won't forget! You witnessed a star-making performance — the kind of display that launches careers.",
      "Incredible match! A player displayed a combination of technical skill and composure far beyond his years.",
    ],
  },
  watchVideo: {
    poor: [
      "Poor video session — the footage quality was terrible and camera angles obscured key moments.",
      "A frustrating session. The available footage was mostly wide-angle with few close-ups of individual play.",
    ],
    average: [
      "A routine video session. You reviewed the footage but the material was unremarkable.",
      "Standard video analysis. The clips provided useful context but no surprises.",
    ],
    good: [
      "Good video session. You spotted movement patterns that weren't obvious in real-time.",
      "Productive analysis — slowing down key passages revealed tactical details you'd have missed live.",
    ],
    excellent: [
      "Excellent video session! Frame-by-frame analysis revealed a player's exceptional off-the-ball intelligence.",
      "Highly productive session. Reviewing multiple angles exposed tactical tendencies that could be decisive.",
    ],
    exceptional: [
      "An extraordinary video session! You uncovered a hidden gem — a player whose subtle positioning reveals elite-level game reading.",
      "Breakthrough analysis! By cross-referencing multiple matches, you identified a tactical pattern that no other scout has noticed.",
    ],
  },
  networkMeeting: {
    poor: [
      "An awkward meeting — your contact seemed distracted and shared nothing of value.",
      "Disappointing encounter. The conversation went nowhere and your contact was guarded.",
    ],
    average: [
      "A pleasant enough meeting. Some casual football chat but no major revelations.",
      "Standard networking. Your contact was friendly but had little new information to share.",
    ],
    good: [
      "A good meeting. Your contact shared some useful insider perspectives on player development.",
      "Productive networking session. You strengthened the relationship and picked up a couple of leads.",
    ],
    excellent: [
      "An excellent meeting! Your contact opened up about a player they've been tracking closely — valuable inside information.",
      "Highly productive encounter. Your contact introduced you to another influential figure in the scouting world.",
    ],
    exceptional: [
      "A meeting that could change your career! Your contact revealed an exclusive tip about an under-the-radar talent.",
      "Extraordinary networking session! Your contact shared confidential transfer intel that could give you a major edge.",
    ],
  },
  trainingVisit: {
    poor: [
      "A disappointing training visit — the session was closed to outsiders, limiting your observation time.",
      "Frustrating visit. Rain cut the session short and you barely saw anything useful.",
    ],
    average: [
      "A standard training visit. You observed the drills but nothing particularly stood out.",
      "Routine training session. The exercises were basic and player differentiation was difficult.",
    ],
    good: [
      "A good training visit. Small-sided games let you assess technical ability in realistic scenarios.",
      "Productive session. You got a clear look at several players' work rate and attitude.",
    ],
    excellent: [
      "An excellent training visit! Small-sided games let you assess technical and mental attributes up close.",
      "Highly productive visit. You noticed a player's exceptional training intensity — a strong professionalism indicator.",
    ],
    exceptional: [
      "An outstanding training visit! You spotted raw talent that the coaching staff themselves haven't fully recognized.",
      "Remarkable training session! A player demonstrated composure under pressure that you've rarely seen at this level.",
    ],
  },
  academyVisit: {
    poor: [
      "A quiet academy visit — most of the top prospects were away on international duty.",
      "Disappointing trip. The age group you targeted was doing fitness work, not football.",
    ],
    average: [
      "A routine academy visit. You saw some decent young players but nobody stood out dramatically.",
      "Standard academy session. The talent level was as expected for this club's youth setup.",
    ],
    good: [
      "A good academy visit. You spotted a couple of youngsters with genuine potential.",
      "Productive visit. The academy coaches pointed you toward their most promising age group.",
    ],
    excellent: [
      "An excellent academy visit! You identified a youngster with exceptional composure for his age.",
      "Highly productive trip. Multiple prospects caught your eye and the coaching staff were forthcoming.",
    ],
    exceptional: [
      "Outstanding academy visit! You spotted a youngster with exceptional composure for his age — potential wonderkid material.",
      "A visit you'll remember. A young player displayed the kind of raw, instinctive talent that can't be coached.",
    ],
  },
  youthTournament: {
    poor: [
      "A disappointing tournament. Defensive, cautious play from most teams made it hard to assess individual talent.",
      "Poor tournament for scouting — wet conditions and long balls meant technical players couldn't express themselves.",
    ],
    average: [
      "A standard youth tournament. Some decent performances but no one who truly caught your eye.",
      "Routine tournament viewing. The talent level was mixed and you gathered modest data.",
    ],
    good: [
      "A good tournament for scouting. Several young players showed flashes of quality worth tracking.",
      "Productive day. The competitive atmosphere brought the best out of several prospects.",
    ],
    excellent: [
      "An excellent tournament for scouting. You identified multiple prospects with genuine potential.",
      "Highly productive tournament. Two or three players performed well above the expected level for their age.",
    ],
    exceptional: [
      "An extraordinary tournament! One player dominated every match — the kind of display that signals a future star.",
      "Remarkable tournament! You discovered a talent so impressive you've already mentally drafted the report.",
    ],
  },
  schoolMatch: {
    poor: [
      "A disappointing school match — the pitch was waterlogged and the standard was low.",
      "You struggle to see any real quality. The match is disjointed and scrappy.",
    ],
    average: [
      "A decent school match. A couple of players show flashes of raw talent.",
      "The standard is typical for this level. You make notes on two or three lads.",
    ],
    good: [
      "A good school match. One youngster stands out with confident close control under pressure.",
      "Competitive match with good tempo. Several boys play beyond their years.",
    ],
    excellent: [
      "An excellent school match! One player's movement and awareness are far ahead of his peers.",
      "Outstanding game. A midfielder dictates the tempo with composure you rarely see at this age.",
    ],
    exceptional: [
      "A remarkable school match — one boy dominates with a maturity that stops you mid-note.",
      "Extraordinary display. A young player moves like he's played at this level for years. You can't look away.",
    ],
  },
  grassrootsTournament: {
    poor: [
      "A poorly organized tournament. Late kick-offs and short matches left little time for proper assessment.",
      "Disappointing grassroots event. Defensive football and nervous coaches made for slim pickings.",
    ],
    average: [
      "A typical grassroots tournament. Mixed quality across the teams but a few names worth noting.",
      "Standard community tournament. You spot a couple of raw athletes but nothing jumps off the page.",
    ],
    good: [
      "A well-run tournament with competitive matches. Several youngsters show genuine promise.",
      "Good grassroots event. The knockout stages bring the best out of two or three standout performers.",
    ],
    excellent: [
      "An excellent grassroots tournament! A young striker's instincts in the box are genuinely exciting.",
      "Highly competitive event. One team's centre-back reads the game like a seasoned professional.",
    ],
    exceptional: [
      "An extraordinary grassroots tournament! One player elevates every match he plays — a genuine prospect.",
      "Remarkable event. A young talent displays technique, intelligence, and composure that could fast-track his career.",
    ],
  },
  streetFootball: {
    poor: [
      "A quiet session at the cages. Most of the regulars didn't show and the quality was thin.",
      "Not much to see today. The weather kept numbers down and the football was unremarkable.",
    ],
    average: [
      "A routine street session. Quick feet and sharp one-twos, but nobody truly stood out.",
      "Decent session. The lads play with freedom but lack the decision-making you're looking for.",
    ],
    good: [
      "A good street session. One kid's close control in tight spaces is eye-catching.",
      "Productive visit. A young player's creativity and flair are exactly what structured football misses.",
    ],
    excellent: [
      "An excellent street session! A youngster's improvisation and body feints are completely self-taught — pure instinct.",
      "Outstanding session. One player embarrasses older kids with a mix of skill and fearlessness.",
    ],
    exceptional: [
      "A session you'll talk about. A young street footballer plays with a joy and ingenuity that can't be coached.",
      "Extraordinary talent spotted in the cages. This kid's spatial awareness and dribbling are off the charts.",
    ],
  },
  academyTrialDay: {
    poor: [
      "A frustrating trial day. Nerves got the better of most trialists and the standard disappointed.",
      "Below-par trial day. The academy coaches seemed unimpressed and you struggled to find a standout.",
    ],
    average: [
      "A standard academy trial. A few boys show potential but none separate themselves from the pack.",
      "Routine trial day. The drills are well-structured but the talent pool is ordinary.",
    ],
    good: [
      "A productive trial day. Two or three youngsters look comfortable in the academy environment.",
      "Good trial day. One player's composure during the match portion catches the coaches' attention.",
    ],
    excellent: [
      "An excellent trial day! A trialist adapts to the academy's style of play with remarkable speed.",
      "Highly productive trial. One boy's technical level is clearly above the rest — coaches exchange knowing looks.",
    ],
    exceptional: [
      "An outstanding trial day! A youngster performs so well the head of youth asks you where you found him.",
      "Extraordinary trial. A player's combination of ability and attitude is exactly what the academy needs.",
    ],
  },
  youthFestival: {
    poor: [
      "A chaotic youth festival. Overcrowded pitches and short match times hampered your assessment.",
      "Disappointing festival. The emphasis was on participation over competition, limiting scouting value.",
    ],
    average: [
      "A standard youth festival. Lots of matches to watch but the overall standard was middling.",
      "Routine festival viewing. You cast a wide net but the talent density was lower than hoped.",
    ],
    good: [
      "A well-organized youth festival. The variety of opposition brings out different qualities in the players.",
      "Good festival. Playing against unfamiliar teams reveals which youngsters can adapt on the fly.",
    ],
    excellent: [
      "An excellent youth festival! The intensity of back-to-back games separates the mentally tough from the rest.",
      "Highly productive festival. A young goalkeeper's shot-stopping and distribution are exceptional for his age.",
    ],
    exceptional: [
      "An unforgettable youth festival! One player is head and shoulders above everyone — scouts from three clubs are watching.",
      "Extraordinary festival. A young talent's performances improve with each match, suggesting enormous upside.",
    ],
  },
  writeReport: {
    poor: [
      "A struggle to compile your report. Your notes were disorganized and the analysis feels shallow.",
      "Difficult report session. You couldn't articulate your assessment clearly despite the data you have.",
    ],
    average: [
      "A standard report session. The work is solid but unlikely to impress the decision-makers.",
      "Routine report writing. You covered the key points but nothing in the analysis feels groundbreaking.",
    ],
    good: [
      "Good report writing session. Your analysis is clear and well-supported by your observations.",
      "Productive session. The report flows well and your conviction rating feels well-calibrated.",
    ],
    excellent: [
      "Excellent report session! You connected observations across multiple matches into a compelling narrative.",
      "Highly productive writing. Your comparison to a known player archetype adds real value to the assessment.",
    ],
    exceptional: [
      "A masterful report! Your analysis is so precise and insightful that it could influence a transfer decision on its own.",
      "Breakthrough report writing! You synthesized data, eye-test impressions, and context into an assessment that reads like art.",
    ],
  },

  // ── Youth activities ──────────────────────────────────────────────────────
  followUpSession: {
    poor: [
      "The follow-up session was frustrating. The player seemed distracted and showed none of the promise you'd seen before.",
      "A disappointing return visit. Nerves got the better of the youngster and you couldn't confirm your initial impressions.",
    ],
    average: [
      "A steady follow-up session. The player performed as expected — no surprises, positive or negative.",
      "Routine second look. You confirmed some earlier observations but didn't uncover anything new.",
    ],
    good: [
      "A productive follow-up. The player showed consistency, reinforcing your initial positive assessment.",
      "Good session. You noticed details you'd missed before — the player's off-the-ball movement is better than you thought.",
    ],
    excellent: [
      "Excellent follow-up! The player has clearly improved since your last visit. Your early instincts were right.",
      "Highly revealing session. Under pressure, the youngster showed composure well beyond his years.",
    ],
    exceptional: [
      "A defining follow-up session! The player produced a moment of brilliance that confirmed generational potential.",
      "Extraordinary return visit. Every doubt from your first observation has been emphatically answered.",
    ],
  },
  parentCoachMeeting: {
    poor: [
      "An awkward meeting. The parents were defensive and the coach gave only guarded answers.",
      "Difficult conversation. Cultural barriers made it hard to get honest information about the player's character.",
    ],
    average: [
      "A standard meeting. The parents were polite and the coach confirmed what you already suspected.",
      "Routine conversation. You learned the player's home situation is stable but gained no real edge.",
    ],
    good: [
      "A productive meeting. The coach shared training insights and the parents revealed the player's strong work ethic.",
      "Good conversation. You built rapport and learned about the player's mentality away from the pitch.",
    ],
    excellent: [
      "Excellent meeting! The coach confided that this player is the hardest worker in the age group.",
      "Highly revealing conversation. The parents' stories about the player's dedication painted a picture of real professionalism.",
    ],
    exceptional: [
      "A breakthrough meeting! The coach shared tactical insights that completely reframed your assessment of the player.",
      "Extraordinary conversation. The family's passion and the coach's conviction leave you certain this player has elite mentality.",
    ],
  },
  writePlacementReport: {
    poor: [
      "A weak placement report. You struggled to articulate why any club should take a chance on this player.",
      "The report reads flat. Your arguments for placement lack the conviction needed to persuade a sporting director.",
    ],
    average: [
      "A serviceable placement report. The data supports your recommendation but the narrative isn't compelling.",
      "Standard placement writing. You covered the basics but the report won't stand out on anyone's desk.",
    ],
    good: [
      "A solid placement report. Your recommendations are well-reasoned and backed by observation data.",
      "Good report. You've identified suitable clubs and your development rationale is persuasive.",
    ],
    excellent: [
      "An excellent placement report! Your club-by-club analysis shows deep understanding of development pathways.",
      "Impressive writing. The report maps the player's trajectory to specific club philosophies with real insight.",
    ],
    exceptional: [
      "A masterclass in placement writing! Your report reads like a development manifesto — clubs will compete for this player.",
      "Outstanding report. Your conviction, data, and narrative combine into the kind of document that launches careers.",
    ],
  },

  // ── First-team activities ─────────────────────────────────────────────────
  reserveMatch: {
    poor: [
      "A dull reserve match. The intensity was low and most players looked like they'd rather be elsewhere.",
      "Disappointing reserves fixture. Poor pitch conditions made it impossible to judge technical quality.",
    ],
    average: [
      "A routine reserve match. A couple of fringe players showed decent form but nothing remarkable.",
      "Standard reserves viewing. The match lacked intensity but you gathered some useful fitness data.",
    ],
    good: [
      "A useful reserve match. A returning player from injury showed encouraging signs of sharpness.",
      "Good viewing. The reserve fixture revealed squad depth issues the first team analysis had missed.",
    ],
    excellent: [
      "An excellent reserve match! A young player deputising from the academy completely outshone the senior pros.",
      "Highly productive. You spotted a tactical wrinkle the manager is testing before deploying it in the first team.",
    ],
    exceptional: [
      "A revelatory reserve match! A forgotten loanee returned with transformed confidence and elite-level performances.",
      "Outstanding viewing. The reserve match exposed exactly the squad gaps your scouting recommendations can fill.",
    ],
  },
  scoutingMission: {
    poor: [
      "A frustrating mission. Travel delays meant you arrived late and missed the key match entirely.",
      "Wasted trip. The target player was injured and the backup options proved underwhelming.",
    ],
    average: [
      "A standard scouting mission. You saw the target player but conditions limited your assessment.",
      "Routine trip. The player performed within expectations — no red flags, but no excitement either.",
    ],
    good: [
      "A productive mission. You got a clear look at the target and came away with a strong initial impression.",
      "Good trip. The player's physical profile matches the brief and his technical ability surprised you.",
    ],
    excellent: [
      "An excellent mission! The target exceeded expectations and you've already sketched out your recommendation.",
      "Highly productive trip. You spotted a secondary target who might actually be the better signing.",
    ],
    exceptional: [
      "A mission to remember! The player you were sent to watch is even better than the data suggested.",
      "Outstanding scouting trip. You've found exactly what the club needs — your conviction is absolute.",
    ],
  },
  oppositionAnalysis: {
    poor: [
      "A shallow analysis session. You couldn't find enough footage to build a reliable tactical profile.",
      "Frustrating preparation. The opposition's recent tactical changes make your older notes obsolete.",
    ],
    average: [
      "A standard opposition report. You identified their formation and key players but no obvious weaknesses.",
      "Routine analysis. The opposition play a predictable system — your report confirms what everyone expects.",
    ],
    good: [
      "A thorough analysis. You identified a pressing trigger that the coaching staff can exploit.",
      "Good preparation. Your set-piece analysis revealed vulnerabilities the manager will find useful.",
    ],
    excellent: [
      "An excellent analysis! You found a structural weakness in their build-up that could be decisive on matchday.",
      "Highly productive session. Your individual player assessments will give the coaching staff a real tactical edge.",
    ],
    exceptional: [
      "A masterful opposition report! Your tactical breakdown is so detailed it could be published as a coaching manual.",
      "Outstanding analysis. You've found the one weakness nobody else has spotted — the manager is delighted.",
    ],
  },
  agentShowcase: {
    poor: [
      "A wasted showcase event. The agent oversold every player and the actual talent was mediocre.",
      "Disappointing showcase. The players were clearly coached to impress but lacked genuine quality.",
    ],
    average: [
      "A routine showcase. A few decent players but nothing that warrants immediate follow-up.",
      "Standard agent event. The hospitality was better than the football — typical for these affairs.",
    ],
    good: [
      "A useful showcase. One player stood out from the crowd and is worth a second look.",
      "Good event. The agent's network is clearly strong — several players merit further investigation.",
    ],
    excellent: [
      "An excellent showcase! Two players displayed genuine first-team quality at affordable prices.",
      "Highly productive event. You built rapport with the agent and secured first-refusal on a promising talent.",
    ],
    exceptional: [
      "A remarkable showcase! You've found a hidden gem that other scouts completely overlooked.",
      "Outstanding event. The agent privately shared intel on an off-market player who fits your club perfectly.",
    ],
  },
  trialMatch: {
    poor: [
      "A poor trial. The player looked nervous and well below the standard needed for this level.",
      "Disappointing trial match. The player's fitness was clearly insufficient and he faded after 30 minutes.",
    ],
    average: [
      "A solid trial. The player showed he can compete at this level but didn't do enough to force a decision.",
      "Routine trial match. Technically adequate, but the trialist lacked the intensity the manager demands.",
    ],
    good: [
      "A good trial. The player adapted quickly and showed enough quality to warrant extending the assessment.",
      "Promising trial match. The trialist's work rate and tactical intelligence impressed the coaching staff.",
    ],
    excellent: [
      "An excellent trial! The player looked comfortable from the first minute — clearly a step above the other trialists.",
      "Highly impressive trial. The player's quality was obvious and the manager is already asking about contract terms.",
    ],
    exceptional: [
      "A stunning trial performance! The player dominated every phase and the club would be foolish not to sign him.",
      "Extraordinary trial. Your recommendation has been vindicated — this player is ready for the first team immediately.",
    ],
  },
  contractNegotiation: {
    poor: [
      "A tense negotiation that went nowhere. The agent's demands are unrealistic and talks have stalled.",
      "Frustrating session. Miscommunication over wage structure means you'll need to start over.",
    ],
    average: [
      "A standard negotiation. Both sides stated positions but significant gaps remain on key terms.",
      "Routine contract talks. Progress was slow but at least neither party walked away from the table.",
    ],
    good: [
      "A productive negotiation. You found common ground on the basic terms and clauses are nearly agreed.",
      "Good session. The agent was reasonable and you're close to a deal the club can afford.",
    ],
    excellent: [
      "An excellent negotiation! You secured favourable performance-based clauses that protect the club's investment.",
      "Highly productive talks. The agent respected your preparation and you've agreed terms below the initial asking price.",
    ],
    exceptional: [
      "A masterclass in negotiation! You secured the player at well below market rate with sell-on clauses that guarantee future value.",
      "Outstanding contract work. Both sides leave satisfied — a rare win-win that strengthens your reputation significantly.",
    ],
  },

  // ── Data activities ───────────────────────────────────────────────────────
  databaseQuery: {
    poor: [
      "A frustrating database session. Your search parameters were too broad and the results were noise.",
      "Wasted time at the screen. Server issues meant half your queries timed out before returning data.",
    ],
    average: [
      "A routine database query. You generated a long shortlist but nothing obviously exciting jumped out.",
      "Standard data mining session. The filters worked but the results mostly confirmed what you already knew.",
    ],
    good: [
      "A productive query session. Your refined parameters surfaced three players worth deeper analysis.",
      "Good database work. Cross-referencing age curves with performance data revealed an undervalued profile.",
    ],
    excellent: [
      "An excellent query session! Your algorithm flagged a statistical outlier that every other scout has missed.",
      "Highly productive mining. The data tells a clear story — this player's underlying metrics far exceed his reputation.",
    ],
    exceptional: [
      "A breakthrough database session! You've identified a market inefficiency that could save the club millions.",
      "Outstanding data work. Your query uncovered a player whose statistical profile is genuinely world-class for his age bracket.",
    ],
  },
  deepVideoAnalysis: {
    poor: [
      "A difficult video session. The footage quality was poor and you couldn't track player movement reliably.",
      "Frustrating analysis. You spent hours watching clips but the tactical context was impossible to assess from these angles.",
    ],
    average: [
      "A standard video review. You confirmed the player's basic profile but the footage didn't reveal anything new.",
      "Routine session. The statistical overlay matched the eye test — solid but unspectacular.",
    ],
    good: [
      "A productive video analysis. Frame-by-frame review revealed decision-making patterns invisible at full speed.",
      "Good session. The heat map data combined with your eye test gave you a much richer player profile.",
    ],
    excellent: [
      "An excellent video session! Your analysis revealed elite-level off-the-ball positioning that metrics alone can't capture.",
      "Highly productive review. Slow-motion analysis of pressing triggers showed this player reads the game two steps ahead.",
    ],
    exceptional: [
      "A masterful video analysis! You've built a complete tactical profile that tells a story no data point could alone.",
      "Extraordinary session. Your video evidence is so compelling it could change the club's entire transfer strategy.",
    ],
  },
  statsBriefing: {
    poor: [
      "A flat briefing. The analysts' presentation was surface-level and you couldn't extract actionable insights.",
      "Disappointing session. The statistics presented were lagging indicators that don't help with forward-looking decisions.",
    ],
    average: [
      "A routine stats briefing. The numbers confirmed your existing views but didn't challenge your thinking.",
      "Standard analytics session. Useful context for your ongoing assessments but nothing game-changing.",
    ],
    good: [
      "A useful briefing. The analytics team highlighted xG trends that explain a player's recent form change.",
      "Good session. The statistical models flagged regression risks in two targets you were previously optimistic about.",
    ],
    excellent: [
      "An excellent briefing! The new predictive model identified development trajectories that reshape your shortlist.",
      "Highly productive session. The analysts presented a statistical comparison that perfectly validates your gut feeling.",
    ],
    exceptional: [
      "A transformative briefing! The data revealed a pattern across your entire shortlist that changes your scouting approach.",
      "Outstanding analytics session. The predictive model's output is so strong you can make recommendations with near-certainty.",
    ],
  },
  dataConference: {
    poor: [
      "A disappointing conference. Most presentations were basic and you didn't learn anything your tools can't already do.",
      "Wasted trip. The sessions were too academic and disconnected from practical scouting applications.",
    ],
    average: [
      "A standard data conference. A couple of interesting talks but mostly confirmation of industry best practices.",
      "Routine event. The networking was better than the content — you made some useful contacts at least.",
    ],
    good: [
      "A useful conference. One presentation on progressive carrying metrics gave you a new analytical lens.",
      "Good event. You learned about a new expected threat model that could improve your evaluations.",
    ],
    excellent: [
      "An excellent conference! A workshop on machine learning for player projection genuinely expanded your capabilities.",
      "Highly productive event. You connected with a data scientist whose models could give your club a real edge.",
    ],
    exceptional: [
      "A career-defining conference! You were invited to present your methodology and it was extremely well received.",
      "Outstanding event. The techniques you learned will fundamentally upgrade your analytical toolkit.",
    ],
  },
  algorithmCalibration: {
    poor: [
      "A frustrating calibration session. Your model adjustments made predictions worse, not better.",
      "Poor session. Overfitting to recent results has degraded your algorithm's long-term accuracy.",
    ],
    average: [
      "A routine calibration. Minor parameter tweaks produced marginal improvements in prediction accuracy.",
      "Standard maintenance session. The model is stable but you haven't found the breakthrough you're looking for.",
    ],
    good: [
      "A productive calibration. Reweighting your age-curve assumptions improved prediction accuracy by a meaningful margin.",
      "Good session. Your backtesting reveals the model now handles league-level transitions much more reliably.",
    ],
    excellent: [
      "An excellent calibration! Your new weighting scheme dramatically reduces false positives for development potential.",
      "Highly productive tuning. The algorithm now identifies high-ceiling players with significantly greater precision.",
    ],
    exceptional: [
      "A breakthrough calibration! Your refined model outperforms every commercial tool you've tested against.",
      "Outstanding session. The algorithm's accuracy is now so high that your predictions are practically a cheat code.",
    ],
  },
  marketInefficiency: {
    poor: [
      "A dead end. The supposed market inefficiency turned out to be explained by factors your model missed.",
      "Frustrating research. Every undervalued player you identified has a hidden red flag explaining the low price.",
    ],
    average: [
      "A modest discovery. The inefficiency exists but the margin is too small to justify action.",
      "Routine analysis. You confirmed a known market pattern but haven't found a way to exploit it uniquely.",
    ],
    good: [
      "A useful finding. You've identified a league where player values consistently lag behind actual quality.",
      "Good research. The transfer fee arbitrage opportunity is clear and your club could benefit.",
    ],
    excellent: [
      "An excellent discovery! A structural market inefficiency means your club can acquire proven quality at youth prices.",
      "Highly productive analysis. The data proves that clubs consistently undervalue this profile — and you've found three examples.",
    ],
    exceptional: [
      "A stunning market insight! You've found a systematic pricing error that could fund an entire window's business.",
      "Outstanding research. This inefficiency is so significant that acting on it could transform the club's competitive position.",
    ],
  },
  analyticsTeamMeeting: {
    poor: [
      "A tense meeting. Disagreements over methodology meant no actionable conclusions were reached.",
      "Frustrating session. The team couldn't align on which metrics matter most and the discussion went in circles.",
    ],
    average: [
      "A routine team meeting. Updates were shared and tasks assigned but no new insights emerged.",
      "Standard session. The analytics team is functioning but isn't generating the innovative work you'd hoped for.",
    ],
    good: [
      "A productive meeting. The team aligned on a new framework for evaluating defensive contributions.",
      "Good session. Collaborative discussion surfaced a data blind spot that you can now address systematically.",
    ],
    excellent: [
      "An excellent team meeting! A junior analyst presented findings that challenge conventional wisdom on player aging curves.",
      "Highly productive session. The team's combined expertise produced a shortlist methodology that's genuinely innovative.",
    ],
    exceptional: [
      "An outstanding team meeting! The group achieved a breakthrough in predictive modelling that puts you ahead of rival clubs.",
      "Remarkable session. The team's synergy produced insights no individual could have reached alone.",
    ],
  },

  // ── General activities ────────────────────────────────────────────────────
  freeAgentOutreach: {
    poor: [
      "A wasted outreach day. Every agent you contacted was unavailable or uninterested in your club's offer.",
      "Frustrating calls. The free agents on your list have already agreed terms elsewhere.",
    ],
    average: [
      "A routine outreach session. You made contact with a few agents but nobody is rushing to commit.",
      "Standard networking. The free agent market is thin this week but you've kept your name in circulation.",
    ],
    good: [
      "A productive outreach day. An agent confirmed their client is interested and open to talks.",
      "Good session. You identified a free agent whose profile perfectly matches an upcoming squad need.",
    ],
    excellent: [
      "An excellent outreach session! You've secured an exclusive first meeting with a highly sought-after free agent.",
      "Highly productive calls. Two agents came to you — your reputation is clearly opening doors.",
    ],
    exceptional: [
      "A remarkable outreach day! A top free agent's camp contacted you directly, citing your reputation as the deciding factor.",
      "Outstanding networking. You've positioned your club as the preferred destination for a player rivals are desperate to sign.",
    ],
  },
  loanMonitoring: {
    poor: [
      "A difficult monitoring visit. The loan player looked disinterested and the host club's coaches were evasive.",
      "Frustrating check-in. The player's playing time has dropped and nobody at the loan club will explain why.",
    ],
    average: [
      "A routine monitoring report. The loan player is getting minutes but development progress is modest.",
      "Standard check-in. The player is settling in but hasn't yet shown the growth you'd hoped for.",
    ],
    good: [
      "A positive monitoring visit. The loan player is thriving in his new environment and getting regular starts.",
      "Good check-in. The host club's coaching staff are delighted with the player's attitude and development.",
    ],
    excellent: [
      "An excellent monitoring report! The player has become a key figure at the loan club and his confidence has soared.",
      "Highly encouraging visit. Statistical indicators and the eye test both confirm accelerated development.",
    ],
    exceptional: [
      "An outstanding monitoring session! The loan player is performing so well the host club wants to discuss a permanent deal.",
      "Remarkable progress. The loan has been transformative — this player will return as a genuine first-team contender.",
    ],
  },
  loanRecommendation: {
    poor: [
      "A weak recommendation. You couldn't find a suitable club that matches the player's development needs.",
      "Frustrating process. The clubs you approached either lack playing time or the right competitive level.",
    ],
    average: [
      "A serviceable recommendation. You've found a loan destination, though it's not the ideal environment.",
      "Standard process. The recommendation is solid on paper but you have reservations about the coaching setup.",
    ],
    good: [
      "A well-researched recommendation. The target club's style of play is perfect for the player's development.",
      "Good work. You've matched the player to a club where he'll play regularly in his natural position.",
    ],
    excellent: [
      "An excellent recommendation! The target club's manager specifically requested this player after seeing your report.",
      "Highly targeted work. Your analysis of the loan club's squad gaps proves this player will be first choice immediately.",
    ],
    exceptional: [
      "A masterful recommendation! You've orchestrated the perfect development loan — playing time, coaching quality, and competition level all align.",
      "Outstanding placement work. The loan deal includes a development plan that both clubs have bought into enthusiastically.",
    ],
  },
  rest: {
    poor: [
      "A restless day off. You couldn't stop thinking about the upcoming fixtures and barely recovered.",
      "Poor rest. Phone calls from agents and late-night video sessions meant you didn't actually switch off.",
    ],
    average: [
      "A quiet rest day. You managed to step away from scouting for a few hours and recharge somewhat.",
      "Standard recovery. Not the most relaxing day but at least you're not running on fumes tomorrow.",
    ],
    good: [
      "A good rest day. You disconnected completely and feel noticeably sharper for it.",
      "Proper recovery. A long walk and early night have done wonders for your focus.",
    ],
    excellent: [
      "An excellent rest day! You feel completely refreshed and ready to attack the next assignment.",
      "Deeply restorative. The break gave you mental clarity — you can already see patterns you'd been too tired to notice.",
    ],
    exceptional: [
      "A perfect rest day. You return to work feeling like a new person — energised, sharp, and motivated.",
      "The kind of break every scout needs. Your mind is clear and your enthusiasm for the work has been totally renewed.",
    ],
  },

  // ── Career activities ─────────────────────────────────────────────────────
  reviewNPCReport: {
    poor: [
      "A sloppy report review. Your junior scout's work was below standard and your feedback was equally unfocused.",
      "Frustrating review session. The NPC report lacked detail and you struggled to extract useful insights.",
    ],
    average: [
      "A routine report review. The scout's observations were competent but unremarkable.",
      "Standard review. You corrected a few assessment errors and filed the report without much excitement.",
    ],
    good: [
      "A useful report review. Your scout identified a genuine prospect and your feedback sharpened the assessment.",
      "Good review session. The report was well-structured and your annotations added strategic context.",
    ],
    excellent: [
      "An excellent review! Your feedback transformed a decent report into a persuasive document the board will act on.",
      "Highly productive review. The scout's raw data combined with your expertise produced a compelling player profile.",
    ],
    exceptional: [
      "An outstanding review session! Your scout has found someone special, and your editorial guidance made the case irrefutable.",
      "Remarkable review. The combination of your scout's groundwork and your strategic vision is the best work your department has produced.",
    ],
  },
  managerMeeting: {
    poor: [
      "An awkward meeting. The manager seemed distracted and your transfer recommendations fell on deaf ears.",
      "Tense discussion. A disagreement over player priorities left the relationship slightly strained.",
    ],
    average: [
      "A routine meeting with the manager. He acknowledged your input but made no commitments.",
      "Standard catch-up. The manager listened politely but you're not sure how much influence you really have.",
    ],
    good: [
      "A productive meeting. The manager showed genuine interest in your latest scouting targets.",
      "Good discussion. You aligned on transfer priorities and the manager values your perspective.",
    ],
    excellent: [
      "An excellent meeting! The manager asked you to lead the search for a specific position — real trust.",
      "Highly productive discussion. Your tactical analysis impressed the manager and he's reshaping his shortlist based on your input.",
    ],
    exceptional: [
      "A career-defining meeting. The manager told the board that your scouting is the club's biggest competitive advantage.",
      "Outstanding session. The manager has given you full autonomy on the next signing — the ultimate vote of confidence.",
    ],
  },
  boardPresentation: {
    poor: [
      "A nervy presentation. You stumbled over the numbers and the board seemed unconvinced by your analysis.",
      "Difficult session. Tough questions from the chairman exposed gaps in your preparation.",
    ],
    average: [
      "A routine board presentation. The directors listened attentively but asked few follow-up questions.",
      "Standard presentation. You delivered the key metrics clearly but didn't generate much enthusiasm.",
    ],
    good: [
      "A well-received presentation. The board appreciated your thoroughness and approved continued investment.",
      "Good session. Your data-driven approach impressed the finance director and your budget looks secure.",
    ],
    excellent: [
      "An excellent presentation! The board increased your scouting budget based on the ROI you demonstrated.",
      "Highly impressive session. The chairman specifically praised the quality of your department's work.",
    ],
    exceptional: [
      "A triumphant board presentation! Your track record is so strong the board has offered expanded responsibilities.",
      "Outstanding session. The directors are talking about making your scouting model a blueprint for the entire club.",
    ],
  },
  assignTerritory: {
    poor: [
      "A poorly planned territory assignment. The region you chose has limited fixtures and sparse talent.",
      "Frustrating planning session. Logistics issues mean your scouts can't cover the assigned territory efficiently.",
    ],
    average: [
      "A routine territory assignment. The coverage plan is adequate but not particularly strategic.",
      "Standard planning. Your scouts have their marching orders but the territory lacks obvious high-value targets.",
    ],
    good: [
      "A smart territory assignment. Your scouts are well-positioned to cover key matches in a talent-rich area.",
      "Good planning. The territory offers a strong mix of established leagues and emerging talent pathways.",
    ],
    excellent: [
      "An excellent territory strategy! Your coverage plan maximises exposure to the region's best young talent.",
      "Highly strategic assignment. Your scouts will have first-mover advantage in an under-scouted region.",
    ],
    exceptional: [
      "A visionary territory assignment! You've identified a region that rival clubs have completely neglected.",
      "Outstanding planning. Your strategic territory coverage gives the club access to talent pipelines nobody else is monitoring.",
    ],
  },
  internationalTravel: {
    poor: [
      "A gruelling trip. Delays, cancellations, and jet lag meant you arrived too exhausted to scout effectively.",
      "Difficult travel. The logistics were a nightmare and you lost a full day to administrative problems.",
    ],
    average: [
      "A routine international trip. Travel was uneventful and you arrived in good time for your assignments.",
      "Standard journey. Long hours in transit but you used the time to review video footage on your laptop.",
    ],
    good: [
      "A productive trip. Smooth travel meant you arrived fresh and immediately immersed yourself in the local scene.",
      "Good travel. You struck up a conversation with a local journalist who shared valuable intel about the youth setup.",
    ],
    excellent: [
      "An excellent trip! Your advance planning paid off — every connection was seamless and you maximised your time on the ground.",
      "Highly efficient travel. You used transit time for deep video analysis and arrived fully prepared.",
    ],
    exceptional: [
      "A perfect international trip! Everything aligned — contacts, logistics, and timing — setting up a week of world-class scouting.",
      "Outstanding journey. A chance encounter at the airport with a legendary scout led to an invaluable exchange of knowledge.",
    ],
  },
};

// =============================================================================
// ROLL FUNCTION
// =============================================================================

/**
 * Roll an activity quality tier based on the scout's relevant skill and fatigue.
 *
 * Higher skill levels and lower fatigue shift the distribution toward better
 * outcomes. The function uses the seeded RNG for deterministic results.
 */
export function rollActivityQuality(
  rng: RNG,
  activityType: ActivityType,
  scout: Scout,
): ActivityQualityResult {
  const primarySkill = PRIMARY_SKILL_MAP[activityType];
  // Default skill level of 10 (mid-range) for unmapped activities
  const skillLevel = primarySkill ? scout.skills[primarySkill] : 10;
  const fatigue = scout.fatigue;

  // Shift factor: positive shifts boost higher tiers, negative boosts lower
  // Skill contribution: (skillLevel - 8) / 24 ranges from about -0.29 to +0.5
  // Fatigue penalty: -(fatigue / 100) * 0.4 ranges from 0 to -0.4
  const shiftFactor = (skillLevel - 8) / 24 - (fatigue / 100) * 0.4;

  // Build weighted items with shifted weights
  const tiers: ActivityQualityTier[] = [
    "poor",
    "average",
    "good",
    "excellent",
    "exceptional",
  ];

  // Shift multipliers: negative tiers get penalized by positive shift, boosted by negative
  const shiftMultipliers = [-2, -1, 0, 1, 2];

  const items = tiers.map((tier, i) => {
    const baseWeight = BASE_WEIGHTS[tier];
    const adjusted = baseWeight * (1 + shiftFactor * shiftMultipliers[i]);
    return { item: tier, weight: Math.max(1, adjusted) };
  });

  const tier = rng.pickWeighted(items);
  const config = TIER_CONFIG[tier];

  // Pick a narrative
  const templates = NARRATIVES[activityType]?.[tier];
  const narrative = templates
    ? rng.pick(templates)
    : `Your ${activityType} session was ${tier}.`;

  return {
    activityType,
    tier,
    multiplier: config.multiplier,
    narrative,
    discoveryModifier: config.discoveryModifier,
  };
}

// =============================================================================
// MULTI-DAY CONTINUATION NARRATIVES
// =============================================================================

/** Day-2+ narratives for multi-slot activities. Keyed by activity type. */
export const MULTI_DAY_CONTINUATIONS: Partial<Record<ActivityType, string[]>> = {
  schoolMatch: [
    "You return for the second half of the school match, watching with fresh eyes.",
    "Another look at the same group — you notice details you missed yesterday.",
  ],
  grassrootsTournament: [
    "Day two of the tournament. The knockout rounds reveal more about each player's character.",
    "Back at the tournament grounds. Fatigue is setting in and you can see who's mentally tough.",
    "Final day of the grassroots tournament. The best players have risen to the top.",
  ],
  streetFootball: [
    "You return to the cages for another look at the local talent.",
  ],
  academyTrialDay: [
    "Second day of trials. The boys are more relaxed and their true ability shows through.",
  ],
  youthFestival: [
    "Day two of the festival. You've narrowed your focus to a handful of standout players.",
    "Final day of the festival. Back-to-back games have sorted the wheat from the chaff.",
  ],
  attendMatch: [
    "You review your notes and settle in for continued observation.",
  ],
  trainingVisit: [
    "A second session gives you a fuller picture of the squad's dynamics.",
  ],
  scoutingMission: [
    "You continue your scouting mission, following up on yesterday's initial impressions.",
  ],
  travel: [
    "The journey continues. You review your notes and prepare for arrival.",
  ],
  internationalTravel: [
    "Still in transit. You use the downtime to organize your scouting plans.",
  ],
  dataConference: [
    "Day two of the conference. The breakout sessions offer more hands-on insights.",
  ],
};
