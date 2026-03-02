import type { WikiArticle } from "@/components/game/wiki/wikiTypes";
import {
  SectionBlock,
  Para,
  Tag,
  Table,
  Subheading,
  PerkCard,
  BulletList,
  NumberedList,
  InfoCard,
  GridCards,
} from "./components";

// ─── Career Progression ─────────────────────────────────────────────────────

export const careerProgressionArticles: WikiArticle[] = [
  // ── Career Tiers ──────────────────────────────────────────────────────────
  {
    slug: "career-tiers",
    title: "Career Tiers",
    category: "career-progression",
    order: 0,
    summary:
      "The five career tiers from Freelance Scout to Director of Football.",
    searchText:
      "Tier 1: Freelance Scout. Self-employed. No club retainer. Must sell reports on the open market or take club commissions. Tier 2: Part-Time Regional Scout. Contracted to one club for a defined region. Limited salary but growing reputation. Tier 3: Full-Time Club Scout. Core scouting staff. Regular directives from the manager, full salary, performance reviews. Tier 4: Head of Scouting. Manages NPC scouts, assigns territories, responsible for club-wide scouting strategy. Tier 5: Director of Football. Top role. Board presentations, strategic transfer influence, global network.",
    content: (
      <SectionBlock>
        <Table
          headers={["Tier", "Title", "Characteristics"]}
          rows={[
            [
              "1",
              "Freelance Scout",
              "Self-employed. No club retainer. Must sell reports on the open market or take club commissions.",
            ],
            [
              "2",
              "Part-Time Regional Scout",
              "Contracted to one club for a defined region. Limited salary but growing reputation.",
            ],
            [
              "3",
              "Full-Time Club Scout",
              "Core scouting staff. Regular directives from the manager, full salary, performance reviews.",
            ],
            [
              "4",
              "Head of Scouting",
              "Manages NPC scouts, assigns territories, responsible for club-wide scouting strategy.",
            ],
            [
              "5",
              "Director of Football",
              "Top role. Board presentations, strategic transfer influence, global network.",
            ],
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "career-paths",
      "reputation",
      "performance-reviews",
      "specialization-depth",
    ],
    tags: [
      "tier",
      "freelance",
      "regional",
      "club",
      "head",
      "director",
      "promotion",
    ],
  },

  // ── Career Paths ──────────────────────────────────────────────────────────
  {
    slug: "career-paths",
    title: "Career Paths",
    category: "career-progression",
    order: 1,
    summary:
      "Club Path versus Independent Path: stability and hierarchy versus agency ownership and marketplace income.",
    searchText:
      "From tier 3 onward you can choose between two career paths. Club Path: Climb the club hierarchy from scout to Head of Scouting to Director of Football. Stable salary, manager directives, performance reviews, and potential job offers from rival clubs. Independent Path: Run your own scouting agency. Sell reports on the marketplace, take retainer contracts from clubs, hire employees, upgrade your office, and build a business. Higher earning potential but less stability.",
    content: (
      <SectionBlock>
        <Para>
          From tier 3 onward you can choose between two career paths:
        </Para>
        <GridCards>
          <InfoCard title="Club Path" color="emerald">
            Climb the club hierarchy from scout to Head of Scouting to Director
            of Football. Stable salary, manager directives, performance reviews,
            and potential job offers from rival clubs.
          </InfoCard>
          <InfoCard title="Independent Path" color="amber">
            Run your own scouting agency. Sell reports on the marketplace, take
            retainer contracts from clubs, hire employees, upgrade your office,
            and build a business. Higher earning potential but less stability.
          </InfoCard>
        </GridCards>
      </SectionBlock>
    ),
    related: [
      "career-tiers",
      "performance-reviews",
      "reputation",
      "training-courses",
    ],
    tags: [
      "club",
      "independent",
      "agency",
      "path",
      "marketplace",
      "salary",
      "business",
    ],
  },

  // ── Performance Reviews ───────────────────────────────────────────────────
  {
    slug: "performance-reviews",
    title: "Performance Reviews",
    category: "career-progression",
    order: 2,
    summary:
      "End-of-season reviews on the club path: what is measured and the consequences of strong or poor performance.",
    searchText:
      "At the end of each season (club path) your manager evaluates your performance against set directives. Reviews measure: Number of reports submitted vs target. Report accuracy and quality scores. How many directives were fulfilled. Whether any Table Pounds were justified. A strong review accelerates reputation growth and can fast-track a tier promotion. A poor review may lead to a contract review or job loss.",
    content: (
      <SectionBlock>
        <Para>
          At the end of each season (club path) your manager evaluates your
          performance against set directives. Reviews measure:
        </Para>
        <BulletList
          items={[
            "Number of reports submitted vs target",
            "Report accuracy and quality scores",
            "How many directives were fulfilled",
            "Whether any Table Pounds were justified",
          ]}
        />
        <Para>
          A strong review accelerates reputation growth and can fast-track a
          tier promotion. A poor review may lead to a contract review or job
          loss.
        </Para>
      </SectionBlock>
    ),
    related: [
      "career-tiers",
      "reputation",
      "conviction-levels",
      "report-quality",
    ],
    tags: [
      "review",
      "season",
      "directives",
      "promotion",
      "contract",
      "evaluation",
    ],
  },

  // ── Specialization Depth ──────────────────────────────────────────────────
  {
    slug: "specialization-depth",
    title: "Specialization Depth",
    category: "career-progression",
    order: 3,
    summary:
      "Specialization levels 1-20: how depth increases, what it unlocks, and secondary specialization at tier 4+.",
    searchText:
      "Your primary specialization has a depth level (1-20). It increases as you perform activities aligned with your specialization. Higher levels: Unlock new perks in your specialization tree. Provide a passive accuracy bonus on all readings (+1% reduction in error per level above 1). Increase your credibility in job applications. At tier 4+ you can unlock a secondary specialization, which gives access to the first few perks of a second tree.",
    content: (
      <SectionBlock>
        <Para>
          Your primary specialization has a depth level (1–20). It increases as
          you perform activities aligned with your specialization. Higher
          levels:
        </Para>
        <BulletList
          items={[
            "Unlock new perks in your specialization tree",
            "Provide a passive accuracy bonus on all readings (+1% reduction in error per level above 1)",
            "Increase your credibility in job applications",
          ]}
        />
        <Para>
          At tier 4+ you can unlock a secondary specialization, which gives
          access to the first few perks of a second tree.
        </Para>
      </SectionBlock>
    ),
    related: [
      "career-tiers",
      "specialization-exclusive-activities",
      "training-courses",
      "activity-quality",
    ],
    tags: [
      "specialization",
      "depth",
      "level",
      "perks",
      "secondary",
      "accuracy",
      "credibility",
    ],
  },

  // ── Training & Courses ────────────────────────────────────────────────────
  {
    slug: "training-courses",
    title: "Training & Courses",
    category: "career-progression",
    order: 4,
    summary:
      "How the study and training system improves your scout skills and attributes over time.",
    searchText:
      "Improving your scout skills and attributes is essential for producing higher-quality observations and advancing your career. The primary way to train is through the Study activity, which costs 1 day-slot and grants skill or attribute XP. Each study session targets a specific area depending on what you choose to focus on. Skill Training: Study sessions can be directed toward any of the four core scout skills: Technical Eye, Physical Assessment, Psychological Read, and Tactical Understanding. Levelling a skill directly improves accuracy for all attributes in that domain. Higher skills also unlock visibility of attributes that lower-skill scouts cannot perceive. Attribute Training: You can also train your personal scout attributes such as endurance, networking, and persuasion. Endurance reduces fatigue accumulation. Networking speeds relationship gains. Persuasion amplifies the impact of your conviction levels. Specialization Courses: As you progress, specialization-aligned study options become available. Youth scouts can study youth development theory. First Team scouts study opposition analysis methodology. Data scouts study statistical modelling. Regional experts study language and cultural integration. These sessions grant specialization XP in addition to skill XP. External Courses: At higher tiers you can attend external courses — multi-slot commitments that provide larger XP gains. These simulate coaching badges, data analytics certifications, or language courses. They cost more time and sometimes money, but offer the fastest attribute growth. Tips: Schedule study sessions on low-priority days when no fixtures are available. Pair study with rest days to keep fatigue manageable while still progressing. Diversify your training across skills and attributes to maintain a well-rounded profile.",
    content: (
      <SectionBlock>
        <Para>
          Improving your scout skills and attributes is essential for producing
          higher-quality observations and advancing your career. The primary way
          to train is through the <Tag color="zinc">Study</Tag> activity, which
          costs 1 day-slot and grants skill or attribute XP. Each study session
          targets a specific area depending on what you choose to focus on.
        </Para>

        <Subheading>Skill Training</Subheading>
        <Para>
          Study sessions can be directed toward any of the four core scout
          skills: <Tag color="zinc">Technical Eye</Tag>,{" "}
          <Tag color="zinc">Physical Assessment</Tag>,{" "}
          <Tag color="zinc">Psychological Read</Tag>, and{" "}
          <Tag color="zinc">Tactical Understanding</Tag>. Levelling a skill
          directly improves accuracy for all attributes in that domain. Higher
          skills also unlock visibility of attributes that lower-skill scouts
          cannot perceive.
        </Para>

        <Subheading>Attribute Training</Subheading>
        <Para>
          You can also train your personal scout attributes such as{" "}
          <Tag color="zinc">endurance</Tag>,{" "}
          <Tag color="zinc">networking</Tag>, and{" "}
          <Tag color="zinc">persuasion</Tag>. Endurance reduces fatigue
          accumulation. Networking speeds relationship gains. Persuasion
          amplifies the impact of your conviction levels.
        </Para>

        <Subheading>Specialization Courses</Subheading>
        <Para>
          As you progress, specialization-aligned study options become available.
          Youth scouts can study youth development theory. First Team scouts
          study opposition analysis methodology. Data scouts study statistical
          modelling. Regional experts study language and cultural integration.
          These sessions grant specialization XP in addition to skill XP.
        </Para>

        <Subheading>External Courses</Subheading>
        <Para>
          At higher tiers you can attend external courses — multi-slot
          commitments that provide larger XP gains. These simulate coaching
          badges, data analytics certifications, or language courses. They cost
          more time and sometimes money, but offer the fastest attribute growth.
        </Para>

        <Subheading>Tips</Subheading>
        <BulletList
          items={[
            "Schedule study sessions on low-priority days when no fixtures are available.",
            "Pair study with rest days to keep fatigue manageable while still progressing.",
            "Diversify your training across skills and attributes to maintain a well-rounded profile.",
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "specialization-depth",
      "scheduling-your-week",
      "networking-admin-activities",
      "perception-model",
      "career-tiers",
    ],
    tags: [
      "study",
      "training",
      "courses",
      "skills",
      "attributes",
      "XP",
      "development",
      "learning",
    ],
  },
];
