export type ProductRoadmapStatus =
  | "available"
  | "validating"
  | "planned"
  | "exploring";

export interface ProductRoadmapPhase {
  id: string;
  status: ProductRoadmapStatus;
  eyebrow: string;
  title: string;
  summary: string;
  outcomes: readonly string[];
}

export interface ProductRoadmapMode {
  id: string;
  status: ProductRoadmapStatus;
  name: string;
  role: string;
  fantasy: string;
  differentiators: readonly string[];
}

export interface ProductRoadmapSystem {
  id: string;
  status: ProductRoadmapStatus;
  title: string;
  description: string;
  playerValue: string;
}

export const PRODUCT_ROADMAP_NOTICE =
  "This is a living product direction, not a promise of dates or final scope. Priorities can change as player feedback, simulation evidence, accessibility testing, and platform certification reveal what needs the most work.";

/**
 * Player-facing product direction for TalentScout.
 *
 * Keep this catalog deliberately outcome-focused. It should explain why a
 * phase matters to the scouting fantasy without exposing internal task lists
 * or implying that a compiled future module is already production-ready.
 */
export const PRODUCT_ROADMAP_PHASES: readonly ProductRoadmapPhase[] = [
  {
    id: "youth-early-access",
    status: "available",
    eyebrow: "Playable now",
    title: "Youth Scout Early Access",
    summary:
      "One focused career built around discovering young players before the wider football world understands them.",
    outcomes: [
      "Plan scarce scouting time across live observation, contacts, travel, reflection, and follow-up work.",
      "Build evidence, revise hypotheses, write accountable reports, and choose how strongly to back your judgement.",
      "Follow placements, transfers, loans, releases, retirements, relationships, rivals, and reputation across seasons.",
    ],
  },
  {
    id: "early-access-foundations",
    status: "validating",
    eyebrow: "Current priority",
    title: "Prove the foundations",
    summary:
      "Make long careers trustworthy, understandable, accessible, responsive, and safe before widening the playable scope.",
    outcomes: [
      "Harden save recovery, migrations, season rollover, manual and batch advancement, and long-running world stability.",
      "Validate the first hour, keyboard and screen-reader journeys, minimum hardware, and packaged desktop builds.",
      "Tune consequences, event variety, regional knowledge, career recovery, and the value of every weekly choice.",
    ],
  },
  {
    id: "early-access-expansion",
    status: "planned",
    eyebrow: "Early Access direction",
    title: "Broaden how scouts read football",
    summary:
      "Add genuinely different scouting careers only when each changes the evidence, pressures, decisions, and consequences of play.",
    outcomes: [
      "Introduce additional specialist careers without diluting the Youth Scout loop.",
      "Deepen club employment, independent consulting, regional presence, staff delegation, and stakeholder politics.",
      "Expand dynamic world conditions, narrative chains, comparison tools, historical records, and authored variation.",
    ],
  },
  {
    id: "full-release",
    status: "planned",
    eyebrow: "Full-release ambition",
    title: "A complete scouting career universe",
    summary:
      "A living football world where several distinct scouting philosophies can build long, surprising careers and lasting legacies.",
    outcomes: [
      "Multiple specialist modes with their own information advantages, failure states, politics, and routes to influence.",
      "Challenge careers and scenario seeds that reshape constraints without replacing the systemic sandbox.",
      "Deeper leadership, consultancy, agency, legacy, and historical continuity for careers that span generations.",
    ],
  },
] as const;

export const PRODUCT_ROADMAP_MODES: readonly ProductRoadmapMode[] = [
  {
    id: "youth-scout",
    status: "available",
    name: "Youth Scout",
    role: "Discover potential before certainty exists",
    fantasy:
      "Find unsigned and academy prospects early, separate flashes from repeatable qualities, persuade decision-makers, and live with the player careers your reports helped create.",
    differentiators: [
      "Development projection and incomplete evidence",
      "Family, academy, access, and placement relationships",
      "Multi-season accountability for potential, fit, timing, and conviction",
    ],
  },
  {
    id: "first-team-scout",
    status: "planned",
    name: "First Team Scout",
    role: "Solve immediate recruitment problems",
    fantasy:
      "Work from urgent club briefs, judge tactical and dressing-room fit, compare attainable targets, and defend recommendations under transfer-window pressure.",
    differentiators: [
      "Role, system, squad, price, and deadline fit",
      "Manager and sporting-director politics",
      "Faster feedback with higher financial and reputational exposure",
    ],
  },
  {
    id: "regional-expert",
    status: "planned",
    name: "Regional Expert",
    role: "Turn local knowledge into an unfair advantage",
    fantasy:
      "Build a trusted presence across territories, understand competition and culture, earn difficult access, and recognize talent that visiting scouts misread.",
    differentiators: [
      "Persistent regional knowledge and presence",
      "Travel, language, culture, contacts, and access tradeoffs",
      "Territory competition and geographically distinct talent markets",
    ],
  },
  {
    id: "data-scout",
    status: "planned",
    name: "Data Scout",
    role: "Find signal in noisy football evidence",
    fantasy:
      "Build and challenge models, identify statistical anomalies, account for league and role context, and know when the numbers demand live verification.",
    differentiators: [
      "Models, samples, uncertainty, and competition adjustments",
      "Analyst workflows and evidence conflicts",
      "Data-led discovery followed by accountable human interpretation",
    ],
  },
  {
    id: "challenge-careers",
    status: "exploring",
    name: "Challenge Careers",
    role: "Distinct constraints, not scripted solutions",
    fantasy:
      "Take on authored starting conditions, volatile world seeds, or career rescue jobs that create a strong premise while leaving the solution to the simulation.",
    differentiators: [
      "Seeded constraints and explicit success measures",
      "Roguelike world modifiers and stakeholder pressures",
      "Replayable systemic outcomes rather than a fixed story path",
    ],
  },
] as const;

export const PRODUCT_ROADMAP_SYSTEMS: readonly ProductRoadmapSystem[] = [
  {
    id: "world-history",
    status: "planned",
    title: "Living world and historical memory",
    description:
      "Richer club identities, development environments, transfers, staff movement, competitions, economic conditions, and searchable multi-season timelines.",
    playerValue:
      "The world keeps producing opportunities and consequences even when you are looking somewhere else.",
  },
  {
    id: "relationships-politics",
    status: "planned",
    title: "Relationships, obligations, and politics",
    description:
      "Broader recurring identities for executives, managers, agents, families, journalists, employees, and individual rivals who remember specific choices.",
    playerValue:
      "Access and influence become personal, creating debts, conflicts, betrayals, and long-term allies rather than generic meters.",
  },
  {
    id: "regional-presence",
    status: "validating",
    title: "Regional presence and travel",
    description:
      "Make bases, offices, local staff, travel plans, country familiarity, tournaments, and regional upgrades alter real access, cost, evidence quality, and opportunity generation.",
    playerValue:
      "Where you invest becomes a defining strategic choice instead of a different map label.",
  },
  {
    id: "leadership-organization",
    status: "planned",
    title: "Leadership and scouting organizations",
    description:
      "Deeper delegation, employee development, recruitment departments, consulting contracts, agency growth, board demands, and recoverable late-career setbacks.",
    playerValue:
      "Promotion changes the job: you decide what deserves your eye, what others handle, and whose judgement carries the risk.",
  },
  {
    id: "accountability-archive",
    status: "validating",
    title: "Report accountability and scout identity",
    description:
      "Evaluate recommendations by evidence quality, confidence, price, timing, tactical fit, adaptation, risks identified, and willingness to revise; not only eventual ability.",
    playerValue:
      "Your best calls, worst misses, recurring biases, and relationships form a legible professional history.",
  },
  {
    id: "dynamic-runs",
    status: "validating",
    title: "Distinct worlds and emergent stories",
    description:
      "Expand world-condition decks, special events, rivals, opportunity races, narrative callbacks, and authored variants while protecting seeded determinism and fair tradeoffs.",
    playerValue:
      "Two careers begin with different pressures and continue diverging because systems remember what you chose.",
  },
] as const;

export const PRODUCT_QUALITY_BARS = [
  {
    title: "Simulation integrity",
    description:
      "Long careers, season rollover, finances, transfers, references, saves, migrations, and manual or batch advancement must remain coherent.",
  },
  {
    title: "Usability and accessibility",
    description:
      "The first hour, keyboard use, screen readers, responsive layouts, feedback, terminology, and decision explanations must work for real players.",
  },
  {
    title: "Platform and save safety",
    description:
      "Packaged desktop builds, offline play, interrupted writes, recovery, conflicts, installation, updates, and platform services must fail safely.",
  },
  {
    title: "Performance",
    description:
      "Minimum-spec hardware must sustain responsive weekly play, acceptable memory growth, practical load times, and stable long saves.",
  },
  {
    title: "Depth and replayability",
    description:
      "Modes must produce different decisions; events must create consequences; and variety must survive many seasons without a dominant routine.",
  },
] as const;

export const PRODUCT_ROADMAP_STATUS_LABELS: Readonly<
  Record<ProductRoadmapStatus, string>
> = {
  available: "Available now",
  validating: "In validation",
  planned: "Planned direction",
  exploring: "Exploring",
};
