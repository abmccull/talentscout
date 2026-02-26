/**
 * Maps in-game achievement IDs to Steam achievement API names.
 *
 * Steam convention uses SCREAMING_SNAKE_CASE for achievement API names.
 * This map provides a one-to-one mapping from our camelCase/kebab-case IDs
 * to Steam's naming convention.
 */

export const STEAM_ACHIEVEMENT_MAP: Record<string, string> = {
  // Getting Started
  "first-observation": "FIRST_OBSERVATION",
  "first-report": "FIRST_REPORT",
  "first-week": "FIRST_WEEK",
  "first-match": "FIRST_MATCH",
  "first-contact": "FIRST_CONTACT",
  "first-perk": "FIRST_PERK",
  "first-equipment": "FIRST_EQUIPMENT",
  "first-youth": "FIRST_YOUTH",

  // Career Milestones
  "reach-tier-2": "REACH_TIER_2",
  "reach-tier-3": "REACH_TIER_3",
  "reach-tier-4": "REACH_TIER_4",
  "reach-tier-5": "REACH_TIER_5",
  "season-1": "SEASON_1",
  "season-3": "SEASON_3",
  "season-5": "SEASON_5",
  "season-10": "SEASON_10",

  // Scouting Excellence
  "reports-10": "REPORTS_10",
  "reports-25": "REPORTS_25",
  "reports-50": "REPORTS_50",
  "reports-100": "REPORTS_100",
  "table-pound": "TABLE_POUND",
  "wonderkid-found": "WONDERKID_FOUND",
  "discoveries-5": "DISCOVERIES_5",
  "discoveries-15": "DISCOVERIES_15",
  "alumni-5": "ALUMNI_5",
  "alumni-15": "ALUMNI_15",
  "alumni-international": "ALUMNI_INTERNATIONAL",
  "academy-gold": "ACADEMY_GOLD",
  "high-accuracy": "HIGH_ACCURACY",
  "generational-talent": "GENERATIONAL_TALENT",
  "full-house": "FULL_HOUSE",
  "perfect-record": "PERFECT_RECORD",

  // Specialization Mastery
  "max-spec": "MAX_SPEC",
  "all-perks-tree": "ALL_PERKS_TREE",
  "mastery-perk": "MASTERY_PERK",
  "dual-mastery": "DUAL_MASTERY",
  "equipment-maxed": "EQUIPMENT_MAXED",
  "secondary-spec": "SECONDARY_SPEC",
  "all-activities": "ALL_ACTIVITIES",
  "rep-50": "REP_50",

  // World Explorer
  "countries-3": "COUNTRIES_3",
  "countries-6": "COUNTRIES_6",
  "countries-10": "COUNTRIES_10",
  "countries-15": "COUNTRIES_15",
  "home-mastery": "HOME_MASTERY",
  "all-continents": "ALL_CONTINENTS",

  // Match & Analysis
  "matches-25": "MATCHES_25",
  "matches-50": "MATCHES_50",
  "matches-100": "MATCHES_100",
  "observations-50": "OBSERVATIONS_50",
  "observations-200": "OBSERVATIONS_200",
  "observations-500": "OBSERVATIONS_500",
  "contacts-5": "CONTACTS_5",
  "contacts-15": "CONTACTS_15",
  "rep-75": "REP_75",
  "rep-100": "REP_100",

  // Financial
  "savings-100k": "SAVINGS_100K",
  "savings-500k": "SAVINGS_500K",
  "big-spender": "BIG_SPENDER",
  "first-employee": "FIRST_EMPLOYEE",
  "agency-empire": "AGENCY_EMPIRE",

  // Hidden / Challenge
  "blind-faith": "BLIND_FAITH",
  "triple-storyline": "TRIPLE_STORYLINE",
  "survived-firing": "SURVIVED_FIRING",
  "watchlist-10": "WATCHLIST_10",
  "marathon": "MARATHON",
  "speedrun": "SPEEDRUN",
  "against-all-odds": "AGAINST_ALL_ODDS",
  "streak-5": "STREAK_5",
};

/**
 * Get the Steam API name for an in-game achievement ID.
 * Returns undefined if the achievement has no Steam mapping.
 */
export function getSteamAchievementName(
  gameId: string,
): string | undefined {
  return STEAM_ACHIEVEMENT_MAP[gameId];
}
