import type { WikiArticle } from "@/components/game/wiki/wikiTypes";
import {
  SectionBlock,
  Para,
  Tag,
  Table,
  Subheading,
  BulletList,
  NumberedList,
  InfoCard,
  GridCards,
} from "./components";

// ─── Insight Points ─────────────────────────────────────────────────────────

export const insightPointsArticles: WikiArticle[] = [
  // ── Insight Overview ────────────────────────────────────────────────────
  {
    slug: "insight-overview",
    title: "Insight Points Overview",
    category: "insight-points",
    order: 0,
    summary:
      "Insight Points (IP) are earned through quality scouting work and spent on powerful special actions. Capacity is 40 base plus 2 per Intuition point.",
    searchText:
      "Insight Points (IP) are a special currency earned through quality scouting work and spent on powerful one-off actions that reveal hidden information or provide unique advantages. IP accumulates from four sources: observations earn 2 base IP each, submitting a report earns 3 base IP, confirming a hypothesis earns 5 IP (2 if disproved), and completing an assignment earns 3 base IP. All IP gains are multiplied by a quality factor: poor quality gives 0 IP, average gives 0.8x, good gives 1.0x, excellent gives 1.4x, and exceptional gives 2.0x. Your maximum IP capacity is 40 plus 2 for each point of Intuition. IP beyond this cap is lost so spend it regularly. There are 12 insight actions in total: 4 universal actions available to all scouts and 8 specialization-locked actions with 2 per specialization (Youth Scout, First Team, Regional Expert, Data Scout). Each action costs between 20 and 30 IP and goes on cooldown after use. When your fatigue exceeds 70 there is a 20% chance that an insight action fizzles — consuming the IP without producing the intended effect. Keep fatigue manageable before attempting high-cost insight actions.",
    content: (
      <SectionBlock>
        <Para>
          <Tag color="emerald">Insight Points (IP)</Tag> are a special currency
          earned through quality scouting work and spent on powerful one-off
          actions that reveal hidden information or provide unique advantages.
        </Para>
        <Subheading>Earning IP</Subheading>
        <Table
          headers={["Source", "Base IP"]}
          rows={[
            ["Observation", "2"],
            ["Report submission", "3"],
            ["Hypothesis confirmed", "5 (2 if disproved)"],
            ["Assignment completed", "3"],
          ]}
        />
        <Para>
          All IP gains are multiplied by a quality factor:
        </Para>
        <Table
          headers={["Quality", "Multiplier"]}
          rows={[
            ["Poor", "0x (no IP earned)"],
            ["Average", "0.8x"],
            ["Good", "1.0x"],
            ["Excellent", "1.4x"],
            ["Exceptional", "2.0x"],
          ]}
        />
        <Subheading>Capacity</Subheading>
        <Para>
          Your maximum IP capacity is{" "}
          <Tag color="blue">40 + 2 per Intuition point</Tag>. IP beyond this
          cap is lost, so spend it regularly to avoid waste.
        </Para>
        <InfoCard title="Fizzle Risk" color="rose">
          When your fatigue exceeds 70, there is a 20% chance that an insight
          action fizzles — consuming the IP without producing the intended
          effect. Keep fatigue manageable before attempting high-cost insight
          actions.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "insight-actions",
      "insight-cooldowns",
      "fatigue",
      "activity-quality",
      "report-quality",
    ],
    tags: [
      "insight",
      "IP",
      "points",
      "capacity",
      "intuition",
      "quality",
      "fizzle",
    ],
  },

  // ── Insight Actions Reference ───────────────────────────────────────────
  {
    slug: "insight-actions",
    title: "Insight Actions Reference",
    category: "insight-points",
    order: 1,
    summary:
      "Complete reference for all 12 insight actions: 4 universal and 8 specialization-locked (2 per specialization).",
    searchText:
      "There are 12 insight actions divided into universal and specialization-locked categories. Universal actions available to all scouts: Clarity of Vision costs 25 IP and dramatically narrows the confidence interval on your next set of observations, giving you a much clearer read on a player's true attributes. Hidden Nature costs 25 IP and reveals one hidden attribute (Injury Proneness, Consistency, Big Game Temperament, or Professionalism) for a player you have observed at least once. The Verdict costs 20 IP and provides an immediate quality assessment of your most recent report before submission, letting you know if it is worth submitting or needs more observation. Second Look costs 20 IP and lets you re-observe a player you have already watched, resetting your observation with fresh eyes and potentially correcting earlier misreadings. Youth Scout specialization actions: Diamond in the Rough costs 30 IP and flags a youth player in your current region who has exceptional hidden potential that would otherwise be easy to miss. Generational Whisper costs 25 IP and reveals the full potential ability range of a youth player, removing uncertainty about their ceiling. First Team specialization actions: Perfect Fit costs 25 IP and analyses how well a player would integrate into a specific club's tactical system, considering personality, playing style, and team needs. Pressure Test costs 25 IP and reveals how a player performs under high-stakes conditions by simulating a big match scenario. Regional Expert specialization actions: Network Pulse costs 25 IP and taps your regional contacts for reliable insider information about a player's contract situation, injury history, or transfer willingness. Territory Mastery costs 30 IP and grants a temporary large boost to your familiarity with a specific country, improving all observations and reducing foreign scouting penalties for several weeks. Data Scout specialization actions: Algorithmic Epiphany costs 25 IP and runs an advanced statistical model over a player's data to identify hidden patterns in their performance that observations alone would miss. Market Blindspot costs 30 IP and reveals undervalued players in the transfer market whose statistical profiles suggest they are better than their current market value indicates.",
    content: (
      <SectionBlock>
        <Para>
          There are <Tag color="emerald">12 insight actions</Tag> divided into
          universal and specialization-locked categories. Each action costs
          between 20 and 30 IP.
        </Para>
        <Subheading>Universal Actions (All Scouts)</Subheading>
        <Table
          headers={["Action", "Cost", "Effect"]}
          rows={[
            [
              "Clarity of Vision",
              "25 IP",
              "Dramatically narrows confidence intervals on your next observations",
            ],
            [
              "Hidden Nature",
              "25 IP",
              "Reveals one hidden attribute for an observed player",
            ],
            [
              "The Verdict",
              "20 IP",
              "Pre-submission quality assessment of your most recent report",
            ],
            [
              "Second Look",
              "20 IP",
              "Re-observe a player with fresh eyes, correcting earlier misreadings",
            ],
          ]}
        />
        <Subheading>Youth Scout Actions</Subheading>
        <Table
          headers={["Action", "Cost", "Effect"]}
          rows={[
            [
              "Diamond in the Rough",
              "30 IP",
              "Flags a hidden-gem youth player in your current region",
            ],
            [
              "Generational Whisper",
              "25 IP",
              "Reveals the full potential ability range of a youth player",
            ],
          ]}
        />
        <Subheading>First Team Scout Actions</Subheading>
        <Table
          headers={["Action", "Cost", "Effect"]}
          rows={[
            [
              "Perfect Fit",
              "25 IP",
              "Analyses player-club tactical compatibility",
            ],
            [
              "Pressure Test",
              "25 IP",
              "Reveals big-match performance by simulating high-stakes conditions",
            ],
          ]}
        />
        <Subheading>Regional Expert Actions</Subheading>
        <Table
          headers={["Action", "Cost", "Effect"]}
          rows={[
            [
              "Network Pulse",
              "25 IP",
              "Insider intel on contracts, injuries, or transfer willingness",
            ],
            [
              "Territory Mastery",
              "30 IP",
              "Large temporary familiarity boost for a target country",
            ],
          ]}
        />
        <Subheading>Data Scout Actions</Subheading>
        <Table
          headers={["Action", "Cost", "Effect"]}
          rows={[
            [
              "Algorithmic Epiphany",
              "25 IP",
              "Advanced statistical model reveals hidden performance patterns",
            ],
            [
              "Market Blindspot",
              "30 IP",
              "Identifies undervalued players whose stats outperform their market value",
            ],
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "insight-overview",
      "insight-cooldowns",
      "youth-scouting-activities",
      "first-team-activities",
      "regional-expert-perks",
      "data-scout-perks",
    ],
    tags: [
      "insight",
      "actions",
      "clarity",
      "hidden",
      "youth",
      "first-team",
      "regional",
      "data",
    ],
  },

  // ── Cooldowns & Fizzle ──────────────────────────────────────────────────
  {
    slug: "insight-cooldowns",
    title: "Cooldowns & Fizzle",
    category: "insight-points",
    order: 2,
    summary:
      "After using an insight action it enters a 2-week cooldown. High fatigue introduces a 20% fizzle chance that wastes your IP.",
    searchText:
      "Every insight action enters a cooldown period after use. The default cooldown is 2 weeks, meaning you cannot use the same action again until 2 in-game weeks have passed. Different actions can be used in the same week as long as each is off cooldown and you have enough IP. Cooldowns tick down automatically at the end of each week. The cooldown system prevents spamming powerful actions and encourages strategic timing. Plan your insight usage around key matches and critical report deadlines. Fizzle is the risk of wasting IP on a failed action. When your fatigue is above 70, every insight action has a 20% chance of fizzling. A fizzled action consumes the full IP cost but produces no effect. The cooldown is still triggered on a fizzle, so you lose both the IP and the ability to retry for 2 weeks. To avoid fizzle: rest before using insight actions, keep fatigue below 70, use the endurance scout attribute to slow fatigue accumulation, and plan insight usage for early in the week when fatigue is lowest. The combination of cooldowns and fizzle risk means that insight actions are precious resources. Spend them deliberately on your highest-priority targets, not casually.",
    content: (
      <SectionBlock>
        <Para>
          Every insight action enters a{" "}
          <Tag color="amber">2-week cooldown</Tag> after use. You cannot use
          the same action again until the cooldown expires. Different actions
          can be used in the same week as long as each is off cooldown and you
          have enough IP.
        </Para>
        <Subheading>Cooldown Mechanics</Subheading>
        <BulletList
          items={[
            "Default cooldown: 2 in-game weeks per action.",
            "Cooldowns tick down automatically at the end of each week.",
            "Multiple different actions can be used in the same week.",
            "Cooldowns are tracked per action, not globally.",
          ]}
        />
        <Subheading>Fizzle Risk</Subheading>
        <Para>
          When your fatigue is above <Tag color="rose">70</Tag>, every insight
          action has a <Tag color="rose">20% chance of fizzling</Tag>. A
          fizzled action consumes the full IP cost but produces no effect. The
          cooldown is still triggered on a fizzle, so you lose both the IP and
          the ability to retry for 2 weeks.
        </Para>
        <Subheading>Avoiding Fizzle</Subheading>
        <NumberedList
          items={[
            "Rest before using insight actions to bring fatigue below 70.",
            "Use the endurance scout attribute to slow fatigue accumulation.",
            "Plan insight usage for early in the week when fatigue is lowest.",
            "Schedule lighter activities around your insight usage days.",
          ]}
        />
        <InfoCard title="Strategic Timing" color="blue">
          The combination of cooldowns and fizzle risk means insight actions are
          precious resources. Spend them deliberately on your highest-priority
          targets and plan around key matches and report deadlines.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "insight-overview",
      "insight-actions",
      "fatigue",
      "scheduling-your-week",
    ],
    tags: ["cooldown", "fizzle", "fatigue", "timing", "strategy", "insight"],
  },
];
