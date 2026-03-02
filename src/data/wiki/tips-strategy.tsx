import type { WikiArticle } from "@/components/game/wiki/wikiTypes";
import { SectionBlock, Para, Tag, Table, BulletList } from "./components";

// ─── Tips & Strategy ────────────────────────────────────────────────────────

export const tipsStrategyArticles: WikiArticle[] = [
  // ── Choosing the Right Lens ─────────────────────────────────────────────────
  {
    slug: "choosing-the-right-lens",
    title: "Choosing the Right Lens",
    category: "tips-strategy",
    order: 0,
    summary:
      "Lens selection is the biggest decision in live scouting. Position-specific tips for maximising observation quality.",
    searchText:
      "Choosing the Right Lens. Match lens selection is the single biggest decision in live scouting. A few guiding principles: First-time watch, use General, get a broad overview before committing to a deep read on any domain. Assessing a striker, Physical in transitions and counter-attacks, Technical in build-up and set pieces. Assessing a midfielder, Tactical during pressing phases, Mental in possession and build-up. Assessing a defender, Physical during counter-attacks, Tactical during pressing and set pieces. Checking hidden attributes, watch for leadership events and errors to get Composure and Decision Making reads, Consistency and Professionalism require multiple sessions over different matches.",
    content: (
      <SectionBlock>
        <Para>
          Match lens selection is the single biggest decision in live scouting. A
          few guiding principles:
        </Para>
        <BulletList
          items={[
            <>
              <span className="font-medium text-zinc-200">
                First-time watch:
              </span>{" "}
              Use General. Get a broad overview before committing to a deep read
              on any domain.
            </>,
            <>
              <span className="font-medium text-zinc-200">
                Assessing a striker:
              </span>{" "}
              Physical in transitions and counter-attacks; Technical in build-up
              and set pieces.
            </>,
            <>
              <span className="font-medium text-zinc-200">
                Assessing a midfielder:
              </span>{" "}
              Tactical during pressing phases; Mental in possession and build-up.
            </>,
            <>
              <span className="font-medium text-zinc-200">
                Assessing a defender:
              </span>{" "}
              Physical during counter-attacks; Tactical during pressing and set
              pieces.
            </>,
            <>
              <span className="font-medium text-zinc-200">
                Checking hidden attributes:
              </span>{" "}
              Watch for leadership events and errors to get Composure and
              Decision Making reads. Consistency and Professionalism require
              multiple sessions over different matches.
            </>,
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "phase-matching",
      "building-conviction",
      "reading-between-the-lines",
      "first-team-scout-spec",
      "data-scout-spec",
    ],
    tags: [
      "lens",
      "observation",
      "position",
      "striker",
      "midfielder",
      "defender",
      "tips",
      "strategy",
    ],
  },

  // ── Phase Matching ──────────────────────────────────────────────────────────
  {
    slug: "phase-matching",
    title: "Phase Matching",
    category: "tips-strategy",
    order: 1,
    summary:
      "Which match phase types expose which attributes, and how to align your lens with the right moments.",
    searchText:
      "Phase Matching. Different phase types expose different things. Watch for the phase type indicator and switch your lens to match. Pace, Stamina, Agility are best seen during Transition or Counter Attack phases. Heading, Strength are best seen during Set Piece phases. Passing, First Touch are best seen during Build-Up or Possession phases. Pressing, Defensive Awareness are best seen during Pressing Sequence phases. Decision Making, Composure are revealed by errors and assists in any phase. Off the Ball, Positioning are best seen during Possession or Transition phases.",
    content: (
      <SectionBlock>
        <Para>
          Different phase types expose different things. Watch for the phase type
          indicator and switch your lens to match:
        </Para>
        <Table
          headers={["If you want to see\u2026", "Wait for this phase"]}
          rows={[
            ["Pace, Stamina, Agility", "Transition or Counter Attack"],
            ["Heading, Strength", "Set Piece"],
            ["Passing, First Touch", "Build-Up or Possession"],
            ["Pressing, Defensive Awareness", "Pressing Sequence"],
            [
              "Decision Making, Composure",
              "Any phase \u2014 revealed by errors and assists",
            ],
            ["Off the Ball, Positioning", "Possession or Transition"],
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "choosing-the-right-lens",
      "building-conviction",
      "reading-between-the-lines",
      "fatigue",
    ],
    tags: [
      "phase",
      "matching",
      "transition",
      "set piece",
      "possession",
      "pressing",
      "attributes",
      "tips",
    ],
  },

  // ── Building Conviction ─────────────────────────────────────────────────────
  {
    slug: "building-conviction",
    title: "Building Conviction",
    category: "tips-strategy",
    order: 2,
    summary:
      "The three-observation rule and when to use each conviction level, from Note through Table Pound.",
    searchText:
      "Building Conviction. Never submit a report with a strong conviction level based on a single session. The three-observation rule is a safe baseline. Note is for one session, wide confidence ranges, limited phase coverage. Recommend is for two to three sessions, multiple phase types seen. Strong Recommend is for three or more sessions across different contexts, confidence intervals narrowed. Table Pound is for five or more sessions, training visit if possible, near-certainty on key attributes. Named for the tradition of scouts banging the table to convince the manager, your strongest possible recommendation. A Table Pound with insufficient observation depth is the fastest way to destroy your reputation. Clubs remember wrong calls.",
    content: (
      <SectionBlock>
        <Para>
          Never submit a report with a strong conviction level based on a single
          session. The three-observation rule is a safe baseline:
        </Para>
        <BulletList
          items={[
            <>
              <Tag color="zinc">Note</Tag> {"\u2014"} One session, wide
              confidence ranges, limited phase coverage
            </>,
            <>
              <Tag color="zinc">Recommend</Tag> {"\u2014"} Two to three
              sessions, multiple phase types seen
            </>,
            <>
              <Tag color="amber">Strong Recommend</Tag> {"\u2014"} Three or
              more sessions across different contexts, confidence intervals
              narrowed
            </>,
            <>
              <Tag color="rose">Table Pound</Tag> {"\u2014"} Five or more
              sessions, training visit if possible, near-certainty on key
              attributes. (Named for the tradition of scouts banging the table to
              convince the manager {"\u2014"} your strongest possible
              recommendation.)
            </>,
          ]}
        />
        <Para>
          A Table Pound with insufficient observation depth is the fastest way to
          destroy your reputation. Clubs remember wrong calls.
        </Para>
      </SectionBlock>
    ),
    related: [
      "choosing-the-right-lens",
      "phase-matching",
      "reading-between-the-lines",
      "reputation",
      "placement-reports",
      "first-team-scout-spec",
    ],
    tags: [
      "conviction",
      "note",
      "recommend",
      "strong recommend",
      "table pound",
      "observation",
      "report",
      "strategy",
    ],
  },

  // ── Reading Between the Lines ───────────────────────────────────────────────
  {
    slug: "reading-between-the-lines",
    title: "Reading Between the Lines",
    category: "tips-strategy",
    order: 3,
    summary:
      "Advanced tips on form vs ability, opposition quality, character intel from contacts, and young player volatility.",
    searchText:
      "Reading Between the Lines. Some of the most valuable information is not in the attribute readings themselves. A player with high technical readings but poor form indicators may be in a temporary slump, check for the Form vs Ability perk if you are a First Team scout. A player performing well against weak opposition gets an inflated reading, adjust your conviction accordingly unless you have the Opposition Context Correction perk. Check your contact network for character information, Professionalism and Consistency are hidden attributes that only emerge through sustained observation or contact tips. Young players under 18 have volatile development curves. A low current ability with a wide PA range may be more valuable than a slightly higher but ceiling-capped older prospect.",
    content: (
      <SectionBlock>
        <Para>
          Some of the most valuable information is not in the attribute readings
          themselves:
        </Para>
        <BulletList
          items={[
            <>
              A player with high technical readings but poor form indicators may
              be in a temporary slump {"\u2014"} check for the Form vs Ability
              perk if you are a First Team scout.
            </>,
            <>
              A player performing well against weak opposition gets an inflated
              reading {"\u2014"} adjust your conviction accordingly unless you
              have the Opposition Context Correction perk.
            </>,
            <>
              Check your contact network for character information {"\u2014"}{" "}
              Professionalism and Consistency are hidden attributes that only
              emerge through sustained observation or contact tips.
            </>,
            <>
              Young players (under 18) have volatile development curves. A low
              current ability with a wide PA range may be more valuable than a
              slightly higher but ceiling-capped older prospect.
            </>,
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "choosing-the-right-lens",
      "building-conviction",
      "first-team-scout-spec",
      "gossip-intel",
      "intel-reliability",
      "youth-scout-spec",
    ],
    tags: [
      "form",
      "ability",
      "opposition",
      "hidden attributes",
      "character",
      "development",
      "advanced",
      "tips",
    ],
  },
];
