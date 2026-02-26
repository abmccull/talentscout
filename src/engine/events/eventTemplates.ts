/**
 * Narrative event template definitions.
 *
 * Each template describes one of the NarrativeEventType variants:
 * its title, a context-driven description factory, a prerequisites guard
 * that checks whether the current game state makes the event plausible,
 * and optional player choices.
 *
 * Templates are pure data — no side effects, no RNG calls.
 * The narrative events module consumes them to generate concrete events.
 */

import type { GameState, NarrativeEventType } from "@/engine/core/types";

// =============================================================================
// EventContext — fields extracted from GameState for template rendering
// =============================================================================

/**
 * Contextual data extracted from GameState before a template's
 * descriptionTemplate is called.  All fields are optional so templates
 * can degrade gracefully when context is thin.
 */
export interface EventContext {
  /** Name of a related player (e.g. the player being poached). */
  playerName?: string;
  /** Name of a related club. */
  clubName?: string;
  /** Name of a related contact. */
  contactName?: string;
  /** Name of the rival scout involved. */
  rivalName?: string;
  /** The scout's current career tier (1–5). */
  careerTier?: number;
  /** The scout's current reputation (0–100). */
  reputation?: number;
}

// =============================================================================
// EventTemplate interface
// =============================================================================

export interface EventTemplate {
  /** Which NarrativeEventType this template instantiates. */
  type: NarrativeEventType;
  /** Short headline shown in the inbox list. */
  titleTemplate: string;
  /** Generates the full event description given contextual data. */
  descriptionTemplate: (context: EventContext) => string;
  /**
   * Returns true when the current game state makes this event plausible.
   * Called during weekly event generation to filter the eligible pool.
   */
  prerequisites: (state: GameState) => boolean;
  /** Optional player-facing choices. Each item has a label and an effect tag. */
  choices?: ReadonlyArray<{ label: string; effect: string }>;
}

// =============================================================================
// Helper — pick a display name for the first submitted-report player
// =============================================================================

function firstReportPlayerName(state: GameState): string {
  const reportIds = Object.keys(state.reports);
  if (reportIds.length === 0) return "the player";
  const report = state.reports[reportIds[0]];
  const player = state.players[report.playerId];
  if (!player) return "the player";
  return `${player.firstName} ${player.lastName}`;
}

function firstObservationPlayerName(state: GameState): string {
  const obsIds = Object.keys(state.observations);
  if (obsIds.length === 0) return "the player";
  const obs = state.observations[obsIds[0]];
  const player = state.players[obs.playerId];
  if (!player) return "the player";
  return `${player.firstName} ${player.lastName}`;
}

function firstAgentContactName(state: GameState): string {
  const agent = Object.values(state.contacts).find((c) => c.type === "agent");
  return agent ? agent.name : "an agent";
}

function firstHighRelationshipContactName(state: GameState): string {
  const contact = Object.values(state.contacts).find(
    (c) => c.relationship >= 50,
  );
  return contact ? contact.name : "a trusted contact";
}

/** Returns a contact name with relationship > 70, or a fallback string. */
function firstVeryTrustedContactName(state: GameState): string {
  const contact = Object.values(state.contacts).find(
    (c) => c.relationship > 70,
  );
  return contact ? contact.name : "an old friend in the game";
}

/** Returns the first contact of any type, for narrative variety. */
function anyContactName(state: GameState): string {
  const contacts = Object.values(state.contacts);
  if (contacts.length === 0) return "a contact";
  return contacts[0].name;
}

/** Returns the name of a report player older than 10 weeks (for hiddenGemVindication). */
function oldReportPlayerName(state: GameState): string {
  const cutoff = state.currentWeek - 10;
  const report = Object.values(state.reports).find(
    (r) => r.submittedWeek <= cutoff,
  );
  if (!report) return "a player you scouted months ago";
  const player = state.players[report.playerId];
  if (!player) return "a player you scouted months ago";
  return `${player.firstName} ${player.lastName}`;
}

/** Returns the name of a report player with conviction >= recommend. */
function recommendedReportPlayerName(state: GameState): string {
  const report = Object.values(state.reports).find(
    (r) => r.conviction === "recommend" || r.conviction === "strongRecommend" || r.conviction === "tablePound",
  );
  if (!report) return "one of your recommended players";
  const player = state.players[report.playerId];
  if (!player) return "one of your recommended players";
  return `${player.firstName} ${player.lastName}`;
}

/** Returns the name of a youth player from unsignedYouth, or a fallback. */
function firstUnsignedYouthName(state: GameState): string {
  const youth = Object.values(state.unsignedYouth)[0];
  if (!youth) return "a promising youngster";
  return `${youth.player.firstName} ${youth.player.lastName}`;
}

/** Returns the name of a player from alumniRecords, or a fallback. */
function firstAlumniPlayerName(state: GameState): string {
  if (state.alumniRecords.length === 0) return "one of your placed players";
  const record = state.alumniRecords[0];
  const player = state.players[record.playerId];
  if (!player) return "one of your placed players";
  return `${player.firstName} ${player.lastName}`;
}

// =============================================================================
// Template definitions — original 8
// =============================================================================

const rivalPoachTemplate: EventTemplate = {
  type: "rivalPoach",
  titleTemplate: "Rival Poaching Alert",
  descriptionTemplate: (ctx) => {
    const player = ctx.playerName ?? "one of your targets";
    const rival = ctx.rivalName ?? "a rival scout";
    return (
      `Intelligence suggests ${rival} has been spotted watching ${player} ` +
      `at least twice this week. Your report on this player is still pending ` +
      `club review — if the rival gets their recommendation in first, your ` +
      `work could be overlooked entirely. Do you rush your report to get ahead, ` +
      `or trust the process and let events unfold?`
    );
  },
  prerequisites: (state) => Object.keys(state.reports).length > 0,
  choices: [
    { label: "Rush report", effect: "rushReport" },
    { label: "Let it go", effect: "ignore" },
  ],
};

const managerFiredTemplate: EventTemplate = {
  type: "managerFired",
  titleTemplate: "Manager Sacked",
  descriptionTemplate: (ctx) => {
    const club = ctx.clubName ?? "your club";
    return (
      `Breaking news: the manager at ${club} has been relieved of their duties ` +
      `following a run of poor results. The board is searching for a replacement ` +
      `and the scouting department faces an uncertain few weeks. Incoming managers ` +
      `often conduct a full review of existing scouting priorities — your current ` +
      `assignments may be reconsidered. Stay alert for further developments.`
    );
  },
  prerequisites: (state) =>
    state.scout.currentClubId !== undefined &&
    state.scout.careerTier >= 2,
  choices: undefined,
};

const exclusiveTipTemplate: EventTemplate = {
  type: "exclusiveTip",
  titleTemplate: "Exclusive Intel Available",
  descriptionTemplate: (ctx) => {
    const contact = ctx.contactName ?? "a trusted contact";
    return (
      `${contact} has reached out with what they describe as an exclusive tip on ` +
      `a hidden gem currently flying under the radar in the lower divisions. ` +
      `They insist the window to act is narrow — other scouts will pick up the ` +
      `trail within weeks. Investigating will cost you time this week, but the ` +
      `discovery could be career-defining. Your call.`
    );
  },
  prerequisites: (state) =>
    Object.values(state.contacts).some((c) => c.relationship >= 50),
  choices: [
    { label: "Investigate", effect: "investigate" },
    { label: "Ignore", effect: "ignore" },
  ],
};

const debutHatTrickTemplate: EventTemplate = {
  type: "debutHatTrick",
  titleTemplate: "Your Target Scores Debut Hat-Trick",
  descriptionTemplate: (ctx) => {
    const player = ctx.playerName ?? "a player you reported on";
    return (
      `${player} marked their senior debut in spectacular fashion, netting a ` +
      `hat-trick in front of a packed crowd. Your report on this player is now ` +
      `being discussed in the boardroom with fresh urgency. Club executives who ` +
      `initially filed the report away are re-reading every line. Your eye for ` +
      `talent is under the spotlight — and the moment is yours to own.`
    );
  },
  prerequisites: (state) => Object.keys(state.reports).length > 0,
  choices: undefined,
};

const targetInjuredTemplate: EventTemplate = {
  type: "targetInjured",
  titleTemplate: "Scouting Target Injured",
  descriptionTemplate: (ctx) => {
    const player = ctx.playerName ?? "one of your current targets";
    return (
      `Unfortunate news: ${player} has picked up an injury during training and ` +
      `is expected to be sidelined for several weeks. Your active observation ` +
      `programme will need to be paused. Depending on the severity, this could ` +
      `affect the player's form and market value. It may also be an opportunity ` +
      `to assess their recovery professionalism and mental resilience.`
    );
  },
  prerequisites: (state) => Object.keys(state.observations).length > 0,
  choices: undefined,
};

const reportCitedTemplate: EventTemplate = {
  type: "reportCitedInBoardMeeting",
  titleTemplate: "Your Report Cited in Board Meeting",
  descriptionTemplate: (ctx) => {
    const player = ctx.playerName ?? "one of your targets";
    const club = ctx.clubName ?? "the club";
    return (
      `Word has filtered down that your scouting report on ${player} was ` +
      `referenced directly by the chairman during yesterday's board meeting at ` +
      `${club}. Directors praised the depth of analysis and the conviction of ` +
      `your recommendation. This kind of visibility is rare — your standing ` +
      `within the organisation has strengthened considerably as a result.`
    );
  },
  prerequisites: (state) =>
    state.scout.careerTier >= 3 &&
    Object.keys(state.reports).length > 0,
  choices: undefined,
};

const rivalRecruitmentTemplate: EventTemplate = {
  type: "rivalRecruitment",
  titleTemplate: "Rival Club Makes Approach",
  descriptionTemplate: (ctx) => {
    const club = ctx.clubName ?? "a rival club";
    const reputation = ctx.reputation ?? 0;
    return (
      `${club} has made a discreet enquiry about your availability. Your ` +
      `reputation of ${reputation} has clearly attracted attention beyond your ` +
      `current employer. The approach is flattering, but accepting could burn ` +
      `bridges and complicate your standing here. A polite decline might also ` +
      `strengthen your hand in any upcoming contract negotiations. How you ` +
      `handle this could define your next career chapter.`
    );
  },
  prerequisites: (state) => state.scout.reputation >= 40,
  choices: [
    { label: "Engage with the approach", effect: "engage" },
    { label: "Decline politely", effect: "decline" },
  ],
};

const agentDeceptionTemplate: EventTemplate = {
  type: "agentDeception",
  titleTemplate: "Agent Gives Misleading Information",
  descriptionTemplate: (ctx) => {
    const agent = ctx.contactName ?? "an agent";
    return (
      `${agent} provided you with glowing information about a client's form, ` +
      `fitness, and contract situation — but multiple details have since proven ` +
      `inaccurate or exaggerated. It appears the agent was managing perceptions ` +
      `rather than sharing facts. This kind of deception is common in the ` +
      `business, but it underlines the importance of cross-referencing tips ` +
      `with independent observations before committing to a recommendation.`
    );
  },
  prerequisites: (state) =>
    Object.values(state.contacts).some((c) => c.type === "agent"),
  choices: undefined,
};

/**
 * rivalPoachBid — generated when a rival completes a signing of a player
 * the scout has already reported on. The scout can counter-bid or concede.
 * Note: this template is NOT included in the random event pool (EVENT_TEMPLATES)
 * because it is generated deterministically by the rival system, not by the
 * weekly random event roll.
 */
export const rivalPoachBidTemplate: EventTemplate = {
  type: "rivalPoachBid",
  titleTemplate: "Rival Poach Alert",
  descriptionTemplate: (ctx) => {
    const player = ctx.playerName ?? "a player you reported on";
    const rival = ctx.rivalName ?? "A rival scout";
    return (
      `${rival} has signed ${player} — a player you previously reported on. ` +
      `You can counter-bid or let them go. A counter-bid costs 50% more than ` +
      `market value and has a limited chance of success based on your reputation.`
    );
  },
  prerequisites: (state) => Object.keys(state.reports).length > 0,
  choices: [
    { label: "Counter-Bid", effect: "counterBid" },
    { label: "Concede", effect: "concede" },
  ],
};

// =============================================================================
// Template definitions — Scout Personal Life (6 new)
// =============================================================================

const burnoutTemplate: EventTemplate = {
  type: "burnout",
  titleTemplate: "On the Edge of Burnout",
  descriptionTemplate: (_ctx) =>
    "Weeks of relentless travel, late nights in damp stadiums, and the " +
    "constant pressure of delivering results have finally caught up with you. " +
    "Your concentration is slipping mid-match and your notes are getting " +
    "sloppy — telltale signs that your body and mind are crying out for rest. " +
    "Pushing through might cost you accuracy on your next report; stepping " +
    "back for a week could restore the sharp instincts that make you effective.",
  prerequisites: (state) => state.scout.fatigue > 80,
  choices: [
    { label: "Take a rest week", effect: "burnoutRest" },
    { label: "Push through", effect: "burnoutPush" },
  ],
};

const familyEmergencyTemplate: EventTemplate = {
  type: "familyEmergency",
  titleTemplate: "Family Emergency",
  descriptionTemplate: (_ctx) =>
    "A call from home has stopped you in your tracks. Someone close to you " +
    "needs your support and the situation cannot wait. The professional in you " +
    "wants to file the week's notes before leaving, but the human in you " +
    "knows where you're needed most. Scouting can always wait; some moments " +
    "cannot be reclaimed. How you respond will stay with you long after the " +
    "final whistle of any match.",
  prerequisites: (_state) => true,
  choices: [
    { label: "Rush home immediately", effect: "familyRushHome" },
    { label: "Stay focused this week", effect: "familyStayFocused" },
  ],
};

const scoutingConferenceTemplate: EventTemplate = {
  type: "scoutingConference",
  titleTemplate: "Scouting Conference Invitation",
  descriptionTemplate: (_ctx) =>
    "An invitation has landed in your inbox: the annual football scouting " +
    "symposium, attended by heads of recruitment from clubs across the " +
    "continent. Panels cover everything from data integration to youth " +
    "development philosophy. The networking alone could open doors that " +
    "years of cold-calling never would. Attendance means sacrificing a week " +
    "of active scouting, but the conversations you'll have could reshape " +
    "your entire approach.",
  prerequisites: (state) => state.scout.reputation > 30,
  choices: [
    { label: "Attend the conference", effect: "conferenceAttend" },
    { label: "Decline the invitation", effect: "conferenceDecline" },
  ],
};

const mentorOfferTemplate: EventTemplate = {
  type: "mentorOffer",
  titleTemplate: "Veteran Scout Offers Mentorship",
  descriptionTemplate: (_ctx) =>
    "A decorated veteran of thirty years in the game has reached out, " +
    "impressed by your work and willing to share what textbooks never teach. " +
    "He speaks of reading a player's character in the warm-up, of knowing " +
    "when a tip is genuine and when it's theatre. Mentorship takes time and " +
    "humility, but the compounding value of a seasoned guide's wisdom is " +
    "impossible to put a number on. This window may not stay open long.",
  prerequisites: (state) => state.currentSeason >= 2,
  choices: [
    { label: "Accept the mentorship", effect: "mentorAccept" },
    { label: "Politely decline", effect: "mentorDecline" },
  ],
};

const mediaInterviewTemplate: EventTemplate = {
  type: "mediaInterview",
  titleTemplate: "Media Interview Request",
  descriptionTemplate: (ctx) => {
    const reputation = ctx.reputation ?? 0;
    return (
      `A prominent football journalist has reached out, citing your reputation ` +
      `of ${reputation} as evidence that you represent the new wave of ` +
      `analytical scouting. They want an in-depth piece — your methods, your ` +
      `philosophy, the players you've backed before anyone else noticed them. ` +
      `Public profile can accelerate a career, but it also invites scrutiny. ` +
      `Every scout you've ever beaten to a discovery will be reading.`
    );
  },
  prerequisites: (state) => state.scout.reputation > 50,
  choices: [
    { label: "Accept the interview", effect: "interviewAccept" },
    { label: "Decline", effect: "interviewDecline" },
  ],
};

const healthScareTemplate: EventTemplate = {
  type: "healthScare",
  titleTemplate: "Health Scare Grounds You",
  descriptionTemplate: (_ctx) =>
    "A dizzy spell during a match observation — followed by a worrying " +
    "conversation with your doctor — has forced a moment of honest " +
    "self-reflection. The lifestyle of a working scout, with its erratic " +
    "hours, poor diet, and chronic sleep debt, extracts a physical toll that " +
    "is easy to ignore until it isn't. You've been cleared to continue, but " +
    "the warning is clear: the body has limits, and ignoring them for long " +
    "enough will eventually make the decision for you.",
  prerequisites: (state) => state.scout.fatigue > 60,
  choices: undefined,
};

// =============================================================================
// Template definitions — Club Drama (6 new)
// =============================================================================

const boardroomCoupTemplate: EventTemplate = {
  type: "boardroomCoup",
  titleTemplate: "Boardroom Power Struggle",
  descriptionTemplate: (ctx) => {
    const club = ctx.clubName ?? "your club";
    return (
      `Behind the scenes at ${club}, a faction of investors has moved to ` +
      `wrest control of the board from the existing chairman. The corridors ` +
      `are alive with rumour and counter-rumour, and department heads are being ` +
      `asked — discreetly — to signal their loyalty. Scouting departments are ` +
      `rarely immune to political upheaval of this kind. Sit tight, stay ` +
      `professional, and let the dust settle before making any bold moves.`
    );
  },
  prerequisites: (state) =>
    state.scout.careerTier >= 3 &&
    state.scout.currentClubId !== undefined,
  choices: undefined,
};

const budgetCutTemplate: EventTemplate = {
  type: "budgetCut",
  titleTemplate: "Scouting Budget Slashed",
  descriptionTemplate: (ctx) => {
    const club = ctx.clubName ?? "the club";
    return (
      `Finance have sent word: the scouting department's travel and expenses ` +
      `budget has been reduced as part of wider belt-tightening at ${club}. ` +
      `Fewer away trips, lower mileage claims, and a push toward video analysis ` +
      `over live attendance are the immediate consequences. For a scout who ` +
      `believes nothing replaces being in the stands, it's a frustrating ` +
      `constraint — but working within limits is itself a form of mastery.`
    );
  },
  prerequisites: (state) =>
    state.scout.careerTier >= 2 &&
    state.scout.currentClubId !== undefined,
  choices: undefined,
};

const scoutingDeptRestructureTemplate: EventTemplate = {
  type: "scoutingDeptRestructure",
  titleTemplate: "Scouting Department Restructured",
  descriptionTemplate: (ctx) => {
    const club = ctx.clubName ?? "the club";
    return (
      `${club} has announced a wholesale restructuring of its scouting ` +
      `operations, shifting toward a centralised model driven by data and ` +
      `analytics. Your current role boundaries are being redrawn, and there's ` +
      `a new reporting line to a technical director who views traditional ` +
      `scouting with polite scepticism. Adapting could position you as a ` +
      `bridge between the old and new approaches; resisting could make you ` +
      `expendable in the next review cycle.`
    );
  },
  prerequisites: (state) => state.scout.careerTier >= 4,
  choices: [
    { label: "Accept the new role structure", effect: "restructureAccept" },
    { label: "Resist the changes", effect: "restructureResist" },
  ],
};

const rivalClubPoachTemplate: EventTemplate = {
  type: "rivalClubPoach",
  titleTemplate: "Rival Club Targets You",
  descriptionTemplate: (ctx) => {
    const club = ctx.clubName ?? "a rival organisation";
    const reputation = ctx.reputation ?? 0;
    return (
      `${club} wants you. Their head of recruitment made a quiet approach this ` +
      `week, citing your reputation of ${reputation} and your track record ` +
      `identifying talent before the market catches on. The package on the ` +
      `table is considerably more attractive than your current terms. You could ` +
      `leverage this to negotiate a raise where you are — or you could simply ` +
      `walk towards a fresh challenge that values what you bring.`
    );
  },
  prerequisites: (state) =>
    state.scout.reputation > 40 &&
    state.scout.currentClubId !== undefined,
  choices: [
    { label: "Negotiate a raise at your club", effect: "poachNegotiate" },
    { label: "Accept the rival offer", effect: "poachAccept" },
    { label: "Stay loyal, decline firmly", effect: "poachStayLoyal" },
  ],
};

const managerSackedTemplate: EventTemplate = {
  type: "managerSacked",
  titleTemplate: "Club Manager Dismissed",
  descriptionTemplate: (ctx) => {
    const club = ctx.clubName ?? "your club";
    return (
      `It's been confirmed: the manager at ${club} has been dismissed with ` +
      `immediate effect following a boardroom vote of no confidence. The timing ` +
      `is brutal — mid-season, with several of your recommendations still under ` +
      `active review. A caretaker has taken temporary charge, and an external ` +
      `appointment is expected within weeks. Every incoming manager brings their ` +
      `own ideas about what makes a scouting department valuable. Brace yourself.`
    );
  },
  prerequisites: (state) =>
    state.scout.careerTier >= 3 &&
    state.scout.currentClubId !== undefined,
  choices: undefined,
};

const clubFinancialTroubleTemplate: EventTemplate = {
  type: "clubFinancialTrouble",
  titleTemplate: "Club in Financial Difficulty",
  descriptionTemplate: (ctx) => {
    const club = ctx.clubName ?? "your club";
    return (
      `Concerning reports have emerged about the financial position of ` +
      `${club}. Outstanding creditor payments and wage deferrals are now ` +
      `being discussed in the press, and the transfer budget for the coming ` +
      `window is understood to be near zero. Your scouting work continues, but ` +
      `the realistic prospect of any recommendation being acted upon has ` +
      `dimmed considerably. Some scouts in this situation begin quietly ` +
      `exploring their options elsewhere.`
    );
  },
  prerequisites: (state) => state.scout.currentClubId !== undefined,
  choices: undefined,
};

// =============================================================================
// Template definitions — Player Stories (8 new)
// =============================================================================

const wonderkidPressureTemplate: EventTemplate = {
  type: "wonderkidPressure",
  titleTemplate: "Wonderkid Crumbling Under Spotlight",
  descriptionTemplate: (ctx) => {
    const player = ctx.playerName ?? "the player you backed so strongly";
    return (
      `${player} — the player you staked your reputation on — is visibly ` +
      `struggling with the weight of expectation since your glowing report ` +
      `circulated the boardroom. The spotlight that follows a big endorsement ` +
      `can crush players who aren't mentally ready for it. You wonder whether ` +
      `your conviction rating inadvertently accelerated a timeline the player ` +
      `wasn't prepared for. It's a reminder that scouting is never just about ` +
      `ability — character and timing matter just as much.`
    );
  },
  prerequisites: (state) =>
    Object.values(state.reports).some((r) => r.conviction === "tablePound"),
  choices: undefined,
};

const playerHomesickTemplate: EventTemplate = {
  type: "playerHomesick",
  titleTemplate: "Scouted Player Struggling with Homesickness",
  descriptionTemplate: (ctx) => {
    const player = ctx.playerName ?? "a player you've been following";
    return (
      `Word has reached you that ${player}, who relocated for their current ` +
      `club, is finding the adjustment harder than expected. A withdrawn ` +
      `demeanour in training, poor sleep, and a visible dip in form suggest ` +
      `the emotional toll of being away from home. You know from experience ` +
      `that environment and mental wellbeing shape performance as profoundly ` +
      `as technical ability. A visit and a conversation could make a genuine ` +
      `difference — or you could let them find their own footing.`
    );
  },
  prerequisites: (state) => Object.keys(state.reports).length > 0,
  choices: [
    { label: "Visit and counsel the player", effect: "homesickVisit" },
    { label: "Let them adapt on their own", effect: "homesickLeave" },
  ],
};

const hiddenGemVindicationTemplate: EventTemplate = {
  type: "hiddenGemVindication",
  titleTemplate: "Early Report Vindicated",
  descriptionTemplate: (ctx) => {
    const player = ctx.playerName ?? "a player you identified early";
    return (
      `${player}, a name you quietly flagged months ago when nobody else was ` +
      `looking, has just signed for a top-flight club for a fee that makes ` +
      `your original assessment look almost prophetic. The football world is ` +
      `suddenly full of people who claim they always knew — but your report ` +
      `carries a timestamp that tells the real story. Moments like this are ` +
      `the reason you do this job.`
    );
  },
  prerequisites: (state) => {
    const cutoff = state.currentWeek - 10;
    return Object.values(state.reports).some((r) => r.submittedWeek <= cutoff);
  },
  choices: undefined,
};

const playerControversyTemplate: EventTemplate = {
  type: "playerControversy",
  titleTemplate: "Player You Scouted Embroiled in Controversy",
  descriptionTemplate: (ctx) => {
    const player = ctx.playerName ?? "a player featured in your reports";
    return (
      `${player} has found themselves at the centre of a media storm following ` +
      `an incident that has raised serious questions about their conduct off ` +
      `the pitch. Your report on this player is on file, and some within the ` +
      `club are asking whether your assessment of their character was thorough ` +
      `enough. Standing by your work signals confidence; distancing yourself ` +
      `signals doubt — neither path is without consequence.`
    );
  },
  prerequisites: (state) => Object.keys(state.reports).length > 0,
  choices: [
    { label: "Publicly stand by your assessment", effect: "controversyStandBy" },
    { label: "Distance yourself from the report", effect: "controversyDistance" },
  ],
};

const youthProdigyDilemmaTemplate: EventTemplate = {
  type: "youthProdigyDilemma",
  titleTemplate: "Youth Prodigy — Where to Place Them?",
  descriptionTemplate: (ctx) => {
    const player = ctx.playerName ?? "the young player you've been watching";
    return (
      `${player} has emerged as one of the most electrifying young talents ` +
      `you've encountered this season. Several clubs are now circling, and ` +
      `the family has asked — discreetly — for your honest recommendation. ` +
      `Your own club would benefit from signing them, but their development ` +
      `might genuinely be better served elsewhere. The choice reflects ` +
      `something fundamental about what kind of scout you are.`
    );
  },
  prerequisites: (state) => Object.keys(state.unsignedYouth).length > 0,
  choices: [
    { label: "Recommend your own club", effect: "prodigyOwnClub" },
    { label: "Recommend the best-fit club", effect: "prodigyBestFit" },
    { label: "Stay neutral and let them decide", effect: "prodigyNeutral" },
  ],
};

const injurySetbackTemplate: EventTemplate = {
  type: "injurySetback",
  titleTemplate: "Recommended Player Suffers Serious Injury",
  descriptionTemplate: (ctx) => {
    const player = ctx.playerName ?? "a player you recommended";
    return (
      `${player}, a player you championed and whose signing is under active ` +
      `consideration, has suffered a serious injury that will sideline them ` +
      `for the foreseeable future. The club's interest has cooled immediately, ` +
      `and your recommendation now feels uncomfortably exposed. It's an ` +
      `occupational hazard of the job — players break down — but the timing ` +
      `is painful and the politics around it will need careful management.`
    );
  },
  prerequisites: (state) =>
    Object.values(state.reports).some(
      (r) => r.conviction === "recommend" || r.conviction === "strongRecommend" || r.conviction === "tablePound",
    ),
  choices: undefined,
};

const debutBrillianceTemplate: EventTemplate = {
  type: "debutBrilliance",
  titleTemplate: "Your Youth Find Shines on Debut",
  descriptionTemplate: (ctx) => {
    const player = ctx.playerName ?? "one of your placed players";
    return (
      `${player}, the young talent you identified and placed, has turned in a ` +
      `debut performance that's being replayed across social media. The manager ` +
      `called it one of the most assured first appearances they'd seen from a ` +
      `youth prospect in years. Your feel for potential — the intangible sense ` +
      `of what a player could become — has just been validated in the most ` +
      `public way possible. The calls from other clubs will follow.`
    );
  },
  prerequisites: (state) => state.alumniRecords.length > 0,
  choices: undefined,
};

const lateBloomingSurpriseTemplate: EventTemplate = {
  type: "lateBloomingSurprise",
  titleTemplate: "Late Bloomer Defies Expectations",
  descriptionTemplate: (ctx) => {
    const player = ctx.playerName ?? "a player buried in your archive";
    return (
      `${player} — a name you filed away months ago with a measured "worth ` +
      `monitoring" note — has suddenly emerged as one of the most improved ` +
      `players in the division. Nobody saw this trajectory coming, which means ` +
      `your early interest, however modest, now looks prescient. The lesson ` +
      `you'll carry forward: late developers reward patience, and no report is ` +
      `ever truly finished until the player's career is.`
    );
  },
  prerequisites: (state) => Object.keys(state.reports).length >= 5,
  choices: undefined,
};

// =============================================================================
// Template definitions — Network Events (6 new)
// =============================================================================

const contactBetrayalTemplate: EventTemplate = {
  type: "contactBetrayal",
  titleTemplate: "Contact Sells Your Information",
  descriptionTemplate: (ctx) => {
    const contact = ctx.contactName ?? "one of your contacts";
    return (
      `It's emerged that ${contact} has been sharing details of your scouting ` +
      `activity — targets, assessments, even your travel schedule — with a ` +
      `rival organisation. The breach of trust is significant, and the damage ` +
      `to your competitive position is real. You have a choice: confront them ` +
      `directly and risk an ugly falling out, or monitor the situation quietly ` +
      `and feed them misinformation until a cleaner exit presents itself.`
    );
  },
  prerequisites: (state) => Object.keys(state.contacts).length >= 3,
  choices: [
    { label: "Confront them directly", effect: "betrayalConfront" },
    { label: "Monitor silently", effect: "betrayalMonitor" },
  ],
};

const exclusiveAccessTemplate: EventTemplate = {
  type: "exclusiveAccess",
  titleTemplate: "Exclusive Training Ground Access Offered",
  descriptionTemplate: (ctx) => {
    const contact = ctx.contactName ?? "a well-placed contact";
    return (
      `${contact} is offering you something rare: unaccompanied access to a ` +
      `club's training facility for a morning session. No other scouts. No PR ` +
      `handlers. Just you, a notebook, and the opportunity to see players in ` +
      `their natural working environment, unguarded and under daily pressure. ` +
      `Observations made at training ground level can reveal character traits ` +
      `and hidden attributes that match footage never shows.`
    );
  },
  prerequisites: (state) =>
    Object.values(state.contacts).some((c) => c.relationship > 70),
  choices: [
    { label: "Attend the session", effect: "accessAttend" },
    { label: "Pass this time", effect: "accessPass" },
  ],
};

const agentDoubleDealingTemplate: EventTemplate = {
  type: "agentDoubleDealing",
  titleTemplate: "Agent Playing Both Sides",
  descriptionTemplate: (ctx) => {
    const agent = ctx.contactName ?? "an agent in your network";
    return (
      `Reliable sources suggest ${agent} is simultaneously negotiating with ` +
      `your club and a direct competitor, playing each party's interest against ` +
      `the other to inflate the fee. It's unethical but not illegal, and it's ` +
      `distressingly common in this industry. You can expose the agent and burn ` +
      `that relationship permanently, or you can use the knowledge quietly to ` +
      `your own advantage. Neither path is entirely clean.`
    );
  },
  prerequisites: (state) => Object.keys(state.contacts).length > 0,
  choices: [
    { label: "Expose the agent", effect: "doubleDealExpose" },
    { label: "Leverage the situation", effect: "doubleDealLeverage" },
  ],
};

const journalistExposeTemplate: EventTemplate = {
  type: "journalistExpose",
  titleTemplate: "Journalist Writing Exposé on Scouting Methods",
  descriptionTemplate: (ctx) => {
    const reputation = ctx.reputation ?? 0;
    return (
      `An investigative journalist is writing a piece on modern scouting — ` +
      `the data, the subjectivity, the political dynamics between scouts and ` +
      `managers. With your reputation at ${reputation}, you're one of the ` +
      `named sources they want to speak to. Cooperating could shape the ` +
      `narrative and earn goodwill; refusing might only make you look like ` +
      `you have something to hide. Either way, your name will likely appear ` +
      `in print before the month is out.`
    );
  },
  prerequisites: (state) => state.scout.reputation > 40,
  choices: [
    { label: "Cooperate with the article", effect: "journalistCooperate" },
    { label: "Refuse to participate", effect: "journalistRefuse" },
  ],
};

const networkExpansionTemplate: EventTemplate = {
  type: "networkExpansion",
  titleTemplate: "Network Grows Organically",
  descriptionTemplate: (ctx) => {
    const reputation = ctx.reputation ?? 0;
    return (
      `Your reputation of ${reputation} has started doing the work for you. ` +
      `Two new contacts — an academy director and a regional coach with eyes ` +
      `across a territory you've long wanted to penetrate — have reached out ` +
      `independently after hearing your name mentioned by mutual acquaintances. ` +
      `In this industry, the best introductions happen organically, built on ` +
      `consistent work over time. You didn't need to chase these connections; ` +
      `they came to you.`
    );
  },
  prerequisites: (state) => state.scout.reputation > 60,
  choices: undefined,
};

const contactRetirementTemplate: EventTemplate = {
  type: "contactRetirement",
  titleTemplate: "Key Contact Retiring",
  descriptionTemplate: (ctx) => {
    const contact = ctx.contactName ?? "one of your most valued contacts";
    return (
      `${contact} has announced they're stepping away from the game after ` +
      `decades in and around the sport. Their departure closes a window into ` +
      `a network of relationships and informal knowledge that took years to ` +
      `build and cannot simply be transferred to someone else. You'll owe it ` +
      `to yourself — and to them — to have a proper conversation before they ` +
      `go, both as a farewell and as a chance to absorb whatever wisdom they're ` +
      `willing to pass on.`
    );
  },
  prerequisites: (state) => Object.keys(state.contacts).length >= 2,
  choices: undefined,
};

// =============================================================================
// Template definitions — Industry Events (6 new)
// =============================================================================

const transferRuleChangeTemplate: EventTemplate = {
  type: "transferRuleChange",
  titleTemplate: "New Transfer Regulations Announced",
  descriptionTemplate: (_ctx) =>
    "Football's governing bodies have announced significant amendments to " +
    "transfer regulations, tightening rules around youth player mobility and " +
    "introducing new disclosure requirements for agent fees. The changes will " +
    "reshape how clubs approach the market, with particular implications for " +
    "the kind of cross-border youth scouting that has defined the modern game. " +
    "Scouts who adapt their methods quickly will find opportunity where others " +
    "see only bureaucratic headache.",
  prerequisites: (state) => state.currentSeason >= 2,
  choices: undefined,
};

const dataRevolutionTemplate: EventTemplate = {
  type: "dataRevolution",
  titleTemplate: "Data Analytics Reshaping Scouting",
  descriptionTemplate: (_ctx) =>
    "A new generation of performance analytics platforms has entered the " +
    "market, promising clubs objective player evaluation at a fraction of the " +
    "travel cost. The trade press is running breathless pieces about the death " +
    "of traditional scouting — again. You've heard this before, and you know " +
    "the truth: data tells you what happened, but only a trained eye in the " +
    "stands tells you why, and what it means for the future. The two approaches " +
    "are strongest in combination, not in competition.",
  prerequisites: (state) => state.currentWeek > 10,
  choices: undefined,
};

const youthAcademyScandal: EventTemplate = {
  type: "youthAcademyScandal",
  titleTemplate: "Youth Academy Malpractice Scandal",
  descriptionTemplate: (ctx) => {
    const player = ctx.playerName ?? "a young player you had your eye on";
    return (
      `A youth academy in the region has been rocked by allegations of ` +
      `financial irregularities and improper inducements to families, with ` +
      `${player} among those reportedly approached in a manner that breaches ` +
      `regulations. Governing bodies are investigating, and several clubs — ` +
      `including some you work alongside — are under scrutiny. The scandal is a ` +
      `reminder of how vulnerable young players and their families are, and why ` +
      `integrity in youth scouting is non-negotiable.`
    );
  },
  prerequisites: (state) => Object.keys(state.unsignedYouth).length > 0,
  choices: undefined,
};

const internationalTournamentTemplate: EventTemplate = {
  type: "internationalTournament",
  titleTemplate: "International Tournament Creates Scouting Opportunity",
  descriptionTemplate: (_ctx) =>
    "A major international youth tournament is being held across multiple " +
    "venues this month, drawing the best emerging talent from dozens of " +
    "nations into one concentrated burst of competitive football. For a scout " +
    "with your cross-border knowledge, it represents an extraordinary window: " +
    "players who are difficult to see in their domestic environments are " +
    "suddenly visible, under pressure, in high-stakes conditions that reveal " +
    "character as much as technique. The fixture list alone is worth studying.",
  prerequisites: (state) => state.countries.length > 1,
  choices: undefined,
};

const scoutingAwardNominationTemplate: EventTemplate = {
  type: "scoutingAwardNomination",
  titleTemplate: "Nominated for Scouting Excellence Award",
  descriptionTemplate: (ctx) => {
    const reputation = ctx.reputation ?? 0;
    return (
      `Your peers have nominated you for the annual Scouting Excellence ` +
      `recognition — an acknowledgement from inside the industry that your ` +
      `work has been noticed and respected. With a reputation of ${reputation}, ` +
      `the nomination reflects sustained quality rather than a single moment. ` +
      `Whether or not you win, the nomination itself signals that you've ` +
      `crossed a threshold in how the broader scouting community sees you. ` +
      `That kind of recognition has a way of compounding.`
    );
  },
  prerequisites: (state) => state.scout.reputation > 70,
  choices: undefined,
};

const financialFairPlayImpactTemplate: EventTemplate = {
  type: "financialFairPlayImpact",
  titleTemplate: "Financial Fair Play Reshapes Transfer Market",
  descriptionTemplate: (_ctx) =>
    "Stricter enforcement of financial sustainability rules has sent a " +
    "tremor through the transfer market. Several clubs that were actively " +
    "pursuing your recommended targets have quietly withdrawn from negotiations, " +
    "citing compliance concerns. The domino effect is already visible: " +
    "valuations are softening, contract extensions are being prioritised over " +
    "acquisitions, and the appetite for unproven but high-potential players — " +
    "exactly the kind you specialise in identifying — is actually increasing " +
    "among the clubs with clean balance sheets.",
  prerequisites: (state) => state.currentSeason >= 2,
  choices: undefined,
};

// =============================================================================
// Exported registry — ordered array used by narrativeEvents.ts
// =============================================================================

export const EVENT_TEMPLATES: ReadonlyArray<EventTemplate> = [
  // Original 8
  rivalPoachTemplate,
  managerFiredTemplate,
  exclusiveTipTemplate,
  debutHatTrickTemplate,
  targetInjuredTemplate,
  reportCitedTemplate,
  rivalRecruitmentTemplate,
  agentDeceptionTemplate,
  // Scout Personal Life
  burnoutTemplate,
  familyEmergencyTemplate,
  scoutingConferenceTemplate,
  mentorOfferTemplate,
  mediaInterviewTemplate,
  healthScareTemplate,
  // Club Drama
  boardroomCoupTemplate,
  budgetCutTemplate,
  scoutingDeptRestructureTemplate,
  rivalClubPoachTemplate,
  managerSackedTemplate,
  clubFinancialTroubleTemplate,
  // Player Stories
  wonderkidPressureTemplate,
  playerHomesickTemplate,
  hiddenGemVindicationTemplate,
  playerControversyTemplate,
  youthProdigyDilemmaTemplate,
  injurySetbackTemplate,
  debutBrillianceTemplate,
  lateBloomingSurpriseTemplate,
  // Network Events
  contactBetrayalTemplate,
  exclusiveAccessTemplate,
  agentDoubleDealingTemplate,
  journalistExposeTemplate,
  networkExpansionTemplate,
  contactRetirementTemplate,
  // Industry Events
  transferRuleChangeTemplate,
  dataRevolutionTemplate,
  youthAcademyScandal,
  internationalTournamentTemplate,
  scoutingAwardNominationTemplate,
  financialFairPlayImpactTemplate,
];

// =============================================================================
// Context extraction helpers — exported for use in narrativeEvents.ts
// =============================================================================

/**
 * Build an EventContext from a GameState for a given event type.
 * Extracts the most relevant names and figures the template can reference.
 */
export function buildEventContext(
  type: NarrativeEventType,
  state: GameState,
): EventContext {
  const scout = state.scout;
  const rivalNames = Object.values(state.rivalScouts).map((r) => r.name);
  const rivalName = rivalNames.length > 0 ? rivalNames[0] : undefined;

  const employerClub = scout.currentClubId
    ? state.clubs[scout.currentClubId]
    : undefined;

  switch (type) {
    case "rivalPoach":
    case "rivalPoachBid":
      return {
        playerName: firstReportPlayerName(state),
        rivalName,
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "managerFired":
      return {
        clubName: employerClub?.name,
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "exclusiveTip":
      return {
        contactName: firstHighRelationshipContactName(state),
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "debutHatTrick":
      return {
        playerName: firstReportPlayerName(state),
        clubName: employerClub?.name,
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "targetInjured":
      return {
        playerName: firstObservationPlayerName(state),
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "reportCitedInBoardMeeting":
      return {
        playerName: firstReportPlayerName(state),
        clubName: employerClub?.name,
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "rivalRecruitment": {
      const rivalClub = Object.values(state.clubs).find(
        (c) => c.id !== scout.currentClubId,
      );
      return {
        clubName: rivalClub?.name,
        reputation: scout.reputation,
        careerTier: scout.careerTier,
      };
    }

    case "agentDeception":
      return {
        contactName: firstAgentContactName(state),
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    // -------------------------------------------------------------------------
    // Scout Personal Life
    // -------------------------------------------------------------------------

    case "burnout":
    case "familyEmergency":
    case "healthScare":
      return {
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "scoutingConference":
    case "mentorOffer":
      return {
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "mediaInterview":
      return {
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    // -------------------------------------------------------------------------
    // Club Drama
    // -------------------------------------------------------------------------

    case "boardroomCoup":
    case "budgetCut":
    case "managerSacked":
    case "clubFinancialTrouble":
      return {
        clubName: employerClub?.name,
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "scoutingDeptRestructure":
      return {
        clubName: employerClub?.name,
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "rivalClubPoach": {
      const rivalClub = Object.values(state.clubs).find(
        (c) => c.id !== scout.currentClubId,
      );
      return {
        clubName: rivalClub?.name,
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };
    }

    // -------------------------------------------------------------------------
    // Player Stories
    // -------------------------------------------------------------------------

    case "wonderkidPressure": {
      const tablePoundReport = Object.values(state.reports).find(
        (r) => r.conviction === "tablePound",
      );
      const player = tablePoundReport
        ? state.players[tablePoundReport.playerId]
        : undefined;
      return {
        playerName: player
          ? `${player.firstName} ${player.lastName}`
          : undefined,
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };
    }

    case "playerHomesick":
      return {
        playerName: firstReportPlayerName(state),
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "hiddenGemVindication":
      return {
        playerName: oldReportPlayerName(state),
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "playerControversy":
      return {
        playerName: firstReportPlayerName(state),
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "youthProdigyDilemma":
      return {
        playerName: firstUnsignedYouthName(state),
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "injurySetback":
      return {
        playerName: recommendedReportPlayerName(state),
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "debutBrilliance":
      return {
        playerName: firstAlumniPlayerName(state),
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "lateBloomingSurprise":
      return {
        playerName: firstReportPlayerName(state),
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    // -------------------------------------------------------------------------
    // Network Events
    // -------------------------------------------------------------------------

    case "contactBetrayal":
      return {
        contactName: anyContactName(state),
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "exclusiveAccess":
      return {
        contactName: firstVeryTrustedContactName(state),
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "agentDoubleDealing":
      return {
        contactName: firstAgentContactName(state),
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "journalistExpose":
      return {
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "networkExpansion":
      return {
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "contactRetirement": {
      const contact = Object.values(state.contacts)[0];
      return {
        contactName: contact?.name,
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };
    }

    // -------------------------------------------------------------------------
    // Industry Events
    // -------------------------------------------------------------------------

    case "transferRuleChange":
    case "dataRevolution":
    case "internationalTournament":
    case "financialFairPlayImpact":
      return {
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "youthAcademyScandal":
      return {
        playerName: firstUnsignedYouthName(state),
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };

    case "scoutingAwardNomination":
      return {
        careerTier: scout.careerTier,
        reputation: scout.reputation,
      };
  }
}

/**
 * Returns the IDs of entities most directly related to an event type.
 * Used to populate NarrativeEvent.relatedIds.
 */
export function extractRelatedIds(
  type: NarrativeEventType,
  state: GameState,
): string[] {
  const scout = state.scout;

  switch (type) {
    case "rivalPoach":
    case "rivalPoachBid":
    case "debutHatTrick":
    case "playerHomesick":
    case "playerControversy":
    case "lateBloomingSurprise": {
      const reportIds = Object.keys(state.reports);
      if (reportIds.length === 0) return [];
      const report = state.reports[reportIds[0]];
      return [report.playerId];
    }

    case "targetInjured": {
      const obsIds = Object.keys(state.observations);
      if (obsIds.length === 0) return [];
      const obs = state.observations[obsIds[0]];
      return [obs.playerId];
    }

    case "managerFired":
    case "boardroomCoup":
    case "budgetCut":
    case "scoutingDeptRestructure":
    case "managerSacked":
    case "clubFinancialTrouble":
      return scout.currentClubId ? [scout.currentClubId] : [];

    case "exclusiveTip": {
      const contact = Object.values(state.contacts).find(
        (c) => c.relationship >= 50,
      );
      return contact ? [contact.id] : [];
    }

    case "reportCitedInBoardMeeting": {
      const reportIds = Object.keys(state.reports);
      if (reportIds.length === 0) return [];
      const report = state.reports[reportIds[0]];
      const ids: string[] = [report.playerId];
      if (scout.currentClubId) ids.push(scout.currentClubId);
      return ids;
    }

    case "rivalRecruitment":
    case "rivalClubPoach": {
      const rivalClub = Object.values(state.clubs).find(
        (c) => c.id !== scout.currentClubId,
      );
      return rivalClub ? [rivalClub.id] : [];
    }

    case "agentDeception":
    case "agentDoubleDealing": {
      const agent = Object.values(state.contacts).find(
        (c) => c.type === "agent",
      );
      return agent ? [agent.id] : [];
    }

    case "wonderkidPressure":
    case "injurySetback": {
      const report = Object.values(state.reports).find(
        (r) => r.conviction === "tablePound" || r.conviction === "strongRecommend",
      );
      return report ? [report.playerId] : [];
    }

    case "hiddenGemVindication": {
      const cutoff = state.currentWeek - 10;
      const report = Object.values(state.reports).find(
        (r) => r.submittedWeek <= cutoff,
      );
      return report ? [report.playerId] : [];
    }

    case "youthProdigyDilemma":
    case "youthAcademyScandal": {
      const youth = Object.values(state.unsignedYouth)[0];
      return youth ? [youth.id] : [];
    }

    case "debutBrilliance": {
      if (state.alumniRecords.length === 0) return [];
      return [state.alumniRecords[0].playerId];
    }

    case "contactBetrayal": {
      const contact = Object.values(state.contacts)[0];
      return contact ? [contact.id] : [];
    }

    case "exclusiveAccess": {
      const contact = Object.values(state.contacts).find(
        (c) => c.relationship > 70,
      );
      return contact ? [contact.id] : [];
    }

    case "contactRetirement": {
      const contact = Object.values(state.contacts)[0];
      return contact ? [contact.id] : [];
    }

    // Events with no specific related entity
    case "burnout":
    case "familyEmergency":
    case "scoutingConference":
    case "mentorOffer":
    case "mediaInterview":
    case "healthScare":
    case "journalistExpose":
    case "networkExpansion":
    case "transferRuleChange":
    case "dataRevolution":
    case "internationalTournament":
    case "scoutingAwardNomination":
    case "financialFairPlayImpact":
      return [];
  }
}
