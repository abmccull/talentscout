/**
 * Per-Screen Guide definitions.
 *
 * Each guide is tied to a GameScreen ID and contains 1–6 steps. Steps
 * reference DOM elements via `data-tutorial-id` attributes — exactly the
 * same mechanism used by TutorialOverlay. The ScreenGuidePanel renders these
 * as a right-edge slide-in panel rather than a spotlight overlay.
 *
 * Mentor voice: concise, practical, in-character (Margaret Chen / Tommy Reyes).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScreenGuideStep {
  /** data-tutorial-id of the element to spotlight */
  target: string;
  /** Short heading */
  title: string;
  /** Mentor-voiced description */
  description: string;
  /** Card position relative to target */
  position: "top" | "bottom" | "left" | "right";
  /** Optional handbook chapter ID for "Learn more" link */
  handbookChapter?: string;
}

export interface ScreenGuide {
  id: string;
  steps: ScreenGuideStep[];
}

// ---------------------------------------------------------------------------
// Guide definitions
// ---------------------------------------------------------------------------

const dashboardGuide: ScreenGuide = {
  id: "dashboard",
  steps: [
    {
      target: "dashboard-reputation",
      title: "Your Reputation",
      description:
        "This gauge reflects how the football world sees you. Every accurate report, strong recommendation, and successful placement pushes it higher — and every miss costs you.",
      position: "bottom",
      handbookChapter: "getting-started",
    },
    {
      target: "dashboard-fatigue",
      title: "Fatigue",
      description:
        "Scouting is demanding work. Watch this bar carefully — push past the red zone and your report quality suffers. Use rest days and light weeks to recover.",
      position: "bottom",
      handbookChapter: "getting-started",
    },
    {
      target: "dashboard-finances",
      title: "Finances",
      description:
        "Your current cash position. Travel, equipment, and staff all have running costs. A healthy balance gives you options; a tight one forces hard choices.",
      position: "bottom",
      handbookChapter: "getting-started",
    },
    {
      target: "dashboard-directives",
      title: "Active Directives",
      description:
        "Your client's current priorities live here. Check these before planning your week — a directive pointing you toward right-backs means wasted effort watching strikers.",
      position: "right",
      handbookChapter: "getting-started",
    },
    {
      target: "nav-calendar",
      title: "The Calendar",
      description:
        "Everything flows through your weekly calendar. Fixtures, meetings, training — schedule them here and then advance the week to see results.",
      position: "right",
    },
  ],
};

const calendarGuide: ScreenGuide = {
  id: "calendar",
  steps: [
    {
      target: "calendar-grid",
      title: "Weekly Grid",
      description:
        "Each column is a day. Drag activities into slots to build your week. Match days are fixed; everything else is up to you.",
      position: "bottom",
      handbookChapter: "scheduling",
    },
    {
      target: "calendar-activities",
      title: "Activity Panel",
      description:
        "This panel lists every activity available to you this week — fixtures to attend, training sessions, meetings, and admin tasks. Drag them onto the grid to schedule.",
      position: "left",
      handbookChapter: "scheduling",
    },
    {
      target: "calendar-advance-btn",
      title: "Advance the Week",
      description:
        "When you're happy with your schedule, hit this button. The engine resolves all your activities, updates player data, and moves time forward.",
      position: "top",
      handbookChapter: "scheduling",
    },
    {
      target: "calendar-rest-info",
      title: "Rest Days",
      description:
        "Leaving days empty isn't wasted — it's recovery. Two or three unscheduled days per week keeps your fatigue manageable across a long season.",
      position: "right",
    },
  ],
};

const playerDatabaseGuide: ScreenGuide = {
  id: "playerDatabase",
  steps: [
    {
      target: "player-db-search",
      title: "Search & Filter",
      description:
        "Narrow down thousands of players by position, age, league, or scouted status. The quicker you find the right candidate, the more time you have to watch them.",
      position: "bottom",
    },
    {
      target: "player-db-list",
      title: "Player Cards",
      description:
        "Each card shows key attributes alongside your scouting confidence. Low confidence means the data is based on limited observations — schedule more watchings to firm up your assessment.",
      position: "right",
    },
    {
      target: "player-db-shortlist",
      title: "Your Shortlist",
      description:
        "Pin players here to track them across the season without hunting through filters each time. Clients often ask for shortlist summaries, so keep it tidy and relevant.",
      position: "left",
    },
  ],
};

const careerGuide: ScreenGuide = {
  id: "career",
  steps: [
    {
      target: "career-overview",
      title: "Career Overview",
      description:
        "Your professional history at a glance — tier, total placements, and current reputation score. This is the foundation clients assess before they hire you.",
      position: "bottom",
      handbookChapter: "career-progression",
    },
    {
      target: "career-skills",
      title: "Skills Panel",
      description:
        "Active skills directly influence your scouting outcomes. Technical Analysis improves attribute accuracy; Negotiation unlocks better contract terms. Invest XP where your current role demands it most.",
      position: "right",
      handbookChapter: "career-progression",
    },
    {
      target: "career-tier-benefits",
      title: "Tier Benefits",
      description:
        "Reaching a new tier unlocks tangible advantages — access to higher-calibre fixtures, larger client retainers, and exclusive network contacts. Your next tier threshold is shown here.",
      position: "bottom",
      handbookChapter: "career-progression",
    },
    {
      target: "career-perk-tree",
      title: "Perk Tree",
      description:
        "Perks are passive modifiers that compound over a career. Choose them carefully — some synergise strongly with specific specialisations, and you can't unlock everything.",
      position: "left",
      handbookChapter: "career-progression",
    },
  ],
};

const financesGuide: ScreenGuide = {
  id: "finances",
  steps: [
    {
      target: "finances-overview",
      title: "P&L Overview",
      description:
        "Income versus expenditure for the current season. A healthy margin funds growth; a deficit forces you to cut activity or defer equipment upgrades.",
      position: "bottom",
      handbookChapter: "finances",
    },
    {
      target: "finances-contracts",
      title: "Active Contracts",
      description:
        "Your retainer and per-placement agreements live here. Retainers provide predictable income; placement fees are larger but contingent on success. Balance both for stability.",
      position: "right",
      handbookChapter: "finances",
    },
    {
      target: "finances-marketplace",
      title: "Marketplace",
      description:
        "Buy and sell scouting assets — data packages, regional access licences, and proprietary intelligence feeds. Watch for time-limited offers that can give you an edge.",
      position: "right",
    },
  ],
};

const agencyGuide: ScreenGuide = {
  id: "agency",
  steps: [
    {
      target: "agency-overview",
      title: "Agency Overview",
      description:
        "Your agency's headline metrics — total clients under management, active mandates, and monthly revenue. These figures shape how clubs and free agents perceive your operation.",
      position: "bottom",
    },
    {
      target: "agency-employees",
      title: "Staff",
      description:
        "Employees extend your reach. Assign scouts to specific leagues or roles to generate background intelligence while you focus on priority targets.",
      position: "right",
    },
    {
      target: "agency-clients",
      title: "Client Roster",
      description:
        "Each client has different needs, budgets, and patience. Check satisfaction scores regularly — a neglected client will look for representation elsewhere.",
      position: "right",
    },
  ],
};

const networkGuide: ScreenGuide = {
  id: "network",
  steps: [
    {
      target: "network-contacts",
      title: "Contacts",
      description:
        "Every person you've met in football is catalogued here. Relationship strength determines what they'll share with you and whether they'll return your calls.",
      position: "bottom",
      handbookChapter: "networking",
    },
    {
      target: "network-meet",
      title: "Schedule Meetings",
      description:
        "Strong relationships don't maintain themselves. Use the meeting scheduler to book lunch, calls, or matchday seats — relationship scores decay if you go quiet.",
      position: "right",
    },
    {
      target: "network-intel",
      title: "Network Intel",
      description:
        "Trusted contacts pass along rumours, fixture tips, and transfer gossip. Not everything is accurate, but high-trust sources are rarely wrong.",
      position: "left",
    },
  ],
};

const rivalsGuide: ScreenGuide = {
  id: "rivals",
  steps: [
    {
      target: "rivals-list",
      title: "Known Rivals",
      description:
        "These are the scouts and agents competing for the same clients and players. Knowing who they are, and how active they are, helps you move faster on priority targets.",
      position: "bottom",
    },
    {
      target: "rivals-intel",
      title: "Competitive Intelligence",
      description:
        "When your network is strong, you'll get advance warning when a rival is closing in on one of your targets. Use it to accelerate your timeline.",
      position: "right",
    },
  ],
};

const npcManagementGuide: ScreenGuide = {
  id: "npcManagement",
  steps: [
    {
      target: "freeagents-list",
      title: "Free Agents",
      description:
        "Players unattached to a club who are open to opportunities. Free agents can be placed quickly — no transfer fee, though their wage expectations vary widely.",
      position: "bottom",
    },
    {
      target: "freeagents-negotiate",
      title: "Negotiate Terms",
      description:
        "When a client is interested, open negotiations here. Your Negotiation skill and the player's current situation determine how much leverage you have.",
      position: "right",
    },
  ],
};

const equipmentGuide: ScreenGuide = {
  id: "equipment",
  steps: [
    {
      target: "equipment-loadout",
      title: "Active Loadout",
      description:
        "Your equipped items — video software, data subscriptions, travel gear — each provide passive bonuses to specific scouting activities. Fill every slot before a big week.",
      position: "bottom",
      handbookChapter: "equipment",
    },
    {
      target: "equipment-shop",
      title: "Equipment Shop",
      description:
        "Browse available tools and upgrades. Higher-tier items cost more but compound your edge over time. Prioritise items that align with your current specialisation.",
      position: "right",
      handbookChapter: "equipment",
    },
  ],
};

const trainingGuide: ScreenGuide = {
  id: "training",
  steps: [
    {
      target: "training-courses",
      title: "Available Courses",
      description:
        "Courses develop specific skills over multiple weeks. Enrol in courses that address your current weaknesses or that unlock capabilities you'll need for an upcoming mandate.",
      position: "bottom",
    },
    {
      target: "training-progress",
      title: "Your Progress",
      description:
        "Track active enrolments and estimated completion dates here. Factor these in when planning busy weeks — course progress pauses if you don't allocate study time.",
      position: "right",
    },
  ],
};

const performanceGuide: ScreenGuide = {
  id: "performance",
  steps: [
    {
      target: "performance-overview",
      title: "Performance Summary",
      description:
        "Your key metrics for the current season — report accuracy, placements made, client satisfaction, and XP earned. A quick health check on your career trajectory.",
      position: "bottom",
    },
    {
      target: "performance-history",
      title: "Historical Charts",
      description:
        "Trend lines reveal patterns that snapshots miss. A steady accuracy decline might mean you're over-stretched; a reputation plateau might point to a skill bottleneck.",
      position: "right",
    },
  ],
};

const discoveriesGuide: ScreenGuide = {
  id: "discoveries",
  steps: [
    {
      target: "discoveries-list",
      title: "Your Discoveries",
      description:
        "Players you identified before the wider market caught on are recorded here. A strong discovery record is one of the most compelling things you can show a new client.",
      position: "bottom",
    },
    {
      target: "discoveries-trajectory",
      title: "Career Trajectories",
      description:
        "See how your discovered players have developed since you first flagged them. Accurate trajectory calls improve your reputation score more than almost anything else.",
      position: "right",
    },
  ],
};

const achievementsGuide: ScreenGuide = {
  id: "achievements",
  steps: [
    {
      target: "achievements-grid",
      title: "Achievements",
      description:
        "Milestones earned throughout your career. Some unlock cosmetic rewards; others grant permanent bonuses to skills or finances. Check the locked ones for stretch goals worth pursuing.",
      position: "bottom",
    },
  ],
};

const reportHistoryGuide: ScreenGuide = {
  id: "reportHistory",
  steps: [
    {
      target: "reporthistory-list",
      title: "Report Archive",
      description:
        "Every report you've ever filed lives here, searchable by player, date, or client. Revisit old assessments when a player resurfaces — your original read tells you how far they've come.",
      position: "bottom",
    },
    {
      target: "reporthistory-compare",
      title: "Side-by-Side Comparison",
      description:
        "Select two reports to compare them directly. Useful for tracking a player's development across multiple watchings, or for presenting a shortlist to an undecided client.",
      position: "right",
    },
  ],
};

const fixtureBrowserGuide: ScreenGuide = {
  id: "fixtureBrowser",
  steps: [
    {
      target: "fixture-calendar",
      title: "Fixture Schedule",
      description:
        "Upcoming matches across every competition you have access to, arranged by date. Plan your travel around clusters of fixtures to maximise coverage without burning out.",
      position: "bottom",
    },
    {
      target: "fixture-filter",
      title: "Filters",
      description:
        "Narrow by league, team, date range, or whether a target player is involved. When time is short, filter to fixtures where at least two targets are playing.",
      position: "right",
    },
    {
      target: "fixture-select",
      title: "Attend a Fixture",
      description:
        "Select a fixture and add it to your calendar. You'll be prompted to choose focus targets before the match begins — decide in advance to get the most from each watching.",
      position: "left",
    },
  ],
};

const inboxGuide: ScreenGuide = {
  id: "inbox",
  steps: [
    {
      target: "inbox-filter",
      title: "Message Filter",
      description:
        "Sort messages by type — client directives, network tips, system notifications, and contract updates each have their own category. Process client messages first; directives can change your entire week's plan.",
      position: "bottom",
    },
  ],
};

const handbookGuide: ScreenGuide = {
  id: "handbook",
  steps: [
    {
      target: "handbook-chapters",
      title: "Handbook Chapters",
      description:
        "The handbook is your permanent reference. Each chapter covers a core system in depth — consult it whenever a mechanic isn't behaving as you expect.",
      position: "right",
    },
  ],
};

const settingsGuide: ScreenGuide = {
  id: "settings",
  steps: [
    {
      target: "settings-preferences",
      title: "Preferences",
      description:
        "Adjust simulation speed, notification frequency, display options, and accessibility settings here. These take effect immediately and persist across sessions.",
      position: "bottom",
    },
  ],
};

const internationalViewGuide: ScreenGuide = {
  id: "internationalView",
  steps: [
    {
      target: "travel-world-map",
      title: "World Map",
      description:
        "Regions you have access to are highlighted. International scouting opens up deeper talent pools but carries higher travel costs and longer trip durations.",
      position: "bottom",
    },
    {
      target: "travel-familiarity",
      title: "Regional Familiarity",
      description:
        "The more time you spend in a region, the better your local knowledge — which improves attribute accuracy and unlocks regional contacts. Familiarity decays slowly without return visits.",
      position: "right",
    },
  ],
};

const youthScoutingGuide: ScreenGuide = {
  id: "youthScouting",
  steps: [
    {
      target: "youth-pipeline-list",
      title: "Youth Pipeline",
      description:
        "Prospects you're tracking from youth football. They develop over seasons rather than weeks, so patience is essential. Regular check-ins maintain your confidence ratings on each player.",
      position: "bottom",
    },
    {
      target: "youth-legacy-score",
      title: "Legacy Score",
      description:
        "Your legacy score reflects the long-term impact of your youth scouting — how many prospects you've identified who went on to professional careers. It's a career-defining metric.",
      position: "right",
    },
  ],
};

const alumniDashboardGuide: ScreenGuide = {
  id: "alumniDashboard",
  steps: [
    {
      target: "alumni-list",
      title: "Alumni Network",
      description:
        "Players you've placed or developed who have moved on. Strong alumni relationships generate referrals and unsolicited intel — they remember who gave them their opportunity.",
      position: "bottom",
    },
  ],
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const SCREEN_GUIDES: ScreenGuide[] = [
  dashboardGuide,
  calendarGuide,
  playerDatabaseGuide,
  careerGuide,
  financesGuide,
  agencyGuide,
  networkGuide,
  rivalsGuide,
  npcManagementGuide,
  equipmentGuide,
  trainingGuide,
  performanceGuide,
  discoveriesGuide,
  achievementsGuide,
  reportHistoryGuide,
  fixtureBrowserGuide,
  inboxGuide,
  handbookGuide,
  settingsGuide,
  internationalViewGuide,
  youthScoutingGuide,
  alumniDashboardGuide,
];

// Pre-build a lookup map for O(1) access.
const GUIDE_MAP = new Map<string, ScreenGuide>(
  SCREEN_GUIDES.map((g) => [g.id, g]),
);

/**
 * Returns the ScreenGuide for a given screen ID, or undefined if none exists.
 */
export function getScreenGuide(screenId: string): ScreenGuide | undefined {
  return GUIDE_MAP.get(screenId);
}
