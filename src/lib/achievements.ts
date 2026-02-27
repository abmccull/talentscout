/**
 * Achievement definitions and check logic for TalentScout.
 *
 * ACHIEVEMENTS is the canonical list of all achievements, organized across
 * 8 categories: Getting Started, Career Milestones, Scouting Excellence,
 * Specialization Mastery, World Explorer, Match & Analysis, Financial, and Hidden.
 *
 * checkAchievements(state) returns IDs of achievements whose conditions are
 * currently met — the caller is responsible for filtering out already-unlocked
 * IDs before treating them as newly earned.
 */

import type { GameState, Position } from "@/engine/core/types";
import { ALL_PERKS } from "@/engine/specializations/perks";
import { getScenarioById, checkScenarioObjectives } from "@/engine/scenarios";

// =============================================================================
// TYPES
// =============================================================================

export type AchievementCategory =
  | "gettingStarted"
  | "careerMilestones"
  | "scoutingExcellence"
  | "specializationMastery"
  | "worldExplorer"
  | "matchAnalysis"
  | "financial"
  | "hidden";

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  /** Shown to the player while the achievement is locked. */
  hint: string;
  category: AchievementCategory;
  /** Emoji or icon name displayed on the achievement card. */
  icon: string;
  /** When true, hint is replaced with "Hidden Achievement" until unlocked. */
  hidden?: boolean;
  check: (state: GameState) => boolean;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Count the number of perks belonging to a given specialization that
 * are currently in the scout's unlockedPerks list.
 */
function countUnlockedPerksForSpec(
  state: GameState,
  spec: "youth" | "firstTeam" | "regional" | "data",
): number {
  const specPerkIds = new Set(
    ALL_PERKS.filter((p) => p.specialization === spec).map((p) => p.id),
  );
  return state.scout.unlockedPerks.filter((id) => specPerkIds.has(id)).length;
}

/**
 * Total perks available in a given specialization tree.
 */
function totalPerksForSpec(
  spec: "youth" | "firstTeam" | "regional" | "data",
): number {
  return ALL_PERKS.filter((p) => p.specialization === spec).length;
}

/**
 * The highest level perk the scout has unlocked in a given spec.
 * Returns 0 if no perks are unlocked for that spec.
 */
function maxUnlockedPerkLevelForSpec(
  state: GameState,
  spec: "youth" | "firstTeam" | "regional" | "data",
): number {
  const unlockedSet = new Set(state.scout.unlockedPerks);
  const specPerks = ALL_PERKS.filter(
    (p) => p.specialization === spec && unlockedSet.has(p.id),
  );
  if (specPerks.length === 0) return 0;
  return Math.max(...specPerks.map((p) => p.level));
}

/**
 * The maximum perk level available in a given spec (the mastery tier).
 */
function maxPerkLevelForSpec(
  spec: "youth" | "firstTeam" | "regional" | "data",
): number {
  const perks = ALL_PERKS.filter((p) => p.specialization === spec);
  if (perks.length === 0) return 0;
  return Math.max(...perks.map((p) => p.level));
}

/**
 * Whether the scout has fully unlocked all perks in a given spec tree.
 */
function hasCompletedTree(
  state: GameState,
  spec: "youth" | "firstTeam" | "regional" | "data",
): boolean {
  return countUnlockedPerksForSpec(state, spec) >= totalPerksForSpec(spec);
}

/**
 * Count distinct positions covered by the scout's reports.
 */
function countPositionsCovered(state: GameState): number {
  const positions = new Set<string>();
  for (const report of Object.values(state.reports)) {
    const player = state.players[report.playerId];
    if (player) positions.add(player.position);
  }
  return positions.size;
}

/**
 * Count contacts with relationship at or above a threshold.
 */
function countHighTrustContacts(state: GameState, threshold: number): number {
  return Object.values(state.contacts).filter(
    (c) => c.relationship >= threshold,
  ).length;
}

// =============================================================================
// ALL POSITIONS (for position coverage checks)
// =============================================================================

const ALL_POS: readonly Position[] = [
  "GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST",
];

// =============================================================================
// ACHIEVEMENT DEFINITIONS
// =============================================================================

export const ACHIEVEMENTS: AchievementDef[] = [
  // ---------------------------------------------------------------------------
  // Getting Started (8)
  // ---------------------------------------------------------------------------
  {
    id: "first-observation",
    name: "First Glance",
    description: "Submit your first observation.",
    hint: "Observe a player for the first time.",
    category: "gettingStarted",
    icon: "👁️",
    check: (state) => Object.keys(state.observations).length >= 1,
  },
  {
    id: "first-report",
    name: "Ink on Paper",
    description: "Write your first scouting report.",
    hint: "Write and submit a scouting report.",
    category: "gettingStarted",
    icon: "📝",
    check: (state) => Object.keys(state.reports).length >= 1,
  },
  {
    id: "first-week",
    name: "The Journey Begins",
    description: "Advance your first week.",
    hint: "Complete your first week as a scout.",
    category: "gettingStarted",
    icon: "🗓️",
    check: (state) => state.currentWeek >= 2,
  },
  {
    id: "first-match",
    name: "Matchday",
    description: "Attend your first live match.",
    hint: "Go to a live fixture to scout players in person.",
    category: "gettingStarted",
    icon: "⚽",
    check: (state) => state.playedFixtures.length >= 1,
  },
  {
    id: "first-contact",
    name: "Networking",
    description: "Meet your first contact.",
    hint: "Build your network by meeting a contact.",
    category: "gettingStarted",
    icon: "🤝",
    check: (state) =>
      Object.values(state.contacts).some((c) => c.relationship > 30),
  },
  {
    id: "first-perk",
    name: "Specializing",
    description: "Unlock your first perk.",
    hint: "Earn a specialization perk by levelling up.",
    category: "gettingStarted",
    icon: "⭐",
    check: (state) => state.scout.unlockedPerks.length >= 1,
  },
  {
    id: "first-equipment",
    name: "Tools of the Trade",
    description: "Purchase your first piece of equipment.",
    hint: "Buy your first scouting tool.",
    category: "gettingStarted",
    icon: "🔧",
    check: (state) => state.unlockedTools.length >= 1,
  },
  {
    id: "first-youth",
    name: "Future Stars",
    description: "Scout your first youth player.",
    hint: "Discover an unsigned youth player or write a placement report.",
    category: "gettingStarted",
    icon: "🌟",
    check: (state) =>
      state.discoveryRecords.length >= 1 ||
      Object.keys(state.placementReports).length >= 1,
  },

  // ---------------------------------------------------------------------------
  // Career Milestones (8)
  // ---------------------------------------------------------------------------
  {
    id: "reach-tier-2",
    name: "Rising Scout",
    description: "Reach Career Tier 2.",
    hint: "Progress your career to tier 2.",
    category: "careerMilestones",
    icon: "📈",
    check: (state) => state.scout.careerTier >= 2,
  },
  {
    id: "reach-tier-3",
    name: "Established",
    description: "Reach Career Tier 3.",
    hint: "Progress your career to tier 3.",
    category: "careerMilestones",
    icon: "🏆",
    check: (state) => state.scout.careerTier >= 3,
  },
  {
    id: "reach-tier-4",
    name: "Elite Scout",
    description: "Reach Career Tier 4.",
    hint: "Progress your career to tier 4.",
    category: "careerMilestones",
    icon: "🥇",
    check: (state) => state.scout.careerTier >= 4,
  },
  {
    id: "reach-tier-5",
    name: "Legend",
    description: "Reach Career Tier 5.",
    hint: "Reach the pinnacle of the scouting world.",
    category: "careerMilestones",
    icon: "👑",
    check: (state) => state.scout.careerTier >= 5,
  },
  {
    id: "season-1",
    name: "Survived",
    description: "Complete your first season.",
    hint: "Make it through an entire season.",
    category: "careerMilestones",
    icon: "🎯",
    check: (state) => state.currentSeason >= 2,
  },
  {
    id: "season-3",
    name: "Veteran",
    description: "Complete 3 seasons.",
    hint: "Keep scouting for 3 full seasons.",
    category: "careerMilestones",
    icon: "🎖️",
    check: (state) => state.currentSeason >= 4,
  },
  {
    id: "season-5",
    name: "Dedicated",
    description: "Complete 5 seasons.",
    hint: "Devote yourself to scouting for 5 seasons.",
    category: "careerMilestones",
    icon: "💪",
    check: (state) => state.currentSeason >= 6,
  },
  {
    id: "season-10",
    name: "Lifer",
    description: "Complete 10 seasons.",
    hint: "Give a decade of your life to the beautiful game.",
    category: "careerMilestones",
    icon: "🏅",
    check: (state) => state.currentSeason >= 11,
  },

  // ---------------------------------------------------------------------------
  // Scouting Excellence (12)
  // ---------------------------------------------------------------------------
  {
    id: "reports-10",
    name: "Prolific Reporter",
    description: "Submit 10 scouting reports.",
    hint: "File 10 reports over your career.",
    category: "scoutingExcellence",
    icon: "📄",
    check: (state) => Object.keys(state.reports).length >= 10,
  },
  {
    id: "reports-25",
    name: "Seasoned Analyst",
    description: "Submit 25 scouting reports.",
    hint: "Keep filing reports — 25 total.",
    category: "scoutingExcellence",
    icon: "📊",
    check: (state) => Object.keys(state.reports).length >= 25,
  },
  {
    id: "reports-50",
    name: "Report Machine",
    description: "Submit 50 scouting reports.",
    hint: "Reach 50 submitted reports.",
    category: "scoutingExcellence",
    icon: "🖨️",
    check: (state) => Object.keys(state.reports).length >= 50,
  },
  {
    id: "reports-100",
    name: "The Archive",
    description: "Submit 100 scouting reports.",
    hint: "Build a library of 100 reports.",
    category: "scoutingExcellence",
    icon: "📚",
    check: (state) => Object.keys(state.reports).length >= 100,
  },
  {
    id: "table-pound",
    name: "Table Pounder",
    description: "Submit a report with a Table Pound conviction.",
    hint: "Stake your reputation on a player — use the highest conviction level.",
    category: "scoutingExcellence",
    icon: "✊",
    check: (state) =>
      Object.values(state.reports).some((r) => r.conviction === "tablePound"),
  },
  {
    id: "wonderkid-found",
    name: "Diamond in the Rough",
    description: "Discover a wonderkid.",
    hint: "Be the first to identify a standout talent.",
    category: "scoutingExcellence",
    icon: "💎",
    check: (state) => state.discoveryRecords.length >= 1,
  },
  {
    id: "discoveries-5",
    name: "Eye for Talent",
    description: "Discover 5 wonderkids.",
    hint: "Identify 5 outstanding young talents before anyone else.",
    category: "scoutingExcellence",
    icon: "👁️‍🗨️",
    check: (state) => state.discoveryRecords.length >= 5,
  },
  {
    id: "discoveries-15",
    name: "Talent Factory",
    description: "Discover 15 wonderkids.",
    hint: "Build a legendary track record of 15 discoveries.",
    category: "scoutingExcellence",
    icon: "🏭",
    check: (state) => state.discoveryRecords.length >= 15,
  },
  {
    id: "high-accuracy",
    name: "Eagle Eye",
    description: "Achieve a report quality score above 85.",
    hint: "Produce a high-quality scouting report.",
    category: "scoutingExcellence",
    icon: "🦅",
    check: (state) =>
      Object.values(state.reports).some((r) => r.qualityScore > 85),
  },
  {
    id: "generational-talent",
    name: "Once in a Generation",
    description: "Discover a generational talent.",
    hint: "Find a player with once-in-a-generation potential.",
    category: "scoutingExcellence",
    icon: "🌠",
    check: (state) =>
      state.discoveryRecords.some((record) => {
        const player = state.players[record.playerId];
        return player?.wonderkidTier === "generational";
      }),
  },
  {
    id: "full-house",
    name: "Full House",
    description: "Submit a report for every position.",
    hint: "Cover all 10 positions with at least one scouting report each.",
    category: "scoutingExcellence",
    icon: "🃏",
    check: (state) => countPositionsCovered(state) >= ALL_POS.length,
  },
  {
    id: "perfect-record",
    name: "Perfect Record",
    description: "Have 10+ reports with all receiving positive club responses.",
    hint: "Submit 10 or more reports that clubs shortlist or sign.",
    category: "scoutingExcellence",
    icon: "💯",
    check: (state) => {
      const reports = Object.values(state.reports).filter(
        (r) => r.clubResponse !== undefined,
      );
      if (reports.length < 10) return false;
      return reports.every(
        (r) => r.clubResponse === "shortlisted" || r.clubResponse === "signed",
      );
    },
  },

  // ---------------------------------------------------------------------------
  // Youth Development (5) — NEW CATEGORY (was part of scoutingExcellence)
  // ---------------------------------------------------------------------------
  {
    id: "alumni-5",
    name: "Talent Pipeline",
    description: "Have 5 alumni debuts.",
    hint: "Place 5 youth players who go on to make their debuts.",
    category: "scoutingExcellence",
    icon: "🌱",
    check: (state) => state.alumniRecords.length >= 5,
  },
  {
    id: "alumni-15",
    name: "Youth Whisperer",
    description: "Have 15 alumni debuts.",
    hint: "Place 15 youth players who make their professional debuts.",
    category: "scoutingExcellence",
    icon: "🧙",
    check: (state) => state.alumniRecords.length >= 15,
  },
  {
    id: "alumni-international",
    name: "International Talent",
    description: "Have an alumni earn an international call-up.",
    hint: "Place a youth player who goes on to represent their country.",
    category: "scoutingExcellence",
    icon: "🌍",
    check: (state) =>
      state.alumniRecords.some((record) =>
        record.milestones.some((m) => m.type === "internationalCallUp"),
      ),
  },
  {
    id: "academy-gold",
    name: "Academy Gold",
    description: "Place 5+ youth who average 7+ in match ratings.",
    hint: "Your youth placements consistently perform at a high level.",
    category: "scoutingExcellence",
    icon: "🥇",
    check: (state) => {
      let highPerformers = 0;
      for (const record of state.alumniRecords) {
        const player = state.players[record.playerId];
        if (!player) continue;
        const ratings = player.recentMatchRatings ?? [];
        if (ratings.length === 0) continue;
        const avg =
          ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
        if (avg >= 7) highPerformers++;
      }
      return highPerformers >= 5;
    },
  },

  // ---------------------------------------------------------------------------
  // Specialization Mastery (8)
  // ---------------------------------------------------------------------------
  {
    id: "max-spec",
    name: "Master of One",
    description: "Max out any specialization.",
    hint: "Unlock all perks in at least one specialization tree.",
    category: "specializationMastery",
    icon: "🎓",
    check: (state) =>
      (["youth", "firstTeam", "regional", "data"] as const).some((spec) =>
        hasCompletedTree(state, spec),
      ),
  },
  {
    id: "all-perks-tree",
    name: "Polymath",
    description: "Complete perk trees in 2 or more specializations.",
    hint: "Fully explore at least two different specialization trees.",
    category: "specializationMastery",
    icon: "🌳",
    check: (state) => {
      const specs = ["youth", "firstTeam", "regional", "data"] as const;
      const completedCount = specs.filter((spec) =>
        hasCompletedTree(state, spec),
      ).length;
      return completedCount >= 2;
    },
  },
  {
    id: "mastery-perk",
    name: "True Mastery",
    description: "Unlock a mastery-tier perk.",
    hint: "Reach the highest level perk in any specialization.",
    category: "specializationMastery",
    icon: "💫",
    check: (state) =>
      (["youth", "firstTeam", "regional", "data"] as const).some(
        (spec) =>
          maxUnlockedPerkLevelForSpec(state, spec) >=
          maxPerkLevelForSpec(spec),
      ),
  },
  {
    id: "dual-mastery",
    name: "Renaissance Scout",
    description: "Earn mastery in 2 different specializations.",
    hint: "Reach the mastery-tier perk in two separate specialization trees.",
    category: "specializationMastery",
    icon: "🎨",
    check: (state) => {
      const specs = ["youth", "firstTeam", "regional", "data"] as const;
      const masteredCount = specs.filter(
        (spec) =>
          maxUnlockedPerkLevelForSpec(state, spec) >=
          maxPerkLevelForSpec(spec),
      ).length;
      return masteredCount >= 2;
    },
  },
  {
    id: "equipment-maxed",
    name: "Fully Equipped",
    description: "Have all equipment slots at maximum tier.",
    hint: "Purchase all available scouting tools.",
    category: "specializationMastery",
    icon: "🧰",
    check: (state) => state.unlockedTools.length >= 9,
  },
  {
    id: "secondary-spec",
    name: "Dual Threat",
    description: "Unlock a secondary specialization.",
    hint: "Diversify your expertise beyond your primary specialization.",
    category: "specializationMastery",
    icon: "⚔️",
    check: (state) => state.scout.secondarySpecialization !== undefined,
  },
  {
    id: "all-activities",
    name: "Jack of All Trades",
    description: "Perform every activity type at least once.",
    hint: "Try every type of activity available to a scout.",
    category: "specializationMastery",
    icon: "🎭",
    check: (state) => {
      const performed = new Set<string>();
      if (state.schedule.completed) {
        for (const activity of state.schedule.activities) {
          if (activity) performed.add(activity.type);
        }
      }
      for (const obs of Object.values(state.observations)) {
        performed.add(obs.context);
      }
      return performed.size >= 5;
    },
  },
  {
    id: "rep-50",
    name: "Well Known",
    description: "Reach 50 reputation.",
    hint: "Build your reputation to 50 or above.",
    category: "specializationMastery",
    icon: "🌟",
    check: (state) => state.scout.reputation >= 50,
  },

  // ---------------------------------------------------------------------------
  // World Explorer (6)
  // ---------------------------------------------------------------------------
  {
    id: "countries-3",
    name: "Frequent Flyer",
    description: "Scout in 3 countries.",
    hint: "Expand your reach to 3 different countries.",
    category: "worldExplorer",
    icon: "✈️",
    check: (state) => Object.keys(state.scout.countryReputations).length >= 3,
  },
  {
    id: "countries-6",
    name: "Globetrotter",
    description: "Scout in 6 countries.",
    hint: "Build a presence across 6 countries.",
    category: "worldExplorer",
    icon: "🗺️",
    check: (state) => Object.keys(state.scout.countryReputations).length >= 6,
  },
  {
    id: "countries-10",
    name: "World Scout",
    description: "Scout in 10 countries.",
    hint: "Establish yourself in 10 countries around the world.",
    category: "worldExplorer",
    icon: "🌐",
    check: (state) => Object.keys(state.scout.countryReputations).length >= 10,
  },
  {
    id: "countries-15",
    name: "Global Network",
    description: "Scout in 15 countries.",
    hint: "Build a truly global scouting network across 15 countries.",
    category: "worldExplorer",
    icon: "🛸",
    check: (state) => Object.keys(state.scout.countryReputations).length >= 15,
  },
  {
    id: "home-mastery",
    name: "Home Turf",
    description: "Achieve full familiarity in your home country.",
    hint: "Reach maximum familiarity (100) in your first scouted country.",
    category: "worldExplorer",
    icon: "🏠",
    check: (state) => {
      if (state.countries.length === 0) return false;
      const homeCountry = state.countries[0];
      const rep = state.scout.countryReputations[homeCountry];
      return rep !== undefined && rep.familiarity >= 100;
    },
  },
  {
    id: "all-continents",
    name: "Continental",
    description: "Submit a report on a player from every continent.",
    hint: "Scout players representing all major football continents.",
    category: "worldExplorer",
    icon: "🌍",
    check: (state) => {
      const nationalities = new Set<string>();
      for (const report of Object.values(state.reports)) {
        const player = state.players[report.playerId];
        if (player) nationalities.add(player.nationality);
      }
      return nationalities.size >= 5;
    },
  },

  // ---------------------------------------------------------------------------
  // Match & Analysis (6) — NEW CATEGORY
  // ---------------------------------------------------------------------------
  {
    id: "matches-25",
    name: "Regular Attendee",
    description: "Attend 25 live matches.",
    hint: "Watch 25 matches in person.",
    category: "matchAnalysis",
    icon: "🏟️",
    check: (state) => state.playedFixtures.length >= 25,
  },
  {
    id: "matches-50",
    name: "Stadium Regular",
    description: "Attend 50 live matches.",
    hint: "Watch 50 matches in person to deepen your assessment skills.",
    category: "matchAnalysis",
    icon: "🎫",
    check: (state) => state.playedFixtures.length >= 50,
  },
  {
    id: "matches-100",
    name: "Match Junkie",
    description: "Attend 100 live matches.",
    hint: "You practically live at the stadium. Attend 100 matches.",
    category: "matchAnalysis",
    icon: "🔥",
    check: (state) => state.playedFixtures.length >= 100,
  },
  {
    id: "observations-50",
    name: "Keen Observer",
    description: "Make 50 observations.",
    hint: "Carefully observe 50 players across your career.",
    category: "matchAnalysis",
    icon: "🔍",
    check: (state) => Object.keys(state.observations).length >= 50,
  },
  {
    id: "observations-200",
    name: "Analyst",
    description: "Make 200 observations.",
    hint: "Accumulate 200 detailed player observations.",
    category: "matchAnalysis",
    icon: "📐",
    check: (state) => Object.keys(state.observations).length >= 200,
  },
  {
    id: "observations-500",
    name: "All-Seeing Eye",
    description: "Make 500 observations.",
    hint: "Nothing escapes your gaze. Make 500 observations.",
    category: "matchAnalysis",
    icon: "👁️",
    check: (state) => Object.keys(state.observations).length >= 500,
  },

  // ---------------------------------------------------------------------------
  // Social & Network (5) — NEW CATEGORY (uses existing contact system)
  // ---------------------------------------------------------------------------
  {
    id: "contacts-5",
    name: "Connected",
    description: "Have 5 contacts with high trust.",
    hint: "Build strong relationships (60+) with 5 contacts.",
    category: "matchAnalysis",
    icon: "📱",
    check: (state) => countHighTrustContacts(state, 60) >= 5,
  },
  {
    id: "contacts-15",
    name: "Network Master",
    description: "Have 15 contacts with high trust.",
    hint: "Build a massive network of 15 high-trust contacts.",
    category: "matchAnalysis",
    icon: "🕸️",
    check: (state) => countHighTrustContacts(state, 60) >= 15,
  },
  {
    id: "rep-75",
    name: "Industry Name",
    description: "Reach 75 reputation.",
    hint: "Your name carries weight. Build reputation to 75.",
    category: "matchAnalysis",
    icon: "📢",
    check: (state) => state.scout.reputation >= 75,
  },
  {
    id: "rep-100",
    name: "Living Legend",
    description: "Reach maximum reputation (100).",
    hint: "Become the most renowned scout in the world.",
    category: "matchAnalysis",
    icon: "🏛️",
    check: (state) => state.scout.reputation >= 100,
  },

  // ---------------------------------------------------------------------------
  // Financial (5) — NEW CATEGORY
  // ---------------------------------------------------------------------------
  {
    id: "savings-100k",
    name: "Nest Egg",
    description: "Accumulate 100,000 in savings.",
    hint: "Build up your financial reserves to 100,000.",
    category: "financial",
    icon: "💰",
    check: (state) => (state.finances?.balance ?? 0) >= 100_000,
  },
  {
    id: "savings-500k",
    name: "Self-Made",
    description: "Accumulate 500,000 in savings with no active loans.",
    hint: "Reach 500,000 in the bank with zero debt.",
    category: "financial",
    icon: "🏦",
    check: (state) =>
      (state.finances?.balance ?? 0) >= 500_000 &&
      state.finances?.activeLoan === undefined,
  },
  {
    id: "big-spender",
    name: "Big Spender",
    description: "Complete a full infrastructure upgrade.",
    hint: "Upgrade your office to the highest tier.",
    category: "financial",
    icon: "🏗️",
    check: (state) => state.finances?.office?.tier === "hq",
  },
  {
    id: "first-employee",
    name: "Building a Team",
    description: "Hire your first employee.",
    hint: "Expand your agency by hiring your first staff member.",
    category: "financial",
    icon: "👔",
    check: (state) => (state.finances?.employees?.length ?? 0) >= 1,
  },
  {
    id: "agency-empire",
    name: "Agency Empire",
    description: "Have 5+ employees and 3+ client relationships.",
    hint: "Build a thriving agency with staff and clients.",
    category: "financial",
    icon: "🏢",
    check: (state) =>
      (state.finances?.employees?.length ?? 0) >= 5 &&
      (state.finances?.clientRelationships?.length ?? 0) >= 3,
  },

  // ---------------------------------------------------------------------------
  // Challenge (3) — uses hidden category for surprise
  // ---------------------------------------------------------------------------
  {
    id: "speedrun",
    name: "Speedrun",
    description: "Reach Career Tier 5 in under 10 seasons.",
    hint: "Hidden Achievement",
    category: "hidden",
    icon: "⏱️",
    hidden: true,
    check: (state) =>
      state.scout.careerTier >= 5 && state.currentSeason <= 10,
  },
  {
    id: "against-all-odds",
    name: "Against All Odds",
    description: "Complete a scenario on hard difficulty.",
    hint: "Hidden Achievement",
    category: "hidden",
    icon: "🎲",
    hidden: true,
    check: (state) => {
      const scenarioId = state.activeScenarioId;
      if (!scenarioId) return false;
      const scenario = getScenarioById(scenarioId);
      if (!scenario) return false;
      if (scenario.difficulty !== "hard" && scenario.difficulty !== "expert") return false;
      const progress = checkScenarioObjectives(state, scenarioId);
      return progress.allRequiredComplete;
    },
  },
  {
    id: "streak-5",
    name: "Hot Streak",
    description: "Have 5 consecutive reports receive positive club responses.",
    hint: "Hidden Achievement",
    category: "hidden",
    icon: "🔥",
    hidden: true,
    check: (state) => {
      const reports = Object.values(state.reports)
        .filter((r) => r.clubResponse !== undefined)
        .sort(
          (a, b) =>
            a.submittedSeason * 100 + a.submittedWeek -
            (b.submittedSeason * 100 + b.submittedWeek),
        );
      let streak = 0;
      for (const r of reports) {
        if (
          r.clubResponse === "shortlisted" ||
          r.clubResponse === "signed"
        ) {
          streak++;
          if (streak >= 5) return true;
        } else {
          streak = 0;
        }
      }
      return false;
    },
  },

  // ---------------------------------------------------------------------------
  // Hidden (5) — kept from original + expanded
  // ---------------------------------------------------------------------------
  {
    id: "blind-faith",
    name: "Blind Faith",
    description: "Submit a report on a player with 0 observations.",
    hint: "Hidden Achievement",
    category: "hidden",
    icon: "🙈",
    hidden: true,
    check: (state) => {
      for (const report of Object.values(state.reports)) {
        const hasObservation = Object.values(state.observations).some(
          (obs) => obs.playerId === report.playerId,
        );
        if (!hasObservation) return true;
      }
      return false;
    },
  },
  {
    id: "triple-storyline",
    name: "Drama Magnet",
    description: "Have 3 active narrative events in the same season.",
    hint: "Hidden Achievement",
    category: "hidden",
    icon: "🎭",
    hidden: true,
    check: (state) => {
      const seasonCounts: Record<number, number> = {};
      for (const event of state.narrativeEvents) {
        if (!event.acknowledged) {
          seasonCounts[event.season] = (seasonCounts[event.season] ?? 0) + 1;
        }
      }
      return Object.values(seasonCounts).some((count) => count >= 3);
    },
  },
  {
    id: "survived-firing",
    name: "Comeback Kid",
    description: "Continue playing after being fired.",
    hint: "Hidden Achievement",
    category: "hidden",
    icon: "🔥",
    hidden: true,
    check: (state) =>
      state.performanceReviews.some((r) => r.outcome === "fired") &&
      state.currentSeason >=
        (state.performanceReviews.find((r) => r.outcome === "fired")?.season ??
          9999) +
          1,
  },
  {
    id: "watchlist-10",
    name: "The Shortlist",
    description: "Have 10 players on your watchlist.",
    hint: "Hidden Achievement",
    category: "hidden",
    icon: "📋",
    hidden: true,
    check: (state) => state.watchlist.length >= 10,
  },
  {
    id: "marathon",
    name: "Marathon Scout",
    description: "Play for 50 or more weeks total.",
    hint: "Hidden Achievement",
    category: "hidden",
    icon: "🏃",
    hidden: true,
    check: (state) =>
      (state.currentSeason - 1) * 52 + state.currentWeek >= 50,
  },
];

// =============================================================================
// CHECK FUNCTION
// =============================================================================

/**
 * Run all achievement checks against the current game state and return
 * the IDs of achievements whose conditions are met.
 *
 * The caller (achievementStore) is responsible for filtering out IDs that
 * are already unlocked before treating them as newly earned.
 */
export function checkAchievements(state: GameState): string[] {
  const unlocked: string[] = [];
  for (const achievement of ACHIEVEMENTS) {
    try {
      if (achievement.check(state)) {
        unlocked.push(achievement.id);
      }
    } catch {
      // Defensive: if a check throws (e.g. missing state field), skip it.
    }
  }
  return unlocked;
}
