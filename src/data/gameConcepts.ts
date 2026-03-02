/**
 * Game Concept Dictionary — central definitions for the nested tooltip system.
 *
 * Each concept has a unique key, a human-readable label, a concise definition,
 * an optional category for grouping, optional references to other concepts
 * (used for nested tooltips), and an optional handbook chapter link.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GameConcept {
  /** Unique key used to reference this concept (e.g. "reputation"). */
  key: string;
  /** Display label shown in the tooltip header. */
  label: string;
  /** Concise definition (1-3 sentences). */
  definition: string;
  /** Grouping category. */
  category: GameConceptCategory;
  /** Keys of other GameConcepts referenced in the definition. */
  related?: string[];
  /** Handbook chapter ID for "Learn more" link. */
  handbookChapter?: string;
}

export type GameConceptCategory =
  | "core"
  | "scouting"
  | "match"
  | "report"
  | "career"
  | "youth"
  | "data"
  | "financial";

// ---------------------------------------------------------------------------
// Concept definitions
// ---------------------------------------------------------------------------

export const GAME_CONCEPTS: GameConcept[] = [
  // ── Core ─────────────────────────────────────────────────────────────────

  {
    key: "reputation",
    label: "Reputation",
    definition:
      "A 0–100 score reflecting how the football world sees you. Accurate reports and successful placements raise it; bad calls lower it. Reputation determines your career tier and the quality of jobs available.",
    category: "core",
    related: ["career-tier", "conviction-level"],
    handbookChapter: "getting-started",
  },
  {
    key: "fatigue",
    label: "Fatigue",
    definition:
      "Accumulates from scouting activities and travel. Above ~60 your observation accuracy degrades. Schedule rest days to recover — exhausted scouts make worse reads.",
    category: "core",
    related: ["rest-day", "accuracy"],
    handbookChapter: "getting-started",
  },
  {
    key: "savings",
    label: "Savings",
    definition:
      "Your current cash balance. Freelance scouts rely on savings to fund travel, equipment, and staff. Running out forces difficult choices about which opportunities to pursue.",
    category: "core",
    related: ["marketplace", "consulting-fee"],
    handbookChapter: "getting-started",
  },
  {
    key: "career-tier",
    label: "Career Tier",
    definition:
      "Your professional rank from 1–5. Each tier unlocks access to higher-profile leagues, better contacts, and larger budgets. Tier thresholds: 0, 25, 50, 70, 90 reputation.",
    category: "core",
    related: ["reputation", "perk"],
    handbookChapter: "career",
  },
  {
    key: "specialization",
    label: "Specialization",
    definition:
      "Your area of expertise: Youth, First Team, Regional, or Data. Each specialization has unique activities, a 20-level progression with perks, and a +1% accuracy bonus per level.",
    category: "core",
    related: ["specialization-level", "perk"],
    handbookChapter: "specializations",
  },
  {
    key: "specialization-level",
    label: "Specialization Level",
    definition:
      "Your expertise rank (1–20) within your chosen specialization. Higher levels unlock perks and provide cumulative accuracy bonuses.",
    category: "core",
    related: ["specialization", "perk"],
    handbookChapter: "specializations",
  },
  {
    key: "rest-day",
    label: "Rest Day",
    definition:
      "An unscheduled day on your calendar. Two or three rest days per week keeps fatigue manageable. Leaving days empty isn't wasted — it's recovery.",
    category: "core",
    related: ["fatigue"],
    handbookChapter: "activities",
  },
  {
    key: "game-week",
    label: "Game Week",
    definition:
      "The basic unit of time. Each week you plan activities on the calendar, advance time, and the engine processes everything — matches, development, transfers, finances.",
    category: "core",
    handbookChapter: "getting-started",
  },

  // ── Scouting ─────────────────────────────────────────────────────────────

  {
    key: "observation",
    label: "Observation",
    definition:
      "A record of watching a player in a specific context (match, video, training). Multiple observations increase your confidence in attribute readings.",
    category: "scouting",
    related: ["accuracy", "confidence", "focus-lens"],
    handbookChapter: "scouting-reports",
  },
  {
    key: "conviction-level",
    label: "Conviction Level",
    definition:
      "How strongly you back a player in your report. Four levels: Note (safe), Recommend, Strong Recommend, and Table Pound (career-defining). Higher conviction = bigger reward if right, bigger reputation hit if wrong.",
    category: "scouting",
    related: ["reputation", "table-pound"],
    handbookChapter: "scouting-reports",
  },
  {
    key: "table-pound",
    label: "Table Pound",
    definition:
      "The highest conviction level. You stake your career reputation on this player. Limited uses per season. If you're right, massive reputation and financial gain. If wrong, serious damage.",
    category: "scouting",
    related: ["conviction-level", "reputation"],
    handbookChapter: "scouting-reports",
  },
  {
    key: "focus-lens",
    label: "Focus Lens",
    definition:
      "During a match, choose a lens to narrow your observation: Technical, Physical, Mental, Tactical, or General. The lens determines which attributes are revealed with higher accuracy.",
    category: "scouting",
    related: ["observation", "accuracy"],
    handbookChapter: "match-observation",
  },
  {
    key: "perceived-ability",
    label: "Perceived Ability",
    definition:
      "Your estimate of a player's current ability, derived from observations. It may differ from their actual ability — the gap narrows with more observations and better focus lenses.",
    category: "scouting",
    related: ["actual-ability", "accuracy", "confidence"],
    handbookChapter: "scouting-reports",
  },
  {
    key: "actual-ability",
    label: "Actual Ability",
    definition:
      "A player's true current ability rating, hidden from the scout. The gap between your perceived ability and actual ability determines how accurate your reports are.",
    category: "scouting",
    related: ["perceived-ability", "potential-ability"],
    handbookChapter: "scouting-reports",
  },
  {
    key: "potential-ability",
    label: "Potential Ability (PA)",
    definition:
      "A player's ceiling — the maximum ability they could reach with ideal development. Youth scouts specialize in estimating PA, which is harder to read than current ability.",
    category: "scouting",
    related: ["actual-ability", "pa-estimate"],
    handbookChapter: "youth",
  },
  {
    key: "pa-estimate",
    label: "PA Estimate",
    definition:
      "Your estimated range for a player's potential ability, displayed as a confidence interval. Better observations and youth scouting perks narrow the range.",
    category: "scouting",
    related: ["potential-ability", "confidence"],
    handbookChapter: "youth",
  },
  {
    key: "visibility",
    label: "Visibility",
    definition:
      "The first layer of the perception model. Determines which attributes you can observe in a given match phase. Not all attributes are visible in every phase — build-up shows passing but not heading.",
    category: "scouting",
    related: ["accuracy", "confidence"],
    handbookChapter: "match-observation",
  },
  {
    key: "accuracy",
    label: "Accuracy",
    definition:
      "The second perception layer. How close your perceived attribute value is to the true value. Improved by specialization level, equipment, familiarity, and observation conditions.",
    category: "scouting",
    related: ["visibility", "confidence", "fatigue"],
    handbookChapter: "match-observation",
  },
  {
    key: "confidence",
    label: "Confidence",
    definition:
      "The third perception layer. The uncertainty range around your attribute estimate (e.g. [13–16]). More observations and better conditions shrink the range, giving you a more reliable read.",
    category: "scouting",
    related: ["accuracy", "observation"],
    handbookChapter: "match-observation",
  },
  {
    key: "shortlist",
    label: "Shortlist",
    definition:
      "Your personal watchlist of players. Pin players here to track them across the season. Clients often ask for shortlist summaries.",
    category: "scouting",
    related: ["observation"],
    handbookChapter: "scouting-reports",
  },

  // ── Match ────────────────────────────────────────────────────────────────

  {
    key: "match-phase",
    label: "Match Phase",
    definition:
      "Each match is broken into 12–18 tactical passages of play. Phase types include build-up, transition, set piece, pressing, counter-attack, and possession. Different phases reveal different attributes.",
    category: "match",
    related: ["visibility", "focus-lens"],
    handbookChapter: "match-observation",
  },
  {
    key: "build-up",
    label: "Build-Up",
    definition:
      "A match phase type featuring controlled possession play. Reveals passing, first touch, dribbling, composure, positioning, and decision-making attributes.",
    category: "match",
    related: ["match-phase"],
    handbookChapter: "match-observation",
  },
  {
    key: "transition",
    label: "Transition",
    definition:
      "A match phase type where play shifts between attack and defense. Reveals pace, stamina, agility, decision-making, passing, and off-the-ball movement.",
    category: "match",
    related: ["match-phase"],
    handbookChapter: "match-observation",
  },
  {
    key: "set-piece",
    label: "Set Piece",
    definition:
      "A match phase type for dead-ball situations (corners, free kicks). Reveals heading, strength, crossing, composure, positioning, and defensive awareness.",
    category: "match",
    related: ["match-phase"],
    handbookChapter: "match-observation",
  },
  {
    key: "weather-effect",
    label: "Weather Effect",
    definition:
      "Weather conditions affect observation accuracy. Clear weather (×0.8 noise) is ideal; snow (×1.8 noise) is worst. Rain, wind, and heavy conditions all degrade your readings.",
    category: "match",
    related: ["accuracy"],
    handbookChapter: "match-observation",
  },
  {
    key: "atmosphere",
    label: "Atmosphere",
    definition:
      "Match atmosphere reflects crowd intensity and venue conditions. Higher-profile matches provide better reading conditions but also attract rival scouts.",
    category: "match",
    related: ["match-phase"],
    handbookChapter: "match-observation",
  },
  {
    key: "star-rating",
    label: "Star Rating",
    definition:
      "A quick-glance quality indicator for players, similar to Football Manager. Based on your scout's perception — a better scout sees more accurate star ratings.",
    category: "match",
    related: ["perceived-ability", "accuracy"],
    handbookChapter: "scouting-reports",
  },

  // ── Report ───────────────────────────────────────────────────────────────

  {
    key: "report-quality",
    label: "Report Quality",
    definition:
      "A composite score based on attributes assessed, average confidence, accuracy vs true values, conviction alignment, and equipment bonuses. Higher quality reports earn better responses from clubs.",
    category: "report",
    related: ["conviction-level", "confidence", "accuracy"],
    handbookChapter: "scouting-reports",
  },
  {
    key: "system-fit",
    label: "System Fit",
    definition:
      "How well a player matches a club's tactical identity and positional needs. First Team scouts evaluate system fit to determine if a player will thrive in a specific setup.",
    category: "report",
    related: ["directive"],
    handbookChapter: "scouting-reports",
  },
  {
    key: "gut-feeling",
    label: "Gut Feeling",
    definition:
      "An intuitive assessment that supplements data. Sometimes your gut tells you a player has 'it' — or doesn't. Equipment and perks can improve gut feeling reliability.",
    category: "report",
    related: ["observation", "accuracy"],
    handbookChapter: "scouting-reports",
  },

  // ── Career ───────────────────────────────────────────────────────────────

  {
    key: "perk",
    label: "Perk",
    definition:
      "Passive abilities unlocked at specific specialization levels. Each specialization has 8 perks (at levels 1, 3, 5, 7, 9, 12, 15, 18) that compound over your career. Choose wisely — you can't unlock everything.",
    category: "career",
    related: ["specialization-level", "specialization"],
    handbookChapter: "specializations",
  },
  {
    key: "equipment-slot",
    label: "Equipment Slot",
    definition:
      "One of 5 gear categories: Notebook, Video, Travel, Network, and Analysis. Each slot can hold one item that provides passive bonuses. Higher-tier items cost more but compound your edge.",
    category: "career",
    related: ["equipment-bonus"],
    handbookChapter: "equipment",
  },
  {
    key: "equipment-bonus",
    label: "Equipment Bonus",
    definition:
      "Passive bonuses from equipped items — improved accuracy, reduced fatigue, better network gains, higher report quality. Fill every slot before a big week.",
    category: "career",
    related: ["equipment-slot", "accuracy"],
    handbookChapter: "equipment",
  },
  {
    key: "contact",
    label: "Contact",
    definition:
      "A person in your professional network — agents, scouts, club staff, journalists, academy coaches. Relationship strength determines what intel they share. 11 contact types exist.",
    category: "career",
    related: ["relationship", "intel"],
    handbookChapter: "contacts",
  },
  {
    key: "relationship",
    label: "Relationship",
    definition:
      "A 0–100 score representing your bond with a contact. Built through meetings and acting on tips. High-relationship contacts share exclusive intel. Scores decay without maintenance.",
    category: "career",
    related: ["contact", "intel"],
    handbookChapter: "contacts",
  },
  {
    key: "intel",
    label: "Intel",
    definition:
      "Information shared by contacts — transfer rumours, fixture tips, player gossip. Not always accurate, but high-trust sources are rarely wrong. Intel reliability is a hidden score you discover over time.",
    category: "career",
    related: ["contact", "relationship"],
    handbookChapter: "contacts",
  },
  {
    key: "directive",
    label: "Directive",
    definition:
      "A priority assignment from your club manager specifying a position, age range, and budget to fill. Unfulfilled directives affect job security. Check your inbox for new directives.",
    category: "career",
    related: ["system-fit"],
    handbookChapter: "scouting-reports",
  },
  {
    key: "retainer",
    label: "Retainer",
    definition:
      "A contract where a club pays you a recurring fee for ongoing scouting coverage in a territory. Regional Experts attract the best retainer offers. Provides stable income.",
    category: "career",
    related: ["consulting-fee"],
    handbookChapter: "career",
  },
  {
    key: "npc-scout",
    label: "NPC Scout",
    definition:
      "An assistant scout you hire at Tier 4+. Assign them territories and they generate reports automatically. Their skills affect report quality — manage them like staff.",
    category: "career",
    related: ["career-tier"],
    handbookChapter: "career",
  },

  // ── Youth ────────────────────────────────────────────────────────────────

  {
    key: "unsigned-youth",
    label: "Unsigned Youth",
    definition:
      "Players in grassroots, school, and tournament football not yet signed to a professional academy. Youth Scouts discover them through exclusive activities like School Matches and Grassroots Tournaments.",
    category: "youth",
    related: ["placement-report", "legacy-score"],
    handbookChapter: "youth",
  },
  {
    key: "placement-report",
    label: "Placement Report",
    definition:
      "A special report for unsigned youth players recommending them to a specific academy. Includes PA estimate and target club. Successful placements earn fees and build Legacy Score.",
    category: "youth",
    related: ["unsigned-youth", "potential-ability", "legacy-score"],
    handbookChapter: "youth",
  },
  {
    key: "alumni",
    label: "Alumni",
    definition:
      "Players you've placed at clubs who have moved on in their careers. Strong alumni relationships generate referrals and unsolicited intel. They remember who gave them their start.",
    category: "youth",
    related: ["placement-report", "legacy-score"],
    handbookChapter: "youth",
  },
  {
    key: "legacy-score",
    label: "Legacy Score",
    definition:
      "Your long-term impact metric. Grows as placed youth make debuts, score goals, earn caps. This is what separates a career youth scout from everyone else.",
    category: "youth",
    related: ["unsigned-youth", "alumni"],
    handbookChapter: "youth",
  },

  // ── Data ─────────────────────────────────────────────────────────────────

  {
    key: "anomaly-detection",
    label: "Anomaly Detection",
    definition:
      "A Data Scout perk that flags players whose performance deviates from statistical models. Anomalies may indicate a breakthrough player — or a statistical fluke. Validate with live observation.",
    category: "data",
    related: ["statistical-baseline", "database-query"],
    handbookChapter: "specializations",
  },
  {
    key: "xg-chain",
    label: "xG Chain Analysis",
    definition:
      "An advanced Data Scout perk that maps a player's contribution to expected goals through pass sequences, not just shots. Reveals hidden value in creative and linking players.",
    category: "data",
    related: ["anomaly-detection"],
    handbookChapter: "specializations",
  },
  {
    key: "statistical-baseline",
    label: "Statistical Baseline",
    definition:
      "The first Data Scout perk. Establishes performance models for player evaluation by position and league. Everything else in the data tree builds on this foundation.",
    category: "data",
    related: ["anomaly-detection", "database-query"],
    handbookChapter: "specializations",
  },
  {
    key: "prediction",
    label: "Prediction",
    definition:
      "A Data Scout mechanic — make forecasts about player performance. Correct predictions earn bounties and grow your accuracy rating. The data loop: query, flag, observe, validate.",
    category: "data",
    related: ["anomaly-detection"],
    handbookChapter: "specializations",
  },
  {
    key: "database-query",
    label: "Database Query",
    definition:
      "An exclusive Data Scout activity that mines statistical data across leagues. Surfaces player profiles, anomalies, and statistical outliers that other scouts can't see.",
    category: "data",
    related: ["statistical-baseline", "anomaly-detection"],
    handbookChapter: "activities",
  },

  // ── Financial ────────────────────────────────────────────────────────────

  {
    key: "consulting-fee",
    label: "Consulting Fee",
    definition:
      "Income earned from one-off scouting assignments. Fee size depends on report quality, conviction level, and your reputation. Freelance scouts rely heavily on these.",
    category: "financial",
    related: ["reputation", "conviction-level"],
    handbookChapter: "getting-started",
  },
  {
    key: "marketplace",
    label: "Marketplace",
    definition:
      "A platform to buy and sell scouting assets — reports, data packages, intelligence feeds. Freelance scouts list reports here to generate passive income from their work.",
    category: "financial",
    related: ["consulting-fee", "savings"],
    handbookChapter: "getting-started",
  },
  {
    key: "transfer-window",
    label: "Transfer Window",
    definition:
      "A limited period when clubs can buy and sell players. Submit reports before the window closes or they'll miss the deadline. First Team scouts time their work around windows.",
    category: "financial",
    related: ["directive"],
    handbookChapter: "getting-started",
  },
  {
    key: "signing-bonus",
    label: "Signing Bonus",
    definition:
      "A one-time payment earned when a club signs a player you recommended. Bigger bonuses come from higher conviction levels and more impactful signings.",
    category: "financial",
    related: ["conviction-level", "reputation"],
    handbookChapter: "career",
  },
  {
    key: "loan-deal",
    label: "Loan Deal",
    definition:
      "A temporary transfer where a player joins a club for a set period. The loan market offers opportunities to discover talent in new environments.",
    category: "financial",
    related: ["transfer-window"],
    handbookChapter: "getting-started",
  },

  // ── Additional concepts ──────────────────────────────────────────────────

  {
    key: "familiarity",
    label: "Familiarity",
    definition:
      "Your knowledge of a country or region. Higher familiarity improves scouting accuracy in that area. Built through visits, reports, and contacts. Decays slowly without return trips.",
    category: "scouting",
    related: ["accuracy", "regional-knowledge"],
    handbookChapter: "getting-started",
  },
  {
    key: "regional-knowledge",
    label: "Regional Knowledge",
    definition:
      "A Regional Expert's deep understanding of a territory. Provides accuracy bonuses, unlocks exclusive local contacts, and attracts retainer contracts from clubs needing coverage.",
    category: "scouting",
    related: ["familiarity", "retainer"],
    handbookChapter: "specializations",
  },
  {
    key: "discovery",
    label: "Discovery",
    definition:
      "A player you identified before the wider market caught on. A strong discovery record is one of the most compelling things you can show a potential client.",
    category: "scouting",
    related: ["reputation"],
    handbookChapter: "scouting-reports",
  },
  {
    key: "rival-scout",
    label: "Rival Scout",
    definition:
      "A competing scout or agent targeting the same players. Knowing who they are and how active they are helps you move faster on priority targets.",
    category: "career",
    related: ["contact", "intel"],
    handbookChapter: "contacts",
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

const CONCEPT_MAP = new Map<string, GameConcept>(
  GAME_CONCEPTS.map((c) => [c.key, c]),
);

/** Look up a concept by key. Returns undefined if not found. */
export function getGameConcept(key: string): GameConcept | undefined {
  return CONCEPT_MAP.get(key);
}

/** Get all concepts in a category. */
export function getConceptsByCategory(
  category: GameConceptCategory,
): GameConcept[] {
  return GAME_CONCEPTS.filter((c) => c.category === category);
}
