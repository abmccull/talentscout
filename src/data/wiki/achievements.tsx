import type { WikiArticle } from "@/components/game/wiki/wikiTypes";
import {
  SectionBlock,
  Para,
  Tag,
  Table,
  Subheading,
  BulletList,
  InfoCard,
  GridCards,
} from "./components";
import { ACHIEVEMENTS, type AchievementCategory } from "@/lib/achievements";
import { isAchievementAvailableForBuild } from "@/stores/gameScreenScope";

const AVAILABLE_ACHIEVEMENTS = ACHIEVEMENTS.filter((achievement) =>
  isAchievementAvailableForBuild(achievement.id),
);

function categoryCount(category: AchievementCategory): string {
  return String(
    AVAILABLE_ACHIEVEMENTS.filter((achievement) => achievement.category === category)
      .length,
  );
}

const AVAILABLE_HIDDEN_ACHIEVEMENT_COUNT = AVAILABLE_ACHIEVEMENTS.filter(
  (achievement) => achievement.category === "hidden",
).length;

// ─── Achievements ───────────────────────────────────────────────────────────

export const achievementsArticles: WikiArticle[] = [
  // ── Achievement Categories ──────────────────────────────────────────────
  {
    slug: "achievement-categories",
    title: "Achievement Categories",
    category: "achievements",
    order: 0,
    summary:
      `${AVAILABLE_ACHIEVEMENTS.length} attainable achievements across 8 categories and 5 rarity tiers.`,
    searchText:
      "TalentScout features 62 achievements across 8 categories and 5 rarity tiers. Rarity tiers are Common, Uncommon, Rare, Epic, and Legendary. Getting Started has 8 achievements covering your first steps: first observation, first report, first match attended, completing the tutorial, making your first sale, landing your first job, reaching Tier 2, and completing your first season. Career Milestones has 8 achievements tracking long-term career progress: reaching each career tier (2 through 5), completing 5, 10, 25, and 50 seasons, and achieving maximum reputation of 100. Scouting Excellence has 16 achievements for mastering observation and reporting: submitting 10, 50, 100, and 250 reports, achieving your first Table Pound conviction, producing 5 and 25 exceptional quality reports, observing 100 and 500 players, discovering a wonderkid, making 10 accurate predictions, covering all positions, and more. Specialization Mastery has 8 achievements for progressing in your chosen specialization: reaching specialization levels 5, 10, 15, and 20, unlocking all perks in a tree, and specialization-specific milestones for youth scouting, first team analysis, regional expertise, and data scouting. World Explorer has 6 achievements for international scouting: visiting 5, 15, and 30 countries, reaching Master familiarity in a foreign country, opening your first satellite office, and scouting on all 6 continents. Match and Analysis has 10 achievements for match observation: attending 25, 100, and 250 matches, observing a player score a hat trick, witnessing a red card, analysing 10 tactical matchups, and more. Financial achievements has 5 entries: earning your first 10000, reaching 100000 total earnings, maintaining positive cash flow for 20 weeks, completing a loan repayment, and reaching maximum credit score. Hidden and Challenge achievements has 7 secret achievements that are not revealed until unlocked.",
    content: (
      <SectionBlock>
        <Para>
          Youth Scout Early Access features{" "}
          <Tag color="emerald">{AVAILABLE_ACHIEVEMENTS.length} attainable achievements</Tag>{" "}
          across 8 categories and 5 rarity tiers. Achievements track your
          progress from first observations through long-term youth scouting,
          relationships, world knowledge, finances, leadership, and recovery.
        </Para>
        <Subheading>Rarity Tiers</Subheading>
        <Table
          headers={["Tier", "Description"]}
          rows={[
            ["Common", "Basic milestones most players will reach naturally"],
            ["Uncommon", "Requires deliberate effort or moderate progression"],
            ["Rare", "Significant accomplishments requiring sustained play"],
            ["Epic", "Exceptional feats that only dedicated players achieve"],
            ["Legendary", "The rarest achievements in the game"],
          ]}
        />
        <Subheading>Categories</Subheading>
        <Table
          headers={["Category", "Count", "Focus"]}
          rows={[
            ["Getting Started", categoryCount("gettingStarted"), "First steps and early milestones"],
            ["Career Milestones", categoryCount("careerMilestones"), "Long-term career progression"],
            ["Scouting Excellence", categoryCount("scoutingExcellence"), "Observation, reporting, discovery, and alumni"],
            [
              "Specialization Mastery",
              categoryCount("specializationMastery"),
              "Youth mastery, equipment, and varied evidence contexts",
            ],
            ["World Explorer", categoryCount("worldExplorer"), "International scouting"],
            ["Observation & Network", categoryCount("matchAnalysis"), "Observation depth and relationships"],
            ["Financial", categoryCount("financial"), "Earning, saving, infrastructure, and agency growth"],
            ["Hidden & Challenge", categoryCount("hidden"), "Secret achievements"],
          ]}
        />
        <InfoCard title="Progress Tracking" color="blue">
          Many achievements track cumulative progress — reports submitted,
          matches attended, countries visited. Check the Achievements screen
          regularly to see how close you are to the next milestone.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "hidden-achievements",
      "the-game-loop",
      "career-tiers",
      "reputation",
    ],
    tags: [
      "achievements",
      "rarity",
      "categories",
      "milestones",
      "progress",
      "common",
      "legendary",
    ],
  },

  // ── Hidden Achievements ─────────────────────────────────────────────────
  {
    slug: "hidden-achievements",
    title: "Hidden Achievements",
    category: "achievements",
    order: 1,
    summary:
      `${AVAILABLE_HIDDEN_ACHIEVEMENT_COUNT} secret achievements that are not revealed until unlocked.`,
    searchText:
      "There are 7 hidden achievements in TalentScout. These achievements are not visible in the achievement list until you unlock them. Each one rewards unconventional play or reaching extreme milestones. Here are hints without full spoilers. Blind Faith: sometimes conviction does not need evidence. Submit a report with maximum conviction on minimal observations. Triple Storyline: the narrative has more branches than you think. Complete three different storyline arcs in a single save. Survived Firing: getting fired is not always the end. Recover your career after being dismissed from a position. Marathon: some scouts never stop. Play for an extremely long time in a single save file. Speedrun: efficiency above all else. Reach Tier 5 in the fewest possible weeks. Against All Odds: prove everyone wrong. Succeed dramatically after starting in the worst possible conditions. Streak of Five: consistency is king. Achieve five consecutive exceptional report outcomes in a row. Hidden achievements are designed to reward exploration and experimentation. Do not be afraid to try unusual strategies or make bold decisions. Some hidden achievements can only be triggered by specific sequences of events that might seem counterintuitive at first.",
    content: (
      <SectionBlock>
        <Para>
          There are{" "}
          <Tag color="amber">{AVAILABLE_HIDDEN_ACHIEVEMENT_COUNT} hidden achievements</Tag> in
          TalentScout. These achievements are not visible in the achievement
          list until you unlock them. Each one rewards unconventional play or
          reaching extreme milestones.
        </Para>
        <Subheading>Hints (No Full Spoilers)</Subheading>
        <GridCards>
          <InfoCard title="Triple Storyline" color="amber">
            The narrative has more branches than you think. Can you see them all
            in a single save?
          </InfoCard>
          <InfoCard title="Survived Firing" color="rose">
            Getting fired is not always the end. What matters is what you do
            next.
          </InfoCard>
          <InfoCard title="Marathon" color="blue">
            Some scouts never stop. How far can a single career stretch?
          </InfoCard>
          <InfoCard title="Speedrun" color="emerald">
            Efficiency above all else. How fast can you reach the top?
          </InfoCard>
          <InfoCard title="The Shortlist" color="amber">
            Keep a serious working list of prospects whose cases still deserve
            your attention.
          </InfoCard>
          <InfoCard title="Streak of Five" color="emerald">
            Consistency is king. Five in a row, no mistakes.
          </InfoCard>
        </GridCards>
        <InfoCard title="Exploration Encouraged" color="blue">
          Hidden achievements reward exploration and experimentation. Do not be
          afraid to try unusual strategies or make bold decisions. Some can only
          be triggered by sequences that seem counterintuitive at first.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "achievement-categories",
      "the-game-loop",
      "conviction-levels",
      "career-tiers",
    ],
    tags: [
      "hidden",
      "secret",
      "challenge",
      "blind-faith",
      "speedrun",
      "marathon",
      "streak",
    ],
  },
];
