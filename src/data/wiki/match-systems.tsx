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

// ─── Match Systems ──────────────────────────────────────────────────────────

export const matchSystemsArticles: WikiArticle[] = [
  // ── Match Ratings ───────────────────────────────────────────────────────
  {
    slug: "match-ratings",
    title: "Match Ratings",
    category: "match-systems",
    order: 0,
    summary:
      "Players receive a 1-10 rating each match based on current ability, position-weighted events, and discrete bonuses for goals, assists, and errors.",
    searchText:
      "Every player receives a match rating on a 1-10 scale after each match. The rating is calculated from three components. First, a baseline derived from current ability (CA): 4.5 plus CA divided by 200 multiplied by 3.0. A player with CA 100 gets a baseline of roughly 6.0. Second, position-weighted event quality. Each match event (pass, tackle, shot, dribble, cross) has an importance weight that varies by position. A striker's rating is more affected by shooting events than tackling events, while a centre-back's rating is weighted toward defensive events. Third, discrete bonuses and penalties: each goal scored adds +0.5, each assist adds +0.3, and each defensive error subtracts -0.4. Form is calculated as a weighted average of a player's last 6 match ratings, mapped to a modifier range of -3 to +3. Recent matches are weighted more heavily. Good form improves a player's effective ability in future matches while poor form reduces it. When scouting, a player on good form may appear better than their true ability. Observing a player across multiple matches helps separate genuine ability from temporary form. A single outstanding performance does not guarantee consistent quality.",
    content: (
      <SectionBlock>
        <Para>
          Every player receives a match rating on a{" "}
          <Tag color="emerald">1–10 scale</Tag> after each match. The rating
          reflects their actual in-match contribution, not just raw ability.
        </Para>
        <Subheading>Rating Components</Subheading>
        <NumberedList
          items={[
            <>
              <span className="font-medium text-zinc-200">CA Baseline</span> —
              4.5 + (CA / 200) x 3.0. A player with CA 100 gets a baseline
              around 6.0.
            </>,
            <>
              <span className="font-medium text-zinc-200">
                Position-weighted events
              </span>{" "}
              — each match event (pass, tackle, shot, dribble) has an
              importance weight that varies by position.
            </>,
            <>
              <span className="font-medium text-zinc-200">
                Discrete bonuses
              </span>{" "}
              — goal +0.5, assist +0.3, defensive error -0.4.
            </>,
          ]}
        />
        <Subheading>Form</Subheading>
        <Para>
          Form is a weighted average of a player&apos;s last 6 match ratings,
          mapped to a modifier range of <Tag color="rose">-3</Tag> to{" "}
          <Tag color="emerald">+3</Tag>. Recent matches are weighted more
          heavily. Good form improves effective ability in future matches; poor
          form reduces it.
        </Para>
        <InfoCard title="Scouting Implication" color="amber">
          A player on good form may appear better than their true ability.
          Observe across multiple matches to separate genuine ability from
          temporary form. A single outstanding performance does not guarantee
          consistent quality.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "player-attributes",
      "tactics-formations",
      "discipline-cards",
      "conviction-levels",
      "perception-model",
    ],
    tags: ["rating", "match", "form", "performance", "baseline", "events"],
  },

  // ── Tactics & Formations ────────────────────────────────────────────────
  {
    slug: "tactics-formations",
    title: "Tactics & Formations",
    category: "match-systems",
    order: 1,
    summary:
      "Six tactical identities define how teams play: High Press, Possession, Counter-Attack, Direct Play, Wing Play, and Balanced. Matchups follow rock-paper-scissors logic.",
    searchText:
      "Every team in TalentScout plays according to one of six tactical identities, each with distinct event distributions and strengths. High Press generates more tackles, interceptions, and pressing events. It beats Possession-Based play by disrupting buildup. Possession-Based generates more passes, key passes, and buildup events. It beats Counter-Attacking play by starving them of the ball. Counter-Attacking generates more fast breaks, through balls, and transition events. It beats High Press by exploiting the space left behind aggressive pressing. Direct Play generates more long balls, aerial duels, and direct forward passes. It beats Wing Play by bypassing wide areas entirely. Wing Play generates more crosses, dribbles on the flank, and wide buildup events. It beats Balanced play through width and overloads. Balanced is the default identity with no extreme strengths or weaknesses. Tactical matchups follow a rock-paper-scissors system. When a team has a tactical advantage over its opponent, it receives a +0.15 modifier to match event quality. When disadvantaged, it receives a -0.15 modifier. Balanced teams are never strongly advantaged or disadvantaged. Understanding tactical matchups helps scouts predict which players will shine in specific fixtures. A striker on a Counter-Attacking team facing a High Press opponent is more likely to produce good events. Maximum 5 substitutions are allowed per team per match.",
    content: (
      <SectionBlock>
        <Para>
          Every team plays according to one of{" "}
          <Tag color="emerald">six tactical identities</Tag>, each with
          distinct event distributions and strengths. Matchups follow a
          rock-paper-scissors system.
        </Para>
        <Table
          headers={["Identity", "Strengths", "Beats"]}
          rows={[
            [
              "High Press",
              "Tackles, interceptions, pressing",
              "Possession-Based",
            ],
            [
              "Possession-Based",
              "Passes, key passes, buildup",
              "Counter-Attacking",
            ],
            [
              "Counter-Attacking",
              "Fast breaks, through balls, transitions",
              "High Press",
            ],
            [
              "Direct Play",
              "Long balls, aerial duels, direct passes",
              "Wing Play",
            ],
            [
              "Wing Play",
              "Crosses, flank dribbles, wide buildup",
              "Balanced",
            ],
            [
              "Balanced",
              "No extreme strengths or weaknesses",
              "—",
            ],
          ]}
        />
        <Subheading>Tactical Advantage</Subheading>
        <Para>
          When a team has a tactical advantage, it receives a{" "}
          <Tag color="emerald">+0.15</Tag> modifier to match event quality.
          When disadvantaged, it receives a{" "}
          <Tag color="rose">-0.15</Tag> modifier.
        </Para>
        <InfoCard title="Scouting Implication" color="blue">
          Understanding tactical matchups helps predict which players will shine
          in specific fixtures. A striker on a Counter-Attacking team facing a
          High Press opponent is more likely to produce standout events.
          Maximum 5 substitutions are allowed per team per match.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "match-ratings",
      "discipline-cards",
      "player-roles",
      "focus-lenses",
    ],
    tags: [
      "tactics",
      "formation",
      "matchup",
      "press",
      "possession",
      "counter",
      "direct",
      "wing",
    ],
  },

  // ── Discipline & Cards ──────────────────────────────────────────────────
  {
    slug: "discipline-cards",
    title: "Discipline & Cards",
    category: "match-systems",
    order: 2,
    summary:
      "Yellow and red cards affect match ratings and trigger suspensions. 5 yellows equals a 1-match ban; 10 yellows equals a 2-match ban. Red cards bring 1-3 match suspensions.",
    searchText:
      "Discipline events arise from tackle and foul events during matches. Yellow card probability depends on event quality: low quality tackles have a 40% chance of producing a yellow card, moderate quality 12%, and high quality 3%. Players with the Temperamental trait have double the yellow card probability. Accumulation thresholds: 5 yellow cards in a season triggers a 1-match suspension ban. 10 yellow cards in a season triggers a 2-match suspension ban. A red card results in an immediate sending off and a suspension of 1 to 3 matches depending on the reason. The specific red card suspension length: dangerous play is 1 match, violent conduct is 2 matches, and serious foul play is 3 matches. Match rating penalties: a yellow card reduces the match rating by -0.3. A red card caps the match rating at a maximum of 3.0 regardless of other performance. Discipline is an important factor when scouting. A player who consistently picks up yellow cards may be a liability. The Temperamental trait doubles card probability, making it a critical hidden factor. Conversely, disciplined players with high composure rarely get booked. Check a player's card record across multiple matches to assess their discipline risk before committing to a high-conviction report.",
    content: (
      <SectionBlock>
        <Para>
          Discipline events arise from tackle and foul events during matches.
          Cards affect match ratings and can trigger suspensions that remove
          players from upcoming fixtures.
        </Para>
        <Subheading>Yellow Card Probability</Subheading>
        <Table
          headers={["Event Quality", "Yellow Card Chance"]}
          rows={[
            ["Low quality", "40%"],
            ["Moderate quality", "12%"],
            ["High quality", "3%"],
          ]}
        />
        <Para>
          Players with the <Tag color="rose">Temperamental</Tag> trait have{" "}
          <span className="font-medium text-zinc-200">
            double
          </span>{" "}
          the yellow card probability.
        </Para>
        <Subheading>Suspensions</Subheading>
        <Table
          headers={["Trigger", "Suspension"]}
          rows={[
            ["5 yellow cards in a season", "1-match ban"],
            ["10 yellow cards in a season", "2-match ban"],
            ["Red card — dangerous play", "1-match ban"],
            ["Red card — violent conduct", "2-match ban"],
            ["Red card — serious foul play", "3-match ban"],
          ]}
        />
        <Subheading>Rating Impact</Subheading>
        <BulletList
          items={[
            <>
              Yellow card: <Tag color="amber">-0.3</Tag> to match rating.
            </>,
            <>
              Red card: match rating capped at <Tag color="rose">3.0</Tag>{" "}
              regardless of other performance.
            </>,
          ]}
        />
        <InfoCard title="Scouting Implication" color="amber">
          A player who consistently picks up yellows may be a liability. Check
          their card record across multiple matches and look for the
          Temperamental trait before committing to a high-conviction report.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "match-ratings",
      "tactics-formations",
      "behavioral-markers",
      "personality-traits",
      "player-attributes",
    ],
    tags: [
      "discipline",
      "cards",
      "yellow",
      "red",
      "suspension",
      "temperamental",
      "foul",
    ],
  },

  // ── Transfer Windows ────────────────────────────────────────────────────
  {
    slug: "transfer-windows",
    title: "Transfer Windows",
    category: "match-systems",
    order: 3,
    summary:
      "Players with CA above 80 can move between countries. Transfers follow real-world flow patterns, with 0-3 moves per week and fees based on market value.",
    searchText:
      "The transfer system simulates player movement between clubs and countries. Cross-country transfers are available for players with current ability above 80. Between 0 and 3 transfers occur each week. Transfer fees are calculated as the player's market value multiplied by a random factor between 0.8 and 1.2. The system uses a flow matrix based on real-world transfer patterns. Major flows include Brazil to England at 15% probability, Brazil to Spain at 12%, Brazil to Italy at 10%, Argentina to Spain at 15%, Argentina to Italy at 12%, France to England at 12%, Portugal to England at 10%, and many more. The reputation match window is 20, meaning clubs prefer to sign players whose reputation is within 20 points of their own level. Transfers create scouting opportunities. When a high-ability player moves to a new league they become a potential target for observation. Transfer windows are seasonal, with more activity during the summer and January windows. Market value is calculated using a 5th-power curve based on current ability. A player with CA 160 is worth dramatically more than a player with CA 80. Age, position, and contract status also influence value. Report marketplace prices spike during transfer windows as clubs urgently seek intelligence on potential signings. The market temperature modifier ranges from 0.7x during cold periods to 1.8x near transfer deadline day.",
    content: (
      <SectionBlock>
        <Para>
          The transfer system simulates player movement between clubs and
          countries. Cross-country transfers are available for players with{" "}
          <Tag color="emerald">current ability above 80</Tag>. Between 0 and 3
          transfers occur each week.
        </Para>
        <Subheading>Transfer Mechanics</Subheading>
        <BulletList
          items={[
            "Transfer fee = market value x random factor (0.8 to 1.2).",
            "Reputation match window of 20 — clubs prefer players near their level.",
            "Market value follows a 5th-power curve based on current ability.",
            "Age, position, and contract status also influence value.",
          ]}
        />
        <Subheading>Flow Patterns</Subheading>
        <Para>
          Transfers follow real-world flow patterns. Major routes include:
        </Para>
        <Table
          headers={["From", "To", "Probability"]}
          rows={[
            ["Brazil", "England", "15%"],
            ["Brazil", "Spain", "12%"],
            ["Brazil", "Italy", "10%"],
            ["Argentina", "Spain", "15%"],
            ["Argentina", "Italy", "12%"],
            ["France", "England", "12%"],
            ["Portugal", "England", "10%"],
          ]}
        />
        <Subheading>Market Temperature</Subheading>
        <Para>
          Report marketplace prices fluctuate with transfer activity. The
          market temperature modifier ranges from{" "}
          <Tag color="blue">0.7x</Tag> during cold periods to{" "}
          <Tag color="emerald">1.8x</Tag> near transfer deadline day. Time
          your report sales for maximum revenue.
        </Para>
        <InfoCard title="Scouting Opportunity" color="emerald">
          When a high-ability player moves to a new league, they become a prime
          target for observation. Clubs urgently seek intelligence on potential
          signings during transfer windows — position yourself to supply it.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "match-ratings",
      "report-marketplace",
      "countries-leagues",
      "player-attributes",
      "income-sources",
    ],
    tags: [
      "transfer",
      "window",
      "market",
      "value",
      "fee",
      "deadline",
      "flow",
    ],
  },
];
