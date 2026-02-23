/**
 * Calendar system — weekly schedule management, activity validation, and
 * end-of-week result processing.
 *
 * The week is modelled as 7 day-slots (Monday through Sunday). Each activity
 * has a slot cost; multiple activities can share the same week but a single
 * day-slot can only hold one activity.
 *
 * All functions are pure: no side effects, no mutation.
 */

import type {
  Scout,
  Contact,
  Fixture,
  WeekSchedule,
  Activity,
  ActivityType,
  ScoutSkill,
  ScoutAttribute,
  SubRegion,
  Observation,
  UnsignedYouth,
} from "@/engine/core/types";
import { RNG } from "@/engine/rng";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface WeekProcessingResult {
  /** Net fatigue change for the week (can be negative — rest reduces fatigue) */
  fatigueChange: number;
  /** XP gains per scout skill from activities performed */
  skillXpGained: Partial<Record<ScoutSkill, number>>;
  /** XP gains per scout attribute from activities performed */
  attributeXpGained: Partial<Record<ScoutAttribute, number>>;
  /** Fixture IDs where the scout attended a match */
  matchesAttended: string[];
  /** Report draft IDs that were submitted this week */
  reportsWritten: string[];
  /** Contact IDs of meetings held */
  meetingsHeld: string[];
  /**
   * NPC report IDs that were reviewed this week.
   * Reviewing an NPC report gives +1 familiarity with the report's country
   * (applied by the store/caller via countryReputations).
   */
  npcReportsReviewed: string[];
  /**
   * Whether a manager meeting was executed this week.
   * The caller (store/game loop) should call processManagerMeeting() when true.
   */
  managerMeetingExecuted: boolean;
  /**
   * Whether a board presentation activity was executed this week (tier 5).
   * The caller should apply a reputation boost if the scout is tier 5.
   */
  boardPresentationExecuted: boolean;
  /** Number of academy visit activities executed this week */
  academyVisitsExecuted: number;
  /** Number of youth tournament activities executed this week */
  youthTournamentsExecuted: number;
  /** Number of training visit activities executed this week */
  trainingVisitsExecuted: number;
  /** Number of video analysis sessions executed this week */
  videoSessionsExecuted: number;

  // --- First-team exclusive ---

  /** Number of reserve match observations this week */
  reserveMatchesExecuted: number;
  /** Number of scouting missions completed */
  scoutingMissionsExecuted: number;
  /** Number of opposition analysis sessions */
  oppositionAnalysesExecuted: number;
  /** Number of agent showcase events attended */
  agentShowcasesExecuted: number;
  /** Number of trial matches observed */
  trialMatchesExecuted: number;
  /** Number of contract negotiation assists */
  contractNegotiationsExecuted: number;

  // --- Data-exclusive ---

  /** Number of database queries run */
  databaseQueriesExecuted: number;
  /** Number of deep video analysis sessions */
  deepVideoAnalysesExecuted: number;
  /** Number of stats briefings reviewed */
  statsBriefingsExecuted: number;
  /** Number of data conferences attended */
  dataConferencesExecuted: number;
  /** Number of algorithm calibration sessions */
  algorithmCalibrationsExecuted: number;
  /** Number of market inefficiency scans */
  marketInefficienciesExecuted: number;
  /** Number of analytics team meetings held */
  analyticsTeamMeetingsExecuted: number;

  // --- Youth-exclusive ---

  /** Number of placement reports written this week */
  writePlacementReportsExecuted: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Slot cost per activity type */
export const ACTIVITY_SLOT_COSTS: Record<ActivityType, number> = {
  attendMatch:        2,
  watchVideo:         1,
  writeReport:        1,
  networkMeeting:     1,
  trainingVisit:      2,
  travel:             1, // up to 2 — set on the Activity itself for long-haul
  study:              1,
  rest:               1, // rest occupies a day but reduces fatigue
  academyVisit:       2,
  youthTournament:    2,
  reviewNPCReport:    1,
  managerMeeting:     1,
  boardPresentation:  2,
  assignTerritory:    1,
  internationalTravel:2,
  schoolMatch:        2,
  grassrootsTournament:3,
  streetFootball:     2,
  academyTrialDay:    2,
  youthFestival:      3,
  followUpSession:    1,
  parentCoachMeeting: 1,
  writePlacementReport:1,
  // First-team exclusive
  reserveMatch:       2,
  scoutingMission:    3,
  oppositionAnalysis: 2,
  agentShowcase:      2,
  trialMatch:         2,
  contractNegotiation:1,
  // Data-exclusive
  databaseQuery:      1,
  deepVideoAnalysis:  2,
  statsBriefing:      1,
  dataConference:     3,
  algorithmCalibration:1,
  marketInefficiency: 1,
  analyticsTeamMeeting:1,
};

/** Fatigue cost per activity type */
export const ACTIVITY_FATIGUE_COSTS: Record<ActivityType, number> = {
  attendMatch:        10,
  watchVideo:         5,
  writeReport:        5,
  networkMeeting:     3,
  trainingVisit:      8,
  travel:             6, // per travel block
  study:              3,
  rest:               -15, // rest reduces fatigue
  academyVisit:       8,
  youthTournament:    12,
  reviewNPCReport:    3,
  managerMeeting:     4,
  boardPresentation:  8,
  assignTerritory:    2,
  internationalTravel:10,
  schoolMatch:        8,
  grassrootsTournament:12,
  streetFootball:     6,
  academyTrialDay:    10,
  youthFestival:      14,
  followUpSession:    5,
  parentCoachMeeting: 3,
  writePlacementReport:4,
  // First-team exclusive
  reserveMatch:       8,
  scoutingMission:    12,
  oppositionAnalysis: 6,
  agentShowcase:      5,
  trialMatch:         10,
  contractNegotiation:4,
  // Data-exclusive
  databaseQuery:      3,
  deepVideoAnalysis:  6,
  statsBriefing:      3,
  dataConference:     8,
  algorithmCalibration:4,
  marketInefficiency: 3,
  analyticsTeamMeeting:3,
};

/** Skills that each activity type directly develops */
export const ACTIVITY_SKILL_XP: Partial<Record<ActivityType, Partial<Record<ScoutSkill, number>>>> = {
  attendMatch:    { technicalEye: 3, physicalAssessment: 2, tacticalUnderstanding: 2, playerJudgment: 2 },
  watchVideo:     { technicalEye: 2, tacticalUnderstanding: 3, dataLiteracy: 1, playerJudgment: 1 },
  writeReport:    { dataLiteracy: 3, playerJudgment: 1, potentialAssessment: 1 },
  networkMeeting: { psychologicalRead: 2 },
  trainingVisit:  { physicalAssessment: 3, psychologicalRead: 2, playerJudgment: 1 },
  academyVisit:   { technicalEye: 2, physicalAssessment: 2, dataLiteracy: 1, potentialAssessment: 2 },
  youthTournament:{ technicalEye: 3, physicalAssessment: 2, tacticalUnderstanding: 1, potentialAssessment: 3 },
  study:          { dataLiteracy: 4, tacticalUnderstanding: 2, potentialAssessment: 1 },
  schoolMatch:        { technicalEye: 2, physicalAssessment: 1 },
  grassrootsTournament: { technicalEye: 2, physicalAssessment: 2 },
  streetFootball:     { technicalEye: 3, psychologicalRead: 1 },
  academyTrialDay:    { technicalEye: 2, physicalAssessment: 2 },
  youthFestival:      { technicalEye: 3, physicalAssessment: 2 },
  followUpSession:    { technicalEye: 3, psychologicalRead: 2 },
  parentCoachMeeting: { psychologicalRead: 3 },
  writePlacementReport: { dataLiteracy: 3 },
  // First-team exclusive
  reserveMatch:        { technicalEye: 2, physicalAssessment: 2, playerJudgment: 3 },
  scoutingMission:     { technicalEye: 2, tacticalUnderstanding: 3, playerJudgment: 2, physicalAssessment: 1 },
  oppositionAnalysis:  { tacticalUnderstanding: 4, playerJudgment: 2 },
  agentShowcase:       { playerJudgment: 3, psychologicalRead: 2 },
  trialMatch:          { technicalEye: 2, physicalAssessment: 2, tacticalUnderstanding: 2, playerJudgment: 3 },
  contractNegotiation: { psychologicalRead: 2 },
  // Data-exclusive
  databaseQuery:       { dataLiteracy: 4 },
  deepVideoAnalysis:   { technicalEye: 2, tacticalUnderstanding: 2, dataLiteracy: 3 },
  statsBriefing:       { dataLiteracy: 3, playerJudgment: 1 },
  dataConference:      { dataLiteracy: 4, tacticalUnderstanding: 2 },
  algorithmCalibration:{ dataLiteracy: 5 },
  marketInefficiency:  { dataLiteracy: 3, playerJudgment: 2 },
  analyticsTeamMeeting:{ dataLiteracy: 2, psychologicalRead: 1 },
};

/** Scout attributes that each activity type develops */
export const ACTIVITY_ATTRIBUTE_XP: Partial<Record<ActivityType, Partial<Record<ScoutAttribute, number>>>> = {
  attendMatch:    { memory: 2, endurance: 1 },
  watchVideo:     { memory: 3 },
  writeReport:    { memory: 2, intuition: 1 },
  networkMeeting: { networking: 3, persuasion: 2 },
  trainingVisit:  { memory: 2, endurance: 1 },
  academyVisit:   { intuition: 2, memory: 1 },
  youthTournament:{ intuition: 3, endurance: 2 },
  travel:         { adaptability: 2 },
  study:          { memory: 3, intuition: 1 },
  schoolMatch:        { intuition: 2, adaptability: 1 },
  grassrootsTournament: { intuition: 2, endurance: 1, networking: 1 },
  streetFootball:     { intuition: 3, adaptability: 2 },
  academyTrialDay:    { networking: 2, intuition: 1 },
  youthFestival:      { intuition: 2, endurance: 2, networking: 1 },
  followUpSession:    { intuition: 3, memory: 2 },
  parentCoachMeeting: { persuasion: 3, networking: 2 },
  writePlacementReport: { persuasion: 2, memory: 1 },
  // First-team exclusive
  reserveMatch:        { memory: 2, endurance: 1 },
  scoutingMission:     { endurance: 3, adaptability: 2, networking: 1 },
  oppositionAnalysis:  { memory: 3 },
  agentShowcase:       { networking: 3, persuasion: 2 },
  trialMatch:          { memory: 2, intuition: 2 },
  contractNegotiation: { persuasion: 4, networking: 2 },
  // Data-exclusive
  databaseQuery:       { memory: 2 },
  deepVideoAnalysis:   { memory: 3, intuition: 1 },
  statsBriefing:       { memory: 2 },
  dataConference:      { networking: 3, memory: 2 },
  algorithmCalibration:{ memory: 3, intuition: 2 },
  marketInefficiency:  { intuition: 3, memory: 1 },
  analyticsTeamMeeting:{ networking: 1, persuasion: 1 },
};

const TOTAL_WEEK_SLOTS = 7;
const MAX_FATIGUE = 100;
const FORCED_REST_FATIGUE_THRESHOLD = 90;
const ACCURACY_PENALTY_FATIGUE_THRESHOLD = 70;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a blank week schedule for the given week and season.
 */
export function createWeekSchedule(week: number, season: number): WeekSchedule {
  return {
    week,
    season,
    activities: Array(TOTAL_WEEK_SLOTS).fill(null) as (Activity | null)[],
    completed: false,
  };
}

/**
 * Check whether an activity can be added to the schedule at the given
 * day-slot index.
 *
 * Rules:
 * 1. dayIndex must be 0–6.
 * 2. The slot must currently be empty (null).
 * 3. Multi-slot activities (slotCost > 1) must have enough consecutive free
 *    slots starting from dayIndex.
 * 4. Adding this activity must not push total slots used over TOTAL_WEEK_SLOTS.
 */
export function canAddActivity(
  schedule: WeekSchedule,
  activity: Activity,
  dayIndex: number,
): boolean {
  if (dayIndex < 0 || dayIndex >= TOTAL_WEEK_SLOTS) return false;
  if (schedule.completed) return false;

  const cost = activity.slots;

  // Check enough consecutive free slots exist
  if (dayIndex + cost > TOTAL_WEEK_SLOTS) return false;

  for (let i = dayIndex; i < dayIndex + cost; i++) {
    if (schedule.activities[i] !== null) return false;
  }

  return true;
}

/**
 * Add an activity to the schedule at the given day-slot index.
 * Returns an updated WeekSchedule (does not mutate the input).
 * Throws if the placement is invalid — call canAddActivity first.
 */
export function addActivity(
  schedule: WeekSchedule,
  activity: Activity,
  dayIndex: number,
): WeekSchedule {
  if (!canAddActivity(schedule, activity, dayIndex)) {
    throw new Error(
      `Cannot add activity '${activity.type}' at slot ${dayIndex}: slot occupied or out of bounds.`,
    );
  }

  const updatedActivities = [...schedule.activities] as (Activity | null)[];

  // Fill all slots the activity occupies
  for (let i = dayIndex; i < dayIndex + activity.slots; i++) {
    updatedActivities[i] = activity;
  }

  return { ...schedule, activities: updatedActivities };
}

/**
 * Remove the activity at the given day-slot index.
 * If the activity spans multiple slots, all of its slots are cleared.
 * Returns an updated WeekSchedule.
 */
export function removeActivity(
  schedule: WeekSchedule,
  dayIndex: number,
): WeekSchedule {
  if (dayIndex < 0 || dayIndex >= TOTAL_WEEK_SLOTS) {
    return schedule;
  }

  const activity = schedule.activities[dayIndex];
  if (activity === null) return schedule;

  const updatedActivities = [...schedule.activities] as (Activity | null)[];

  // Clear every slot that contains this same activity.
  // isSameActivity is used instead of === so that post-serialisation objects
  // (which are distinct instances with identical data) are matched correctly.
  for (let i = 0; i < TOTAL_WEEK_SLOTS; i++) {
    if (isSameActivity(updatedActivities[i], activity)) {
      updatedActivities[i] = null;
    }
  }

  return { ...schedule, activities: updatedActivities };
}

/**
 * Build the list of activities the scout can currently schedule.
 *
 * Availability rules:
 * - attendMatch / youthTournament: only if there are upcoming fixtures
 * - networkMeeting: only if the scout has contacts
 * - academyVisit: only if the scout has unlocked the academy_access perk
 *   (checked via unlockedPerks array)
 * - trainingVisit: always available
 * - watchVideo / writeReport / study / rest / travel: always available
 * - If fatigue > FORCED_REST_FATIGUE_THRESHOLD: only rest is available
 *
 * Youth scouting venue gating:
 * - schoolMatch: always available
 * - grassrootsTournament: requires youth specialization with spec level >= 1
 * - streetFootball: requires any sub-region with familiarity >= 20
 * - academyTrialDay: requires contact of type academyCoach/academyDirector with relationship >= 40
 * - youthFestival: requires careerTier >= 2
 * - followUpSession / parentCoachMeeting / writePlacementReport:
 *   requires at least 1 observation of an unsigned (unplaced) youth player
 */
export function getAvailableActivities(
  scout: Scout,
  week: number,
  fixtures: Fixture[],
  contacts: Contact[],
  subRegions?: Record<string, SubRegion>,
  observations?: Record<string, Observation>,
  unsignedYouth?: Record<string, UnsignedYouth>,
): Activity[] {
  const activities: Activity[] = [];

  // Forced rest when exhausted
  if (scout.fatigue > FORCED_REST_FATIGUE_THRESHOLD) {
    activities.push({
      type: "rest",
      slots: 1,
      description: "Rest and recover — your fatigue is too high to do anything productive.",
    });
    return activities;
  }

  // Match attendance — current and upcoming fixtures
  const upcomingFixtures = fixtures.filter((f) => f.week === week && !f.played);
  for (const fixture of upcomingFixtures.slice(0, 5)) {
    activities.push({
      type: "attendMatch",
      slots: ACTIVITY_SLOT_COSTS.attendMatch,
      targetId: fixture.id,
      description: `Attend match: ${fixture.homeClubId} vs ${fixture.awayClubId}`,
    });
  }

  // Video analysis (flexible — no fixture dependency)
  activities.push({
    type: "watchVideo",
    slots: ACTIVITY_SLOT_COSTS.watchVideo,
    description: "Watch video footage of a target player",
  });

  // Write report
  activities.push({
    type: "writeReport",
    slots: ACTIVITY_SLOT_COSTS.writeReport,
    description: "Write up a scouting report from your observations",
  });

  // Network meetings
  if (contacts.length > 0) {
    for (const contact of contacts.slice(0, 4)) {
      activities.push({
        type: "networkMeeting",
        slots: ACTIVITY_SLOT_COSTS.networkMeeting,
        targetId: contact.id,
        description: `Meet with ${contact.name} (${contact.type})`,
      });
    }
  }

  // Training visit
  activities.push({
    type: "trainingVisit",
    slots: ACTIVITY_SLOT_COSTS.trainingVisit,
    description: "Visit a club's training ground to observe a player in a controlled setting",
  });

  // Academy visit (requires perk)
  const hasAcademyAccess = scout.unlockedPerks.some(
    (perkId) =>
      perkId === "youth_academy_access" || perkId.includes("academy"),
  );
  if (hasAcademyAccess) {
    activities.push({
      type: "academyVisit",
      slots: ACTIVITY_SLOT_COSTS.academyVisit,
      description: "Visit a club academy to observe youth players",
    });
  }

  // Youth tournament (available in certain weeks — simplified to always-available)
  activities.push({
    type: "youthTournament",
    slots: ACTIVITY_SLOT_COSTS.youthTournament,
    description: "Attend a youth tournament — observe multiple young players",
  });

  // Travel
  activities.push({
    type: "travel",
    slots: ACTIVITY_SLOT_COSTS.travel,
    description: "Travel to another region or league",
  });

  // Study
  activities.push({
    type: "study",
    slots: ACTIVITY_SLOT_COSTS.study,
    description: "Study tactics, statistical models, or player profiles",
  });

  // Rest — always available
  activities.push({
    type: "rest",
    slots: 1,
    description: "Take a day off to rest and recover fatigue",
  });

  // ── Youth scouting venue activities ────────────────────────────────────────

  // schoolMatch: always available
  activities.push({
    type: "schoolMatch",
    slots: ACTIVITY_SLOT_COSTS.schoolMatch,
    description: "Watch a school match — observe untapped youth talent in their natural setting",
  });

  // grassrootsTournament: requires youth specialization with spec level >= 1
  if (
    scout.primarySpecialization === "youth" &&
    scout.specializationLevel >= 1
  ) {
    activities.push({
      type: "grassrootsTournament",
      slots: ACTIVITY_SLOT_COSTS.grassrootsTournament,
      description: "Scout a grassroots tournament — high yield of youth talent across multiple teams",
    });
  }

  // streetFootball: requires any sub-region with familiarity >= 20
  const hasLocalFamiliarity =
    subRegions !== undefined &&
    Object.values(subRegions).some((sr) => sr.familiarity >= 20);
  if (hasLocalFamiliarity) {
    activities.push({
      type: "streetFootball",
      slots: ACTIVITY_SLOT_COSTS.streetFootball,
      description: "Watch street football sessions — hidden gems play where scouts rarely look",
    });
  }

  // academyTrialDay: requires contact of type academyCoach or academyDirector with relationship >= 40
  const hasAcademyContact = contacts.some(
    (c) =>
      (c.type === "academyCoach" || c.type === "academyDirector") &&
      c.relationship >= 40,
  );
  if (hasAcademyContact) {
    activities.push({
      type: "academyTrialDay",
      slots: ACTIVITY_SLOT_COSTS.academyTrialDay,
      description: "Attend an academy trial day — evaluate youth players being assessed by a club",
    });
  }

  // youthFestival: requires careerTier >= 2
  if (scout.careerTier >= 2) {
    activities.push({
      type: "youthFestival",
      slots: ACTIVITY_SLOT_COSTS.youthFestival,
      description: "Attend a youth festival — multi-team event with large pool of scoutable youth",
    });
  }

  // followUpSession / parentCoachMeeting / writePlacementReport:
  // requires at least 1 observation of an unsigned (unplaced) youth player
  const unsignedYouthIds = new Set(
    Object.values(unsignedYouth ?? {})
      .filter((y) => !y.placed && !y.retired)
      .map((y) => y.player.id),
  );
  const hasUnsignedYouthObservation =
    observations !== undefined &&
    Object.values(observations).some((obs) => unsignedYouthIds.has(obs.playerId));

  if (hasUnsignedYouthObservation) {
    activities.push({
      type: "followUpSession",
      slots: ACTIVITY_SLOT_COSTS.followUpSession,
      description: "Run a follow-up session with a youth prospect — deepen your assessment",
    });
    activities.push({
      type: "parentCoachMeeting",
      slots: ACTIVITY_SLOT_COSTS.parentCoachMeeting,
      description: "Meet with a prospect's parents or coach — build trust and gather context",
    });
    activities.push({
      type: "writePlacementReport",
      slots: ACTIVITY_SLOT_COSTS.writePlacementReport,
      description: "Write a placement report — formally recommend a youth player to a club",
    });
  }

  // ── First-team exclusive activities ─────────────────────────────────────────

  if (scout.primarySpecialization === "firstTeam") {
    // Reserve match — observe fringe/reserve players at scout's club
    if (scout.currentClubId) {
      activities.push({
        type: "reserveMatch",
        slots: ACTIVITY_SLOT_COSTS.reserveMatch,
        description: "Watch a reserve team match — evaluate fringe players and loanees up close",
      });
    }

    // Scouting mission — multi-day deep dive into a league/region
    if (scout.careerTier >= 2) {
      activities.push({
        type: "scoutingMission",
        slots: ACTIVITY_SLOT_COSTS.scoutingMission,
        description: "Embark on a scouting mission — multi-day deep dive across multiple matches in a region",
      });
    }

    // Opposition analysis — study upcoming opponents' players
    if (scout.currentClubId) {
      activities.push({
        type: "oppositionAnalysis",
        slots: ACTIVITY_SLOT_COSTS.oppositionAnalysis,
        description: "Analyze the opposition — evaluate players from upcoming opponents for potential recruitment",
      });
    }

    // Agent showcase — networking event with agents presenting their clients
    if (scout.careerTier >= 3) {
      activities.push({
        type: "agentShowcase",
        slots: ACTIVITY_SLOT_COSTS.agentShowcase,
        description: "Attend an agent showcase — agents present their top clients for your evaluation",
      });
    }

    // Trial match — arrange for a shortlisted player to train with the club
    if (scout.currentClubId && scout.careerTier >= 3) {
      activities.push({
        type: "trialMatch",
        slots: ACTIVITY_SLOT_COSTS.trialMatch,
        description: "Observe a trial match — watch a shortlisted player perform in your club's training setup",
      });
    }

    // Contract negotiation — assist in transfer deal closure
    if (scout.currentClubId && scout.careerTier >= 4) {
      activities.push({
        type: "contractNegotiation",
        slots: ACTIVITY_SLOT_COSTS.contractNegotiation,
        description: "Assist in contract negotiations — leverage your player knowledge to help close a deal",
      });
    }
  }

  // ── Data-exclusive activities ───────────────────────────────────────────────

  if (scout.primarySpecialization === "data") {
    // Database query — search statistical databases for matching players
    activities.push({
      type: "databaseQuery",
      slots: ACTIVITY_SLOT_COSTS.databaseQuery,
      description: "Query the statistical database — filter players by position, age, and performance metrics",
    });

    // Deep video analysis — frame-by-frame breakdown with statistical overlay
    activities.push({
      type: "deepVideoAnalysis",
      slots: ACTIVITY_SLOT_COSTS.deepVideoAnalysis,
      description: "Run deep video analysis — systematic clip tagging with statistical overlay for precision reads",
    });

    // Stats briefing — review league-wide statistical summary
    activities.push({
      type: "statsBriefing",
      slots: ACTIVITY_SLOT_COSTS.statsBriefing,
      description: "Review a stats briefing — weekly statistical summary highlighting anomalies and trends",
    });

    // Data conference — attend an analytics conference (networking + learning)
    if (scout.careerTier >= 2) {
      activities.push({
        type: "dataConference",
        slots: ACTIVITY_SLOT_COSTS.dataConference,
        description: "Attend a data conference — learn cutting-edge analytical methods and network with peers",
      });
    }

    // Algorithm calibration — improve your analytical models
    if (scout.specializationLevel >= 3) {
      activities.push({
        type: "algorithmCalibration",
        slots: ACTIVITY_SLOT_COSTS.algorithmCalibration,
        description: "Calibrate your algorithms — refine your statistical models for sharper predictions",
      });
    }

    // Market inefficiency scan — find undervalued players
    if (scout.specializationLevel >= 5) {
      activities.push({
        type: "marketInefficiency",
        slots: ACTIVITY_SLOT_COSTS.marketInefficiency,
        description: "Scan for market inefficiencies — identify players whose stats outstrip their transfer value",
      });
    }

    // Analytics team meeting — manage your data analysts
    if (scout.careerTier >= 3) {
      activities.push({
        type: "analyticsTeamMeeting",
        slots: ACTIVITY_SLOT_COSTS.analyticsTeamMeeting,
        description: "Hold an analytics team meeting — review analyst reports and adjust monitoring assignments",
      });
    }
  }

  return activities;
}

/**
 * Process a completed week's schedule, returning the effects on the scout.
 *
 * Fatigue mechanics:
 * - Each activity adds fatigue according to ACTIVITY_FATIGUE_COSTS
 * - Endurance attribute reduces fatigue gain: cost × (1 - endurance/40)
 * - Rest activities reduce fatigue by 15
 * - If resulting fatigue > 70: accuracy penalties are flagged
 * - If resulting fatigue > 90: forced rest recorded in output
 *
 * Skill/attribute XP is accumulated from all activities performed.
 * Duplicate activities in multi-slot blocks are counted once only.
 */
export function processCompletedWeek(
  schedule: WeekSchedule,
  scout: Scout,
  rng: RNG,
): WeekProcessingResult {
  // Guard against double-processing: if the schedule is already marked
  // completed, return a zero-effect result so XP and fatigue are not doubled.
  if (schedule.completed) {
    return {
      fatigueChange: 0,
      skillXpGained: {},
      attributeXpGained: {},
      matchesAttended: [],
      reportsWritten: [],
      meetingsHeld: [],
      npcReportsReviewed: [],
      managerMeetingExecuted: false,
      boardPresentationExecuted: false,
      academyVisitsExecuted: 0,
      youthTournamentsExecuted: 0,
      trainingVisitsExecuted: 0,
      videoSessionsExecuted: 0,
      reserveMatchesExecuted: 0,
      scoutingMissionsExecuted: 0,
      oppositionAnalysesExecuted: 0,
      agentShowcasesExecuted: 0,
      trialMatchesExecuted: 0,
      contractNegotiationsExecuted: 0,
      databaseQueriesExecuted: 0,
      deepVideoAnalysesExecuted: 0,
      statsBriefingsExecuted: 0,
      dataConferencesExecuted: 0,
      algorithmCalibrationsExecuted: 0,
      marketInefficienciesExecuted: 0,
      analyticsTeamMeetingsExecuted: 0,
      writePlacementReportsExecuted: 0,
    };
  }

  const seenActivities = new Set<Activity>();
  let fatigueChange = 0;
  const skillXpGained: Partial<Record<ScoutSkill, number>> = {};
  const attributeXpGained: Partial<Record<ScoutAttribute, number>> = {};
  const matchesAttended: string[] = [];
  const reportsWritten: string[] = [];
  const meetingsHeld: string[] = [];
  const npcReportsReviewed: string[] = [];
  let managerMeetingExecuted = false;
  let boardPresentationExecuted = false;
  let academyVisitsExecuted = 0;
  let youthTournamentsExecuted = 0;
  let trainingVisitsExecuted = 0;
  let videoSessionsExecuted = 0;

  // First-team exclusive
  let reserveMatchesExecuted = 0;
  let scoutingMissionsExecuted = 0;
  let oppositionAnalysesExecuted = 0;
  let agentShowcasesExecuted = 0;
  let trialMatchesExecuted = 0;
  let contractNegotiationsExecuted = 0;

  // Data-exclusive
  let databaseQueriesExecuted = 0;
  let deepVideoAnalysesExecuted = 0;
  let statsBriefingsExecuted = 0;
  let dataConferencesExecuted = 0;
  let algorithmCalibrationsExecuted = 0;
  let marketInefficienciesExecuted = 0;
  let analyticsTeamMeetingsExecuted = 0;

  // Youth-exclusive
  let writePlacementReportsExecuted = 0;

  const endurance = scout.attributes.endurance; // 1–20

  for (const activity of schedule.activities) {
    if (activity === null) continue;
    if (seenActivities.has(activity)) continue;
    seenActivities.add(activity);

    // Fatigue cost, modulated by endurance
    const rawFatigueCost = ACTIVITY_FATIGUE_COSTS[activity.type];
    let actualFatigueCost: number;

    if (rawFatigueCost < 0) {
      // Rest — full recovery regardless of endurance
      actualFatigueCost = rawFatigueCost;
    } else {
      // Endurance reduces fatigue cost: at endurance 40 (max practical) → 0
      const enduranceFactor = 1 - Math.min(0.75, endurance / 40);
      actualFatigueCost = Math.round(rawFatigueCost * enduranceFactor);
    }

    fatigueChange += actualFatigueCost;

    // Skill XP
    const skillXp = ACTIVITY_SKILL_XP[activity.type];
    if (skillXp) {
      for (const [skill, xp] of Object.entries(skillXp) as [ScoutSkill, number][]) {
        skillXpGained[skill] = (skillXpGained[skill] ?? 0) + xp;
      }
    }

    // Attribute XP
    const attrXp = ACTIVITY_ATTRIBUTE_XP[activity.type];
    if (attrXp) {
      for (const [attr, xp] of Object.entries(attrXp) as [ScoutAttribute, number][]) {
        attributeXpGained[attr] = (attributeXpGained[attr] ?? 0) + xp;
      }
    }

    // Track what happened
    switch (activity.type) {
      case "attendMatch":
        if (activity.targetId) matchesAttended.push(activity.targetId);
        break;
      case "writeReport":
        if (activity.targetId) reportsWritten.push(activity.targetId);
        break;
      case "networkMeeting":
        if (activity.targetId) meetingsHeld.push(activity.targetId);
        break;

      // ---- Career system activities (Wave 1) ----

      case "reviewNPCReport":
        // targetId is the NPC report ID. Marking it reviewed gives +1 familiarity
        // with the report's country; the store applies the countryReputation update
        // using this list.
        if (activity.targetId) npcReportsReviewed.push(activity.targetId);
        break;

      case "managerMeeting":
        // Signal to the caller that a manager meeting occurred this week.
        // The actual relationship update is performed by the store via
        // processManagerMeeting() so that the RNG sequence stays deterministic.
        managerMeetingExecuted = true;
        break;

      case "boardPresentation":
        // Signal to the caller that a board presentation took place.
        // The caller applies the reputation boost for tier 5 scouts.
        boardPresentationExecuted = true;
        break;

      case "academyVisit":
        academyVisitsExecuted++;
        break;

      case "youthTournament":
        youthTournamentsExecuted++;
        break;

      case "trainingVisit":
        trainingVisitsExecuted++;
        break;

      case "watchVideo":
        videoSessionsExecuted++;
        break;

      case "assignTerritory":
      case "internationalTravel":
        // These activities are handled entirely through store actions that
        // mutate state directly (territory assignment, travel booking).
        // The calendar records their slot and fatigue costs only; no additional
        // processing is needed here.
        break;

      // ---- First-team exclusive activities ----

      case "reserveMatch":
        reserveMatchesExecuted++;
        break;
      case "scoutingMission":
        scoutingMissionsExecuted++;
        break;
      case "oppositionAnalysis":
        oppositionAnalysesExecuted++;
        break;
      case "agentShowcase":
        agentShowcasesExecuted++;
        break;
      case "trialMatch":
        trialMatchesExecuted++;
        break;
      case "contractNegotiation":
        contractNegotiationsExecuted++;
        break;

      // ---- Data-exclusive activities ----

      case "databaseQuery":
        databaseQueriesExecuted++;
        break;
      case "deepVideoAnalysis":
        deepVideoAnalysesExecuted++;
        break;
      case "statsBriefing":
        statsBriefingsExecuted++;
        break;
      case "dataConference":
        dataConferencesExecuted++;
        break;
      case "algorithmCalibration":
        algorithmCalibrationsExecuted++;
        break;
      case "marketInefficiency":
        marketInefficienciesExecuted++;
        break;
      case "analyticsTeamMeeting":
        analyticsTeamMeetingsExecuted++;
        break;

      // ---- Youth-exclusive activities ----

      case "writePlacementReport":
        writePlacementReportsExecuted++;
        break;

      default:
        break;
    }
  }

  // High fatigue suppresses skill XP gains (bad conditions, tired scouts).
  // We check scout.fatigue (fatigue at the START of the week) so that scouts
  // are not penalised for fatigue they haven't accumulated yet.
  if (scout.fatigue > ACCURACY_PENALTY_FATIGUE_THRESHOLD) {
    // Reduce all XP by 30 % when exhausted
    for (const key of Object.keys(skillXpGained) as ScoutSkill[]) {
      skillXpGained[key] = Math.round((skillXpGained[key] ?? 0) * 0.7);
    }
    for (const key of Object.keys(attributeXpGained) as ScoutAttribute[]) {
      attributeXpGained[key] = Math.round((attributeXpGained[key] ?? 0) * 0.7);
    }
  }

  return {
    fatigueChange,
    skillXpGained,
    attributeXpGained,
    matchesAttended,
    reportsWritten,
    meetingsHeld,
    npcReportsReviewed,
    managerMeetingExecuted,
    boardPresentationExecuted,
    academyVisitsExecuted,
    youthTournamentsExecuted,
    trainingVisitsExecuted,
    videoSessionsExecuted,
    // First-team exclusive
    reserveMatchesExecuted,
    scoutingMissionsExecuted,
    oppositionAnalysesExecuted,
    agentShowcasesExecuted,
    trialMatchesExecuted,
    contractNegotiationsExecuted,
    // Data-exclusive
    databaseQueriesExecuted,
    deepVideoAnalysesExecuted,
    statsBriefingsExecuted,
    dataConferencesExecuted,
    algorithmCalibrationsExecuted,
    marketInefficienciesExecuted,
    analyticsTeamMeetingsExecuted,
    // Youth-exclusive
    writePlacementReportsExecuted,
  };
}

// ---------------------------------------------------------------------------
// XP Application
// ---------------------------------------------------------------------------

/**
 * Apply XP gains from a completed week to the scout, producing an updated
 * scout with accumulated XP and any level-ups applied.
 *
 * Level-up threshold: currentLevel * 10 XP. When accumulated XP exceeds
 * the threshold, the skill/attribute increases by 1 and excess XP carries
 * over. Skills and attributes are capped at 20.
 */
export function applyWeekResults(
  scout: Scout,
  result: WeekProcessingResult,
): Scout {
  const updatedSkills = { ...scout.skills };
  const updatedSkillXp = { ...scout.skillXp };
  const updatedAttributes = { ...scout.attributes };
  const updatedAttributeXp = { ...scout.attributeXp };

  // Apply skill XP
  for (const [skill, xp] of Object.entries(result.skillXpGained) as [ScoutSkill, number][]) {
    if (!xp) continue;
    const current = updatedSkills[skill];
    if (current >= 20) continue; // already maxed

    const accumulated = (updatedSkillXp[skill] ?? 0) + xp;
    const threshold = current * 10;

    if (accumulated >= threshold) {
      updatedSkills[skill] = Math.min(20, current + 1);
      updatedSkillXp[skill] = accumulated - threshold;
    } else {
      updatedSkillXp[skill] = accumulated;
    }
  }

  // Apply attribute XP
  for (const [attr, xp] of Object.entries(result.attributeXpGained) as [ScoutAttribute, number][]) {
    if (!xp) continue;
    const current = updatedAttributes[attr];
    if (current >= 20) continue;

    const accumulated = (updatedAttributeXp[attr] ?? 0) + xp;
    const threshold = current * 10;

    if (accumulated >= threshold) {
      updatedAttributes[attr] = Math.min(20, current + 1);
      updatedAttributeXp[attr] = accumulated - threshold;
    } else {
      updatedAttributeXp[attr] = accumulated;
    }
  }

  // Apply fatigue
  const newFatigue = clamp(scout.fatigue + result.fatigueChange, 0, MAX_FATIGUE);

  return {
    ...scout,
    skills: updatedSkills,
    skillXp: updatedSkillXp,
    attributes: updatedAttributes,
    attributeXp: updatedAttributeXp,
    fatigue: newFatigue,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compare two Activity values by their logical identity (type + targetId +
 * description) rather than by object reference.  This is necessary because
 * JSON round-trips (save / load) produce distinct instances for equal data,
 * which would cause `===` comparisons to always return false.
 */
function isSameActivity(a: Activity | null, b: Activity | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return (
    a.type === b.type &&
    a.targetId === b.targetId &&
    a.description === b.description
  );
}
