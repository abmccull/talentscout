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
      "Players receive a 1-10 public match rating shaped by role-relevant contribution, decisive actions, errors, opposition, and form.",
    searchText:
      "Every player receives a 1-10 public match rating. Position and tactical role change which actions matter: finishing and movement matter more to a striker, while prevention and buildup matter more to a centre-back. Goals, assists, mistakes, opposition, and match context can swing one performance. Recent matches shape visible form, so repeated observations across different opponents help separate a hot streak from repeatable quality.",
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
              <span className="font-medium text-zinc-200">Overall influence</span> —
              how consistently the player affected the match in observable ways.
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
                Decisive moments
              </span>{" "}
              — goals, assists, saves, major chances, and costly errors can
              move one rating sharply.
            </>,
          ]}
        />
        <Subheading>Form</Subheading>
        <Para>
          Form summarizes recent public performances, with newer matches
          carrying more relevance. It affects confidence, attention, and how a
          player may look in the next observation, but it is not proof that the
          player&apos;s underlying level changed.
        </Para>
        <InfoCard title="Scouting Implication" color="amber">
          A player on good form may look more decisive than usual. Observe
          across opponents, roles, and pressure states to separate repeatable
          quality from temporary performance. One great match is evidence, not
          a verdict.
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
      "Yellow and red cards drag down performances and can rule players out of coming fixtures.",
    searchText:
      "Discipline events arise from tackles and fouls during matches. Rash, poorly timed defending attracts more referee attention than controlled challenges, and temperamental players are more likely to lose the official. Cards drag down match ratings and can spill into suspensions, leaving players unavailable for upcoming fixtures. Discipline matters when scouting: a player who keeps getting booked may be carrying a recurring liability, while composed players usually stay on the right side of the referee. Check the card trail across multiple matches before committing to a high-conviction report.",
    content: (
      <SectionBlock>
        <Para>
          Discipline events arise from tackle and foul events during matches.
          Cards affect match ratings and can trigger suspensions that remove
          players from upcoming fixtures.
        </Para>
        <Subheading>What Tends to Draw Cards</Subheading>
        <Table
          headers={["Pattern", "Typical outcome"]}
          rows={[
            ["Late or reckless defending", "More likely to draw referee attention."],
            ["Controlled defending", "Less likely to lead to a booking."],
            ["Temperamental streak", "Raises the risk of repeated cautions."],
          ]}
        />
        <Para>
          Players with the <Tag color="rose">Temperamental</Tag> trait have{" "}
          <span className="font-medium text-zinc-200">
            a shorter fuse
          </span>{" "}
          when matches turn heated, so their disciplinary trail deserves extra scrutiny.
        </Para>
        <Subheading>Suspensions</Subheading>
        <Para>
          Accumulated cautions and straight reds can spill into bans, so a messy
          disciplinary trail can leave a player unavailable when it matters.
        </Para>
        <Subheading>Rating Impact</Subheading>
        <BulletList
          items={[
            <>
              A yellow card usually takes the shine off an otherwise solid performance.
            </>,
            <>
              A red card can wreck the match line entirely, no matter how well the player started.
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
      "Cross-border moves follow player level, reputation fit, and the heat of the market.",
    searchText:
      "The transfer system moves players between clubs and countries when level, reputation, opportunity, and market pressure line up. Stronger players are more likely to attract foreign interest, and busy windows create more movement than quiet stretches. Fees lean on market value, age, position, contract leverage, and the urgency of buyer and seller. Transfer routes echo familiar football pathways, with talent flowing from development leagues into richer competitions and from strong domestic clubs into continental stages. Each move can create fresh scouting opportunities, especially when a player lands in a league your clients suddenly care about. Report demand rises when the market is running hot.",
    content: (
      <SectionBlock>
        <Para>
          The transfer system simulates player movement between clubs and
          countries. Cross-border moves are most common when a player&apos;s
          level and reputation fit the buying club and the market turns active.
        </Para>
        <Subheading>Transfer Mechanics</Subheading>
        <BulletList
          items={[
            "Cross-border moves favour players whose level and reputation fit the buying club.",
            "Fees rise or soften with market value, age, contract leverage, and window urgency.",
            "Busy windows create more churn; quiet periods are calmer and more selective.",
            "A single move can quickly change where your next best lead sits.",
          ]}
        />
        <Subheading>Flow Patterns</Subheading>
        <Para>
          Transfers follow familiar football pathways:
        </Para>
        <Table
          headers={["Route type", "Typical direction"]}
          rows={[
            ["South American standouts", "Into Europe's richer leagues."],
            ["Selling leagues", "Toward clubs with bigger transfer budgets."],
            ["Strong domestic performers", "Into higher-prestige regional stages."],
            ["Established pros", "Into clubs that need ready-made help now."],
          ]}
        />
        <Subheading>Market Temperature</Subheading>
        <Para>
          Report marketplace prices fluctuate with transfer activity. Quiet
          weeks bring calmer prices, while deadline pressure creates urgent
          calls and stronger bids. Time your report sales for maximum revenue.
        </Para>
        <InfoCard title="Scouting Opportunity" color="emerald">
          When a promising player lands in a new league, fresh eyes are needed
          quickly. Stay close to active markets if you want urgent commissions.
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
