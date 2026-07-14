import type {
  ActivityType,
  GameState,
  PlayerAttribute,
  Scout,
  UnsignedYouth,
} from "@/engine/core/types";
import type { PlayerMoment } from "@/engine/observation/types";
import { createRNG } from "@/engine/rng";
import {
  OPENING_CASE_ACTIVITY_PREFIX,
  createOpeningCase,
  type OpeningCaseChoiceId,
  type OpeningCaseState,
} from "./openingCase";
import type {
  VeteranPrologueCase,
  VeteranPrologueChoice,
  VeteranPrologueEvidenceBeat,
  VeteranPrologueSourceArchetype,
  VeteranPrologueTemplateId,
  VeteranScoutPersona,
} from "./veteranPrologueTypes";

export type {
  VeteranPrologueCase,
  VeteranPrologueChoice,
  VeteranPrologueEvidenceBeat,
  VeteranPrologueSourceArchetype,
  VeteranPrologueTemplateId,
  VeteranScoutPersona,
} from "./veteranPrologueTypes";

/**
 * Veteran openings deliberately reuse the normal opening-case ledger. The
 * template controls how the lead arrives and how the evidence is framed, while
 * the stable choice ids keep the existing consequence engine authoritative.
 */
type VeteranPrologueChoiceDefinition = Omit<VeteranPrologueChoice, "effect">;

interface EvidenceBeatDefinition {
  type: PlayerMoment["momentType"];
  quality: number;
  attributes: [PlayerAttribute, ...PlayerAttribute[]];
  focused: string;
  peripheral: string;
  pressure?: boolean;
}

interface VeteranVenueDefinition {
  activityType: ActivityType;
  label: string;
  setting: string;
}

interface VeteranPrologueTemplateDefinition {
  id: VeteranPrologueTemplateId;
  title: string;
  premise: string;
  sourceArchetype: VeteranPrologueSourceArchetype;
  venues: readonly [VeteranVenueDefinition, ...VeteranVenueDefinition[]];
  pressures: readonly [string, ...string[]];
  evidenceFrames: readonly [
    readonly [EvidenceBeatDefinition, EvidenceBeatDefinition, EvidenceBeatDefinition],
    ...Array<readonly [EvidenceBeatDefinition, EvidenceBeatDefinition, EvidenceBeatDefinition]>,
  ];
  contradictions: readonly [string, ...string[]];
  deadlines: readonly [string, ...string[]];
  stakeholderConflicts: readonly [string, ...string[]];
  choices: readonly [VeteranPrologueChoiceDefinition, VeteranPrologueChoiceDefinition, VeteranPrologueChoiceDefinition];
  affinityTags: readonly string[];
}

const choice = (
  id: OpeningCaseChoiceId,
  label: string,
  description: string,
  knownTradeoffs: [string, string, string],
): VeteranPrologueChoiceDefinition => ({ id, label, description, knownTradeoffs });

const frame = (
  first: EvidenceBeatDefinition,
  second: EvidenceBeatDefinition,
  third: EvidenceBeatDefinition,
): readonly [EvidenceBeatDefinition, EvidenceBeatDefinition, EvidenceBeatDefinition] => [
  first,
  second,
  third,
];

export const VETERAN_PROLOGUE_TEMPLATES: readonly VeteranPrologueTemplateDefinition[] = [
  {
    id: "school-tournament-tip",
    title: "The Name on the Touchline",
    premise: "A school coach sends one name, one kickoff time, and a warning that the regional final will not stay quiet for long.",
    sourceArchetype: "school-coach",
    venues: [
      { activityType: "schoolMatch", label: "District school final", setting: "A narrow school pitch ringed by parents, teachers, and two unfamiliar club jackets." },
      { activityType: "grassrootsTournament", label: "County schools tournament", setting: "Three short matches on tired grass, with almost no recovery time between them." },
      { activityType: "youthTournament", label: "Regional schools cup", setting: "A compact knockout bracket where every good action travels down the touchline." },
    ],
    pressures: [
      "Two academy recruiters arrive before halftime and begin asking for team sheets.",
      "The coach will withdraw the introduction if the afternoon turns into a public auction.",
    ],
    evidenceFrames: [
      frame(
        { type: "technicalAction", quality: 6, attributes: ["firstTouch", "passing"], focused: "{player} kills an awkward pass on the move, but chooses the safest exit.", peripheral: "The tipped player handles one ugly ball cleanly, then disappears into the shape." },
        { type: "tacticalDecision", quality: 9, attributes: ["vision", "anticipation", "passing"], focused: "{player} scans twice, waits for the full-back to commit, and threads the pass through the gap that follows.", peripheral: "A passing lane appears a fraction before anyone else seems to notice it.", pressure: true },
        { type: "mentalResponse", quality: 4, attributes: ["composure", "decisionMaking"], focused: "After the touchline reacts, {player} forces the next two actions and gives the ball away.", peripheral: "The attention seems to rush the player into an avoidable mistake.", pressure: true },
      ),
      frame(
        { type: "tacticalDecision", quality: 6, attributes: ["positioning", "teamwork"], focused: "{player} keeps repairing a teammate's position without receiving the ball.", peripheral: "One player appears to be organizing spaces nobody in the crowd is watching." },
        { type: "technicalAction", quality: 9, attributes: ["firstTouch", "dribbling", "balance"], focused: "A bouncing clearance becomes one touch, a body feint, and an escape through two players.", peripheral: "A messy clearance turns into a clean break before the crowd understands how.", pressure: true },
        { type: "physicalTest", quality: 5, attributes: ["stamina", "strength"], focused: "Late in the game, {player} is knocked off a duel and takes time to recover position.", peripheral: "The earlier standout is finally made to look physically young." },
      ),
    ],
    contradictions: [
      "The rare action is elite for this level; the response to being noticed is not.",
      "The off-ball intelligence keeps surfacing, but the physical contest exposes how unfinished the player remains.",
    ],
    deadlines: ["The tournament ends tonight; academy calls begin in the morning.", "The coach will give you until sunset before returning other messages."],
    stakeholderConflicts: ["The coach wants discretion. The interested club wants a name immediately.", "The family trusts the school, while recruiters are already trying to bypass it."],
    choices: [
      choice("protect", "Protect the coach's window", "Keep the name between you and the school while arranging a cleaner second look.", ["Protects access", "Adds evidence", "Risks losing first-mover advantage"]),
      choice("callClub", "Call before the final whistle", "Put your reputation behind the live impression before the other jackets leave.", ["Moves first", "Creates pressure", "Exposes a thin evidence base"]),
      choice("verify", "Ask for the earlier match film", "Test whether the standout actions repeat outside today's charged setting.", ["Adds another context", "Uses the relationship", "The market keeps moving"]),
    ],
    affinityTags: ["grassroots-organizer", "relationships-first", "move-before-market", "youth"],
  },
  {
    id: "released-academy-player",
    title: "The Player They Let Go",
    premise: "An academy insider believes a recent release was a timing decision, not a talent decision. The player has one open trial left.",
    sourceArchetype: "academy-insider",
    venues: [
      { activityType: "academyTrialDay", label: "Open academy trial", setting: "Released players wear numbered bibs while staff compare notes behind a glass wall." },
      { activityType: "academyVisit", label: "Development-centre session", setting: "A borrowed academy pitch, unfamiliar teammates, and coaches who have already read the release notice." },
      { activityType: "trialMatch", label: "Closed trial match", setting: "One controlled match with no spectators and a decision meeting scheduled immediately after it." },
    ],
    pressures: ["The release label is shaping every interpretation before the ball is kicked.", "A second trial club will only hold the place if it hears something positive tonight."],
    evidenceFrames: [
      frame(
        { type: "mentalResponse", quality: 7, attributes: ["composure", "teamwork"], focused: "{player} asks for the ball after an early mistake rather than hiding from it.", peripheral: "The released player makes another option after giving the ball away.", pressure: true },
        { type: "tacticalDecision", quality: 9, attributes: ["offTheBall", "anticipation", "vision"], focused: "{player} bends a run to create the passing lane, then leaves it for a teammate arriving in a better position.", peripheral: "The decisive movement is the one that never touches the ball." },
        { type: "physicalTest", quality: 4, attributes: ["strength", "pace"], focused: "In an isolated sprint and shoulder duel, {player} loses ground badly.", peripheral: "The player looks ordinary when the trial reduces to a pure athletic contest.", pressure: true },
      ),
      frame(
        { type: "technicalAction", quality: 5, attributes: ["firstTouch", "passing"], focused: "The first few touches are neat but cautious, as if {player} is trying not to confirm the release decision.", peripheral: "The released player starts without demanding attention." },
        { type: "mentalResponse", quality: 9, attributes: ["workRate", "composure", "decisionMaking"], focused: "After a teammate blames the missed press, {player} resets the line and wins the next turnover without argument.", peripheral: "A tense exchange becomes the best defensive sequence of the session.", pressure: true },
        { type: "technicalAction", quality: 4, attributes: ["finishing", "balance"], focused: "The chance to end the trial story cleanly arrives, and {player} snatches at it.", peripheral: "The obvious highlight chance is the one the player cannot finish." },
      ),
    ],
    contradictions: ["The academy's physical concern is visible, but so is the decision-making it may have undervalued.", "The player handles social pressure better than the decisive technical moment."],
    deadlines: ["The trial registration closes at 18:00.", "The family must accept or decline the second club's invitation tomorrow morning."],
    stakeholderConflicts: ["The former academy wants its judgment respected; the trial club wants an independent read.", "The player needs another door, while the insider cannot be seen undermining the release panel."],
    choices: [
      choice("protect", "Build a private re-evaluation", "Keep the academy source out of it and assemble evidence from a second context.", ["Protects the insider", "Tests the release rationale", "May miss the trial slot"]),
      choice("callClub", "Challenge the release call", "Tell the trial club exactly which academy assumption you believe is wrong.", ["Creates a clear thesis", "Stakes your judgment", "Could burn academy trust"]),
      choice("verify", "Request the release rationale", "Ask the insider to separate development timing, physical projection, and football judgment.", ["Clarifies the real concern", "Deepens source exposure", "Delays action"]),
    ],
    affinityTags: ["academy-apprentice", "contrarian-eye", "evidence-first", "youth"],
  },
  {
    id: "rival-already-watching",
    title: "Someone Else Has the Name",
    premise: "Your contact whispers the shirt number. Across the pitch, a rival scout is already writing before kickoff.",
    sourceArchetype: "touchline-contact",
    venues: [
      { activityType: "youthFestival", label: "Invitation youth festival", setting: "Short-sided matches, rotating teams, and enough scouts that every conversation can be overheard." },
      { activityType: "schoolMatch", label: "Midweek floodlit school match", setting: "A cramped touchline where the rival can see exactly which player holds your attention." },
      { activityType: "grassrootsTournament", label: "Regional grassroots semi-final", setting: "The rival has the team sheet, the organizer's number, and a place beside the tunnel." },
    ],
    pressures: ["Every focus decision signals your level of interest to a direct rival.", "The rival has better access but may be watching for the wrong trait."],
    evidenceFrames: [
      frame(
        { type: "technicalAction", quality: 6, attributes: ["dribbling", "balance"], focused: "{player} beats the first defender, then runs into the second. The rival writes anyway.", peripheral: "A lively dribble ends without a useful action." },
        { type: "tacticalDecision", quality: 9, attributes: ["pressing", "anticipation", "teamwork"], focused: "{player} triggers a press two passes early and the entire move collapses toward the trap.", peripheral: "The turnover seems accidental until the same player points to where it began.", pressure: true },
        { type: "mentalResponse", quality: 4, attributes: ["composure", "bigGameTemperament"], focused: "Noticing the scouts, {player} attempts the spectacular option and wastes the transition.", peripheral: "The player appears to perform for the touchline instead of the match.", pressure: true },
      ),
      frame(
        { type: "tacticalDecision", quality: 5, attributes: ["positioning", "defensiveAwareness"], focused: "{player} spends the opening phase covering a teammate's aggressive positioning.", peripheral: "The tipped player is almost invisible while the team stays balanced." },
        { type: "technicalAction", quality: 8, attributes: ["passing", "vision"], focused: "With the rival looking down to write, {player} reverses play first-time and creates the clearest chance.", peripheral: "The ball reaches the weak side before the defensive block can turn." },
        { type: "physicalTest", quality: 4, attributes: ["stamina", "pace"], focused: "The repeated recovery runs take a visible toll, and {player} stops arriving first.", peripheral: "The quiet organizer fades as the schedule catches up.", pressure: true },
      ),
    ],
    contradictions: ["The rival is reacting to the obvious skill; your strongest evidence concerns the action that created it.", "The player's tactical value is real, but the tournament load may be revealing a physical ceiling or only fatigue."],
    deadlines: ["The rival has a call scheduled during the break.", "The organizer says a private introduction is available only before the final match."],
    stakeholderConflicts: ["Your source wants credit protected. The rival is using visibility to flush out who knows what.", "The organizer values openness; your competitive advantage depends on silence."],
    choices: [
      choice("protect", "Hide your level of interest", "Shift focus, preserve the source, and arrange access away from the rival.", ["Reduces signaling", "Protects the lead", "Gives the rival time"]),
      choice("callClub", "Force the race into the open", "Call a club while the rival is still collecting evidence.", ["Claims first action", "Raises the player's visibility", "Starts a bidding race"]),
      choice("verify", "Test what the rival is watching", "Use the contact to learn whether the competing report matches your thesis.", ["Reveals rival intent", "Adds indirect evidence", "Risks exposing your own read"]),
    ],
    affinityTags: ["move-before-market", "stubborn-convictions", "former-player", "youth"],
  },
  {
    id: "family-discretion",
    title: "The Family's Door",
    premise: "A family contact will talk, but only if the conversation does not become another recruitment pitch.",
    sourceArchetype: "family-gatekeeper",
    venues: [
      { activityType: "parentCoachMeeting", label: "Private parent-coach meeting", setting: "A quiet room after training, with the player's next school year as important as football." },
      { activityType: "followUpSession", label: "Family follow-up", setting: "A cafe away from the ground where every question also tests whether you can be trusted." },
    ],
    pressures: ["The family will end the conversation if it feels like a disguised sales call.", "A club has approached the player directly, making every question feel political."],
    evidenceFrames: [
      frame(
        { type: "characterReveal", quality: 6, attributes: ["professionalism", "workRate"], focused: "{source} describes how {player} reorganized schoolwork before accepting extra training.", peripheral: "The family offers one concrete example of preparation rather than ambition." },
        { type: "mentalResponse", quality: 8, attributes: ["composure", "leadership"], focused: "The account of a difficult tournament centers on {player} calming a teammate, not the result.", peripheral: "A pressure story reveals responsibility but comes from an invested source.", pressure: true },
        { type: "characterReveal", quality: 4, attributes: ["composure", "professionalism"], focused: "The family admits {player} resisted the last proposed move and withdrew for several weeks.", peripheral: "The strongest concern is not football ability but response to change.", pressure: true },
      ),
      frame(
        { type: "characterReveal", quality: 5, attributes: ["professionalism", "consistency"], focused: "{source} has detailed routines but few examples from losing weeks.", peripheral: "The polished account has a conspicuous gap around setbacks." },
        { type: "mentalResponse", quality: 8, attributes: ["decisionMaking", "composure"], focused: "A message from {player} interrupts the meeting: precise, accountable, and asking what evidence the club actually needs.", peripheral: "The player enters the conversation by asking a more mature question than the adults." },
        { type: "characterReveal", quality: 4, attributes: ["bigGameTemperament", "consistency"], focused: "When the regional final is mentioned, the room goes quiet and {source} changes the subject.", peripheral: "One missing story becomes more revealing than the rehearsed ones." },
      ),
    ],
    contradictions: ["The family offers rare character evidence, but it is also the least independent source available.", "The player's maturity is visible in the process; the avoidance around failure still needs testing."],
    deadlines: ["The family will take one trusted introduction this week, then close the door.", "A school decision in forty-eight hours will determine which training options remain possible."],
    stakeholderConflicts: ["The family wants control and education protected; the club wants immediate access.", "The coach believes the player should move now, while the family believes patience is part of development."],
    choices: [
      choice("protect", "Honor the private window", "Keep clubs out until you can test the character claims independently.", ["Builds family trust", "Preserves control", "Could lose the available club"]),
      choice("callClub", "Offer one controlled introduction", "Use your name to set boundaries before connecting the family to a club.", ["Creates a real pathway", "Makes you accountable", "Changes the relationship immediately"]),
      choice("verify", "Ask the coach for the hard week", "Look for evidence from the setback the family did not want to discuss.", ["Tests source bias", "May surface real risk", "Could feel like a breach"]),
    ],
    affinityTags: ["relationships-first", "grassroots-organizer", "fragile-network", "youth"],
  },
  {
    id: "injury-return",
    title: "Ninety Minutes After Nine Months",
    premise: "A rehab coach says the player is finally ready to be judged as a footballer again. The injury history makes every movement ambiguous.",
    sourceArchetype: "rehab-coach",
    venues: [
      { activityType: "trainingVisit", label: "Closed return-to-play session", setting: "Controlled drills become live work for the first time, with medical staff counting every acceleration." },
      { activityType: "trialMatch", label: "Return trial match", setting: "The player has a limited minute plan and opponents who have not been told to protect it." },
      { activityType: "academyVisit", label: "Academy rehabilitation game", setting: "A small-sided game designed to reveal decisions before it tests endurance." },
    ],
    pressures: ["A poor physical moment may be fear, rust, or a lasting limitation.", "The medical team wants caution while the player needs a decisive performance to keep the trial alive."],
    evidenceFrames: [
      frame(
        { type: "physicalTest", quality: 5, attributes: ["pace", "balance"], focused: "{player} completes the first acceleration but protects one side while decelerating.", peripheral: "The returning player reaches speed, then exits the movement carefully." },
        { type: "mentalResponse", quality: 9, attributes: ["composure", "decisionMaking", "anticipation"], focused: "When the same movement appears again, {player} releases the pass earlier and removes the collision entirely.", peripheral: "The player solves the risky moment with timing rather than force.", pressure: true },
        { type: "physicalTest", quality: 4, attributes: ["stamina", "agility"], focused: "Late in the block, {player} stops changing direction sharply and begins managing space.", peripheral: "The movement quality fades before the technical quality does.", pressure: true },
      ),
      frame(
        { type: "mentalResponse", quality: 6, attributes: ["composure", "workRate"], focused: "{player} absorbs the first heavy contact, gets up immediately, and asks for the next pass.", peripheral: "The first collision produces no visible retreat." },
        { type: "technicalAction", quality: 9, attributes: ["firstTouch", "passing", "vision"], focused: "Unable to separate with pace, {player} creates separation with the first touch and a disguised pass.", peripheral: "The returning player looks quickest when the ball does the running." },
        { type: "physicalTest", quality: 3, attributes: ["pace", "strength"], focused: "A final recovery run never reaches full speed, and the medical staff end the session.", peripheral: "The session closes on the exact physical doubt everyone hoped to settle.", pressure: true },
      ),
    ],
    contradictions: ["The football intelligence may have improved during recovery; the physical answer remains unresolved.", "The player responds to contact but not yet to cumulative load."],
    deadlines: ["The trial club's medical review is tomorrow.", "The current academy must decide this week whether to fund another rehabilitation block."],
    stakeholderConflicts: ["The rehab coach protects the player; the recruitment staff need an unemotional risk assessment.", "The player needs minutes now, while the medical staff see patience as the only responsible choice."],
    choices: [
      choice("protect", "Separate talent from medical risk", "Keep the football recommendation private until specialist evidence catches up.", ["Avoids an overclaim", "Preserves player trust", "May close the trial window"]),
      choice("callClub", "Recommend a conditional trial", "Back the footballer while explicitly attaching medical and workload conditions.", ["Creates an opportunity", "Shows calibrated conviction", "Ties your name to the risk"]),
      choice("verify", "Request load and rehab evidence", "Ask the source to substantiate the return timeline before you interpret the final fade.", ["Clarifies the physical signal", "Costs precious time", "May strain medical access"]),
    ],
    affinityTags: ["evidence-first", "academy-apprentice", "travel-worn", "youth"],
  },
  {
    id: "data-anomaly",
    title: "The Row That Should Not Exist",
    premise: "A low-visibility player keeps appearing at the edge of an analyst's model. The sample is small enough to be signal or noise.",
    sourceArchetype: "analyst",
    venues: [
      { activityType: "databaseQuery", label: "Regional data-room query", setting: "Incomplete event feeds from uneven competitions, normalized just enough to tempt a conclusion." },
      { activityType: "watchVideo", label: "Anomaly video review", setting: "A sequence library assembled from fixed cameras, missing several full matches." },
      { activityType: "deepVideoAnalysis", label: "Model-to-film verification", setting: "The analyst's flags are pinned to clips, but the tactical context must be reconstructed by hand." },
    ],
    pressures: ["The model refresh will expose the same anomaly to subscribed clubs next week.", "The source wants validation; your job is to disprove the pattern before believing it."],
    evidenceFrames: [
      frame(
        { type: "tacticalDecision", quality: 6, attributes: ["offTheBall", "anticipation"], focused: "The clips show {player} arriving early in valuable spaces, though the camera often loses the setup.", peripheral: "The location data is promising; the cause is not yet visible." },
        { type: "technicalAction", quality: 8, attributes: ["passing", "vision", "firstTouch"], focused: "Three separate sequences show {player} receiving on the half-turn and advancing play before pressure sets.", peripheral: "The same efficient action repeats across unrelated clips.", pressure: true },
        { type: "tacticalDecision", quality: 4, attributes: ["decisionMaking", "teamwork"], focused: "When the full phase is restored, one highlighted action ignores a safer teammate and creates the turnover it was credited with escaping.", peripheral: "A celebrated data point looks less intelligent in its full context." },
      ),
      frame(
        { type: "physicalTest", quality: 6, attributes: ["stamina", "pace"], focused: "{player}'s high-intensity actions persist late, but the feed covers only matches the team controlled.", peripheral: "The endurance pattern is real inside a suspiciously favorable sample." },
        { type: "tacticalDecision", quality: 9, attributes: ["pressing", "anticipation", "teamwork"], focused: "The event chain confirms {player} creates pressure outcomes that are credited to the teammate making the tackle.", peripheral: "The model undervalues the action that starts the defensive win." },
        { type: "technicalAction", quality: 4, attributes: ["firstTouch", "composure"], focused: "Against the only high press in the sample, {player}'s first touch repeatedly narrows the available exit.", peripheral: "The small sample contains one opponent that changes the entire interpretation.", pressure: true },
      ),
    ],
    contradictions: ["The repeatable pattern survives film review, but only inside a narrow competition sample.", "The model misses the player's defensive value and may also hide a pressure weakness."],
    deadlines: ["The database publishes its next ranking in six days.", "The analyst will share the query with another scout if you do not act this week."],
    stakeholderConflicts: ["The analyst wants the model credited; the live network distrusts players discovered by spreadsheet.", "A club wants an answer now, but the evidence argues for a different observation context."],
    choices: [
      choice("protect", "Keep the anomaly off the market", "Preserve the query and schedule live verification in the missing context.", ["Protects informational edge", "Targets the real uncertainty", "Allows others to refresh the model"]),
      choice("callClub", "Pitch the pattern, not the player", "Tell a club what repeats and exactly what remains unverified.", ["Turns data into action", "Maintains calibrated confidence", "Invites scrutiny of your source"]),
      choice("verify", "Commission the hostile-context sample", "Ask the analyst for matches against pressure before you treat efficiency as ability.", ["Tests the main weakness", "Improves causal evidence", "Costs the early window"]),
    ],
    affinityTags: ["video-analyst", "data", "evidence-first", "contrarian-eye"],
  },
  {
    id: "agent-exaggeration",
    title: "The Agent's Best Player",
    premise: "An agent promises a hidden elite prospect and exclusive access. Every claim is plausible; none is independent.",
    sourceArchetype: "agent",
    venues: [
      { activityType: "agentShowcase", label: "Private agent showcase", setting: "A curated session where every drill is built to flatter the invited players." },
      { activityType: "followUpSession", label: "Agent evidence review", setting: "Edited clips, selective references, and a contract timeline presented as football evidence." },
    ],
    pressures: ["The agent links access to a promise that you will make a club call.", "Another client is included in the package, turning one judgment into a relationship negotiation."],
    evidenceFrames: [
      frame(
        { type: "technicalAction", quality: 8, attributes: ["firstTouch", "dribbling", "finishing"], focused: "The curated sequence lets {player} receive on the strong side and finish without defensive contact.", peripheral: "The player delivers exactly the highlight the showcase was designed to produce." },
        { type: "tacticalDecision", quality: 5, attributes: ["offTheBall", "teamwork"], focused: "When the drill becomes less scripted, {player} occupies a teammate's lane twice.", peripheral: "The polished individual actions stop fitting the team shape." },
        { type: "mentalResponse", quality: 4, attributes: ["composure", "workRate"], focused: "After one poor touch, {player} looks to the agent before reacting to the turnover.", peripheral: "The player's response is directed toward the sideline, not the next action.", pressure: true },
      ),
      frame(
        { type: "characterReveal", quality: 5, attributes: ["professionalism", "consistency"], focused: "{source} describes flawless habits but cannot name the coach responsible for the daily work.", peripheral: "The strongest character claim lacks a verifiable witness." },
        { type: "technicalAction", quality: 9, attributes: ["passing", "vision", "firstTouch"], focused: "An unplanned broken drill gives {player} one chaotic possession, and the solution is genuinely exceptional.", peripheral: "The best action happens after the showcase structure fails." },
        { type: "mentalResponse", quality: 3, attributes: ["leadership", "composure"], focused: "Asked to repeat the decision, {player} forces the same pass and blames the runner.", peripheral: "The attempt to reproduce the highlight reveals a very different response.", pressure: true },
      ),
    ],
    contradictions: ["The showcase is manipulative, but one unscripted action survives that criticism.", "The agent's character story is weak; the player's football signal is not automatically false because of it."],
    deadlines: ["The agent's exclusivity expires at midnight.", "A representation decision tomorrow could remove direct access entirely."],
    stakeholderConflicts: ["The agent wants a transaction; the coach wants the player's development discussed without promises.", "Rejecting the sales pitch may cost access to the player and the rest of the agent's network."],
    choices: [
      choice("protect", "Refuse the package deal", "Keep the player's name private and seek an independent football context.", ["Avoids agent leverage", "Protects judgment quality", "May end access"]),
      choice("callClub", "Make a conditional introduction", "Call a club while separating the observed signal from the agent's claims.", ["Uses the exclusive window", "Creates clear caveats", "Rewards the pressure tactic"]),
      choice("verify", "Name the witness you need", "Ask the agent for a coach, full match, and setback example before continuing.", ["Tests source credibility", "May unlock better evidence", "The agent can walk away"]),
    ],
    affinityTags: ["former-player", "relationships-first", "fragile-network", "move-before-market"],
  },
  {
    id: "international-limited-access",
    title: "One Match, Another Football Language",
    premise: "A regional fixer secures a single observation window abroad. You have no second match, limited context, and a local club controlling access.",
    sourceArchetype: "regional-fixer",
    venues: [
      { activityType: "youthTournament", label: "International youth group match", setting: "An unfamiliar competition, compressed schedule, and local staff who decide who enters the training ground." },
      { activityType: "scoutingMission", label: "Limited-access regional mission", setting: "One credential covers one match before the delegation moves to another city." },
      { activityType: "youthFestival", label: "Cross-border youth festival", setting: "Mixed-age teams and unfamiliar tactical conventions make direct comparison dangerous." },
    ],
    pressures: ["Travel removes the option to observe again next week.", "The local club suspects foreign recruitment interest and may close the training access."],
    evidenceFrames: [
      frame(
        { type: "tacticalDecision", quality: 6, attributes: ["positioning", "teamwork"], focused: "{player} holds an unfamiliar wide role faithfully, though it suppresses the actions your source described.", peripheral: "The tipped player appears disciplined inside a role that reveals very little." },
        { type: "technicalAction", quality: 9, attributes: ["firstTouch", "passing", "vision"], focused: "A rare central rotation gives {player} one possession facing forward, and three defenders are removed in two touches.", peripheral: "One positional change reveals a different footballer for a few seconds." },
        { type: "mentalResponse", quality: 4, attributes: ["teamwork", "composure"], focused: "When instructions change again, {player} argues with the bench and misses the next transition.", peripheral: "The tactical change produces visible frustration and a costly delay.", pressure: true },
      ),
      frame(
        { type: "physicalTest", quality: 6, attributes: ["agility", "balance"], focused: "On a dry, uneven surface, {player} adjusts stride earlier than teammates and stays available.", peripheral: "The player seems unusually comfortable with poor footing." },
        { type: "tacticalDecision", quality: 8, attributes: ["anticipation", "offTheBall", "vision"], focused: "{player} repeatedly moves before the team's slower circulation can reward the run.", peripheral: "The best movement is consistently a pass too early for this team." },
        { type: "technicalAction", quality: 4, attributes: ["crossing", "decisionMaking"], focused: "Forced into the final action, {player} delivers early without checking the box.", peripheral: "The player's repeated final ball never finds the expected runner." },
      ),
    ],
    contradictions: ["The role hides the player's strengths, but the reaction to tactical change raises an adaptation question.", "The movement may be ahead of the team or disconnected from it; one match cannot settle the difference."],
    deadlines: ["Your credential expires when tonight's delegation list is signed.", "The fixer can arrange one call before you leave the country tomorrow."],
    stakeholderConflicts: ["The local club wants development compensation respected; the foreign buyer wants discreet early access.", "The fixer expects reciprocity, while your home contact expects exclusivity."],
    choices: [
      choice("protect", "Leave without leaving a trail", "Protect the fixer and plan a different-context return through another route.", ["Preserves regional access", "Avoids a rushed cross-cultural read", "May never regain the window"]),
      choice("callClub", "Make the cross-border call", "Recommend immediate due diligence while being explicit about role and adaptation uncertainty.", ["Acts inside the window", "Starts complex stakeholder work", "Amplifies limited evidence"]),
      choice("verify", "Use the local football language", "Ask the fixer to test your interpretation with the coach who assigned the role.", ["Adds tactical context", "Builds regional knowledge", "Exposes outside interest"]),
    ],
    affinityTags: ["regional", "adaptability", "relationships-first", "travel-worn"],
  },
  {
    id: "contradictory-sources",
    title: "Two Trusted People, Two Different Players",
    premise: "A coach calls the prospect unusually mature. A local organizer says the same player disappears when things turn difficult.",
    sourceArchetype: "split-network",
    venues: [
      { activityType: "followUpSession", label: "Split-source follow-up", setting: "Separate conversations are scheduled thirty minutes apart so neither source can shape the other's account." },
      { activityType: "parentCoachMeeting", label: "Coach and community debrief", setting: "The football evidence and the local history sit in the same room but do not agree." },
    ],
    pressures: ["Choosing which account to privilege will be remembered by both contacts.", "The contradiction concerns character, where a single confident answer is least defensible."],
    evidenceFrames: [
      frame(
        { type: "characterReveal", quality: 6, attributes: ["professionalism", "leadership"], focused: "The coach gives a dated example of {player} leading an extra session after a team defeat.", peripheral: "One source offers specific evidence for maturity." },
        { type: "mentalResponse", quality: 7, attributes: ["composure", "bigGameTemperament"], focused: "The organizer describes {player} asking to leave two local finals early after mistakes.", peripheral: "A second trusted source offers equally specific evidence in the opposite direction.", pressure: true },
        { type: "characterReveal", quality: 4, attributes: ["consistency", "professionalism"], focused: "The dates overlap: the extra academy work came after withdrawing from the community match.", peripheral: "The conflicting stories may both be accurate parts of the same response." },
      ),
      frame(
        { type: "characterReveal", quality: 5, attributes: ["leadership", "teamwork"], focused: "The coach calls {player} quiet but influential; the organizer calls the same silence disengagement.", peripheral: "Both sources interpret the same behavior through different expectations." },
        { type: "mentalResponse", quality: 8, attributes: ["composure", "decisionMaking"], focused: "A recent message from {player} takes responsibility for a poor game without accepting the organizer's account of why.", peripheral: "The player's own account is thoughtful and self-protective at the same time." },
        { type: "characterReveal", quality: 4, attributes: ["composure", "consistency"], focused: "Every positive example comes from the academy; every negative one comes from the community environment.", peripheral: "The contradiction may be context dependence rather than dishonesty." },
      ),
    ],
    contradictions: ["Both sources may be reliable because the player behaves differently across environments.", "The disagreement is not about events but about what the same behavior means."],
    deadlines: ["One source expects your answer before agreeing to another introduction.", "The academy review meets this week and will ask which account you believe."],
    stakeholderConflicts: ["Backing the coach risks losing grassroots trust; backing the organizer risks losing academy access.", "The player deserves contextual judgment, while both contacts want their judgment validated."],
    choices: [
      choice("protect", "Refuse to choose a winner", "Preserve both relationships and design an observation that tests the context split.", ["Avoids false certainty", "Creates a stronger hypothesis", "Frustrates both sources"]),
      choice("callClub", "Report the contradiction itself", "Tell a club the split is a material risk requiring a structured trial.", ["Turns uncertainty into a plan", "Shows calibrated judgment", "Makes both accounts visible"]),
      choice("verify", "Put the timelines side by side", "Ask each source to respond to the other's dated evidence without naming the person.", ["Tests factual reliability", "May resolve the split", "Risks relationship damage"]),
    ],
    affinityTags: ["evidence-first", "relationships-first", "stubborn-convictions", "youth"],
  },
  {
    id: "club-deadline",
    title: "An Answer by Morning",
    premise: "A recruitment executive has one academy place left and asks for a recommendation before the formal process can catch up.",
    sourceArchetype: "recruitment-executive",
    venues: [
      { activityType: "academyTrialDay", label: "Final academy assessment", setting: "The last trial group trains under staff who already know there is only one place." },
      { activityType: "youthFestival", label: "Deadline scouting fixture", setting: "A single festival match is the only live evidence before the executive's budget meeting." },
      { activityType: "schoolMatch", label: "Emergency evening watch", setting: "The club needs a decision before the player's school match has finished uploading." },
    ],
    pressures: ["Waiting is a decision: the academy place will be used elsewhere.", "The executive wants a yes or no, while the evidence supports conditions and uncertainty."],
    evidenceFrames: [
      frame(
        { type: "technicalAction", quality: 6, attributes: ["firstTouch", "passing"], focused: "{player} handles routine possession cleanly but creates little separation from the trial group.", peripheral: "The target looks competent rather than decisive." },
        { type: "mentalResponse", quality: 9, attributes: ["composure", "leadership", "decisionMaking"], focused: "When the trial becomes tense, {player} slows one restart, gives two clear instructions, and restores the team's shape.", peripheral: "The player changes the rhythm of the group without a highlight action.", pressure: true },
        { type: "technicalAction", quality: 4, attributes: ["finishing", "composure"], focused: "The only clear chance arrives late, and {player} finishes hurriedly.", peripheral: "The deadline seems to enter the player's final action." },
      ),
      frame(
        { type: "tacticalDecision", quality: 6, attributes: ["positioning", "teamwork"], focused: "{player} immediately understands the staff's unfamiliar pressing rule and helps a teammate adjust.", peripheral: "The target makes the trial structure function sooner than expected." },
        { type: "physicalTest", quality: 8, attributes: ["stamina", "workRate"], focused: "Across repeated short blocks, {player}'s decisions remain available after others begin forcing actions.", peripheral: "The player becomes more visible as the trial group tires." },
        { type: "tacticalDecision", quality: 4, attributes: ["vision", "decisionMaking"], focused: "Asked to create against a set block, {player} circulates safely and never attempts the difficult pass.", peripheral: "The reliable trial performance never answers the upside question." },
      ),
    ],
    contradictions: ["The player may improve the academy environment immediately without being its highest-upside option.", "The pressure response is encouraging; the creative ceiling is still untested."],
    deadlines: ["The executive's decision call is at 08:30 tomorrow.", "The final academy place expires when the board packet is submitted tonight."],
    stakeholderConflicts: ["The executive needs decisiveness; the academy coach wants a longer development comparison.", "A conditional answer protects your judgment but may be unusable to the person making the decision."],
    choices: [
      choice("protect", "Decline the forced verdict", "Keep the relationship honest and recommend no action without the missing evidence.", ["Protects calibration", "May earn long-term respect", "The place goes elsewhere"]),
      choice("callClub", "Give the answer they can use", "Recommend the player now, naming the exact role and unresolved risk.", ["Meets the decision window", "Stakes your reputation", "Owns the downside"]),
      choice("verify", "Spend the final hour on one question", "Ask the source for the comparison evidence that matters most before calling back.", ["Targets the key uncertainty", "Uses the whole deadline", "May return no answer"]),
    ],
    affinityTags: ["move-before-market", "former-player", "unknown-quantity", "club"],
  },
] as const;

const TEMPLATE_BY_ID = new Map(
  VETERAN_PROLOGUE_TEMPLATES.map((template) => [template.id, template] as const),
);

function personaFingerprint(persona: VeteranScoutPersona): string {
  return [
    persona.specialization ?? "any",
    persona.careerPath ?? "any",
    persona.originId ?? "no-origin",
    persona.flawId ?? "no-flaw",
    [...(persona.doctrineIds ?? [])].sort().join(",") || "no-doctrine",
    persona.nationality?.trim().toLowerCase() || "no-nationality",
    persona.startingCountry?.trim().toLowerCase() || "no-country",
  ].join("|");
}

function personaTags(persona: VeteranScoutPersona): Set<string> {
  return new Set([
    persona.specialization,
    persona.careerPath,
    persona.originId,
    persona.flawId,
    ...(persona.doctrineIds ?? []),
  ].filter((tag): tag is string => Boolean(tag)));
}

/**
 * Select a scenario deterministically. The recent-history exclusion lets a
 * profile prevent immediate repeats without making the world seed irrelevant.
 */
export function selectVeteranPrologueTemplate(input: {
  worldSeed: string;
  persona?: VeteranScoutPersona;
  recentTemplateIds?: readonly string[];
}): VeteranPrologueTemplateId {
  const persona = input.persona ?? {};
  const recent = new Set(input.recentTemplateIds?.slice(-3) ?? []);
  const unrepeated = VETERAN_PROLOGUE_TEMPLATES.filter((template) => !recent.has(template.id));
  const pool = unrepeated.length >= 4 ? unrepeated : [...VETERAN_PROLOGUE_TEMPLATES];
  const tags = personaTags(persona);
  const rng = createRNG(`veteran-prologue:template:${input.worldSeed}:${personaFingerprint(persona)}`);

  return rng.pickWeighted(pool.map((template) => ({
    item: template.id,
    weight: 1 + template.affinityTags.reduce(
      (bonus, tag) => bonus + (tags.has(tag) ? 0.85 : 0),
      0,
    ),
  })));
}

function replaceTokens(text: string, input: {
  playerName: string;
  sourceName: string;
  venue: string;
}): string {
  return text
    .replaceAll("{player}", input.playerName)
    .replaceAll("{source}", input.sourceName)
    .replaceAll("{venue}", input.venue);
}

function choiceEffect(id: OpeningCaseChoiceId): string {
  if (id === "protect") {
    return "Keeps visibility low and protects source trust while the opportunity clock continues.";
  }
  if (id === "callClub") {
    return "Raises visibility and stakes your reputation behind an early recommendation.";
  }
  return "Opens an additional evidence route but spends scarce time and information control.";
}

type VeteranLeadOutcomeBand = "breakout" | "ambiguous" | "false-positive";

const LEAD_OUTCOME_WEIGHTS: Partial<Record<VeteranPrologueTemplateId, Record<VeteranLeadOutcomeBand, number>>> = {
  "released-academy-player": { breakout: 0.36, ambiguous: 0.49, "false-positive": 0.15 },
  "injury-return": { breakout: 0.32, ambiguous: 0.53, "false-positive": 0.15 },
  "data-anomaly": { breakout: 0.38, ambiguous: 0.47, "false-positive": 0.15 },
  "agent-exaggeration": { breakout: 0.22, ambiguous: 0.40, "false-positive": 0.38 },
  "contradictory-sources": { breakout: 0.30, ambiguous: 0.55, "false-positive": 0.15 },
  "club-deadline": { breakout: 0.28, ambiguous: 0.52, "false-positive": 0.20 },
};

function selectVeteranLead(input: {
  seed: string;
  templateId: VeteranPrologueTemplateId;
  unsignedYouth: Record<string, UnsignedYouth>;
  preferredCountry?: string;
}): { lead: UnsignedYouth; candidates: UnsignedYouth[] } | null {
  const eligible = Object.values(input.unsignedYouth)
    .filter((youth) => !youth.placed && !youth.retired && youth.player.age <= 17);
  const localCandidates = input.preferredCountry
    ? eligible.filter((youth) => youth.country.toLowerCase() === input.preferredCountry?.toLowerCase())
    : [];
  const candidates = localCandidates.length >= 4 ? localCandidates : eligible;
  if (candidates.length === 0) return null;

  // Hidden ability is used only to construct a varied career truth. Nothing
  // about this band or its values is copied into the player-facing case.
  const ranked = [...candidates].sort((left, right) =>
    right.player.potentialAbility - left.player.potentialAbility
    || left.visibility - right.visibility
    || left.player.id.localeCompare(right.player.id)
  );
  const rng = createRNG(`veteran-prologue:lead:${input.seed}:${input.templateId}`);
  const weights = LEAD_OUTCOME_WEIGHTS[input.templateId]
    ?? { breakout: 0.40, ambiguous: 0.45, "false-positive": 0.15 };
  const outcomeBand = rng.pickWeighted<VeteranLeadOutcomeBand>([
    { item: "breakout", weight: weights.breakout },
    { item: "ambiguous", weight: weights.ambiguous },
    { item: "false-positive", weight: weights["false-positive"] },
  ]);
  const count = ranked.length;
  const highEnd = Math.max(1, Math.ceil(count * 0.25));
  const lowStart = Math.min(count - 1, Math.max(highEnd, Math.floor(count * 0.7)));
  const middleEnd = Math.max(highEnd + 1, lowStart);
  const window = outcomeBand === "breakout"
    ? ranked.slice(0, highEnd)
    : outcomeBand === "ambiguous"
      ? ranked.slice(highEnd, middleEnd)
      : ranked.slice(lowStart);
  return { lead: rng.pick(window.length > 0 ? window : ranked), candidates };
}

/**
 * Build a replayable opening around the same real, consequence-tracked lead
 * used by the authored first-career case. Returned data is deliberately safe
 * for UI projection: no attributes, current ability, or potential ability are
 * copied into the prologue.
 */
export function createVeteranPrologueCase(input: {
  seed: string;
  scout: Scout;
  unsignedYouth: Record<string, UnsignedYouth>;
  contacts: GameState["contacts"];
  youthRecruitmentBriefs: GameState["youthRecruitmentBriefs"];
  preferredCountry?: string;
  week: number;
  season: number;
  persona?: VeteranScoutPersona;
  recentTemplateIds?: readonly string[];
  templateId?: VeteranPrologueTemplateId;
}): VeteranPrologueCase | null {
  const templateId = input.templateId ?? selectVeteranPrologueTemplate({
    worldSeed: input.seed,
    persona: input.persona,
    recentTemplateIds: input.recentTemplateIds,
  });
  const template = TEMPLATE_BY_ID.get(templateId);
  if (!template) return null;
  const authoredSkeleton = createOpeningCase(input);
  const veteranSelection = selectVeteranLead({
    seed: input.seed,
    templateId,
    unsignedYouth: input.unsignedYouth,
    preferredCountry: input.preferredCountry,
  });
  if (!authoredSkeleton || !veteranSelection) return null;
  const { lead, candidates } = veteranSelection;
  const sameArea = candidates.filter((candidate) =>
    candidate.id !== lead.id
    && (candidate.regionId === lead.regionId || candidate.country === lead.country)
  );
  const fallback = candidates.filter((candidate) => candidate.id !== lead.id);
  const supporting = createRNG(`veteran-prologue:cast:${input.seed}:${templateId}`)
    .shuffle(sameArea.length >= 3 ? sameArea : fallback)
    .slice(0, 3);
  const openingCase: OpeningCaseState = {
    ...authoredSkeleton,
    id: `${OPENING_CASE_ACTIVITY_PREFIX}:${input.scout.id}:${lead.player.id}`,
    youthId: lead.id,
    playerId: lead.player.id,
    playerPoolIds: [lead.player.id, ...supporting.map((candidate) => candidate.player.id)],
  };

  const variationRng = createRNG(
    `veteran-prologue:compose:${input.seed}:${personaFingerprint(input.persona ?? {})}:${templateId}`,
  );
  const venue = variationRng.pick(template.venues);
  const pressure = variationRng.pick(template.pressures);
  const evidenceFrame = variationRng.pick(template.evidenceFrames);
  const contradiction = variationRng.pick(template.contradictions);
  const deadline = variationRng.pick(template.deadlines);
  const stakeholderConflict = variationRng.pick(template.stakeholderConflicts);
  const playerName = `${lead.player.firstName} ${lead.player.lastName}`;
  const tokens = {
    playerName,
    sourceName: openingCase.sourceContactName,
    venue: venue.label,
  };
  const evidenceBeats = evidenceFrame.map((beat) => ({
    type: beat.type,
    quality: beat.quality,
    attributesHinted: [...beat.attributes] as [PlayerAttribute, ...PlayerAttribute[]],
    focused: replaceTokens(beat.focused, tokens),
    peripheral: replaceTokens(beat.peripheral, tokens),
    ...(beat.pressure === undefined ? {} : { pressure: beat.pressure }),
  })) as unknown as VeteranPrologueCase["evidenceBeats"];
  const activityInstanceId = `${openingCase.id}:veteran:${template.id}`;

  return {
    openingCase,
    id: openingCase.id,
    playerId: openingCase.playerId,
    playerPoolIds: [...openingCase.playerPoolIds],
    sourceContactId: openingCase.sourceContactId,
    briefId: openingCase.briefId,
    clubId: openingCase.clubId,
    templateId,
    title: template.title,
    premise: template.premise,
    activityType: venue.activityType,
    activityInstanceId,
    venueLabel: venue.label,
    setting: venue.setting,
    sourceArchetype: template.sourceArchetype,
    sourceContactName: openingCase.sourceContactName,
    pressure,
    evidenceBeats,
    contradiction,
    deadline,
    stakeholderConflict,
    choices: template.choices.map((option) => ({
      ...option,
      knownTradeoffs: [...option.knownTradeoffs] as [string, string, string],
      effect: choiceEffect(option.id),
    })) as unknown as VeteranPrologueCase["choices"],
    presentation: {
      eyebrow: "A fresh lead",
      venue: venue.label,
      headline: template.title,
      uncertainty: contradiction,
      signalLabel: template.sourceArchetype === "analyst" ? "Pattern to test" : "Signal to test",
      questionLabel: "What do you do before the window closes?",
      background: `${venue.setting} ${stakeholderConflict}`,
    },
    player: {
      id: lead.player.id,
      name: playerName,
      age: lead.player.age,
      position: lead.player.position,
      country: lead.country,
    },
    variationKey: `${template.id}:${venue.activityType}:${evidenceFrame === template.evidenceFrames[0] ? 0 : 1}:${deadline}`,
  };
}

export { shapeVeteranPrologueSession } from "./veteranPrologueSession";

/** Resolve the full template for player-safe UI copy without creating a case. */
export function getVeteranPrologueTemplate(
  id: VeteranPrologueTemplateId,
): Readonly<Pick<VeteranPrologueTemplateDefinition,
  "id" | "title" | "premise" | "sourceArchetype" | "affinityTags">> | undefined {
  return TEMPLATE_BY_ID.get(id);
}
