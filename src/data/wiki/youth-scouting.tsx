import type { WikiArticle } from "@/components/game/wiki/wikiTypes";
import { SectionBlock, Para, Tag, Table, BulletList } from "./components";

// ─── Youth Scouting ─────────────────────────────────────────────────────────

export const youthScoutingArticles: WikiArticle[] = [
  // ── Unsigned Youth ──────────────────────────────────────────────────────────
  {
    slug: "unsigned-youth",
    title: "Unsigned Youth",
    category: "youth-scouting",
    order: 0,
    summary:
      "Prospects is a case list: last look, open question, next test, and rival heat.",
    searchText:
      "Unsigned Youth. Youth scouting is the question will this kid become. Prospects is a working case list, not a star board. Each case shows the last look, the open question, the next test, and rival heat. Venues pool by public buzz, visibility, and who you already know — never true potential. Write a placement report when the evidence can survive a second context.",
    content: (
      <SectionBlock>
        <Para>
          Youth Scout asks one question: will this kid become? Unsigned
          prospects appear at school matches, grassroots venues, festivals, and
          follow-ups. Prospects is your working case list, not a star board.
        </Para>
        <Para>
          Each case shows the last look, the open question, the next test, and
          whether a rival is already circling. Your read of ability lives inside
          the dossier as a range, labelled as your read — never as hidden truth.
        </Para>
      </SectionBlock>
    ),
    related: [
      "placement-reports",
      "alumni-tracking",
      "youth-activities",
      "youth-scout-spec",
      "contact-types",
    ],
    tags: [
      "youth",
      "unsigned",
      "grassroots",
      "academy",
      "scouting",
      "potential",
    ],
  },

  // ── Placement Reports ───────────────────────────────────────────────────────
  {
    slug: "placement-reports",
    title: "Placement Reports",
    category: "youth-scouting",
    order: 1,
    summary:
      "How placement reports differ from standard reports, their components, and how clubs evaluate them.",
    searchText:
      "Placement Reports. Instead of a standard scouting report, unsigned youth receive a Placement Report, a recommendation to a specific club academy. The placement report contains: your attribute assessments with confidence ranges, your estimated potential ability range, a conviction level matching standard report conventions, a target academy recommendation. The club considers your conviction level, your reputation, the player's observed quality, and your specialization perks when deciding whether to offer a trial. The Placement Reputation perk at level 9 increases acceptance rates by 25%.",
    content: (
      <SectionBlock>
        <Para>
          Instead of a standard scouting report, unsigned youth receive a
          Placement Report {"\u2014"} a recommendation to a specific club
          academy. The placement report contains:
        </Para>
        <BulletList
          items={[
            "Your attribute assessments (with confidence ranges)",
            "Your estimated potential ability range",
            "A conviction level matching standard report conventions",
            "A target academy recommendation",
          ]}
        />
        <Para>
          The club considers your conviction level, your reputation, the
          player&apos;s observed quality, and your specialization perks when
          deciding whether to offer a trial. The{" "}
          <Tag color="zinc">Placement Reputation</Tag> perk at level 9
          increases acceptance rates by 25%.
        </Para>
      </SectionBlock>
    ),
    related: [
      "unsigned-youth",
      "alumni-tracking",
      "youth-scout-spec",
      "building-conviction",
      "reputation",
    ],
    tags: [
      "placement",
      "report",
      "academy",
      "trial",
      "conviction",
      "youth",
      "recommendation",
    ],
  },

  // ── Alumni Tracking ─────────────────────────────────────────────────────────
  {
    slug: "alumni-tracking",
    title: "Alumni Tracking",
    category: "youth-scouting",
    order: 2,
    summary:
      "Placed kids stay on the Desk as your people over years: debut, loan, released, international.",
    searchText:
      "Alumni Tracking. Players you place become alumni. Desk shows those names as your people over years — debut, loan, released, international — because that is the 30-year scout fantasy. Accurate placements that later debut or stall are how reputation and job pressure actually move. High-achievers can become contacts.",
    content: (
      <SectionBlock>
        <Para>
          The first accepted placement becomes a name you live with. Alumni
          stay on the Desk as your people over years: academy, debut, loan,
          released, transferred, international.
        </Para>
        <Para>
          That record is the 30-year fantasy. Clubs hire and fire you on those
          names, not on a skill tree. High-achievers can later become contacts.
        </Para>
      </SectionBlock>
    ),
    related: [
      "unsigned-youth",
      "placement-reports",
      "reputation",
      "youth-scout-spec",
    ],
    tags: [
      "alumni",
      "tracking",
      "development",
      "discoveries",
      "reputation",
      "youth",
      "dashboard",
    ],
  },

  // ── Youth-Specific Activities ───────────────────────────────────────────────
  {
    slug: "youth-activities",
    title: "Youth-Specific Activities",
    category: "youth-scouting",
    order: 3,
    summary:
      "Table of six youth-specific activities with their access requirements and observation noise levels.",
    searchText:
      "Youth-Specific Activities. School Match accessible to all scouts, very young prospects, high noise x1.2. Grassroots Tournament requires Youth perk, multi-player events in community venues, noise x1.3. Street Football requires Youth perk, hidden gems off the official circuit, noise x1.4. Academy Trial Day requires Youth perk level 15, formal club-sponsored trial, good accuracy x0.9. Youth Festival accessible to all scouts, multi-team youth competition, noise x1.2. Parent or Coach Meeting accessible to Youth scouts, supplementary intel, very noisy x2.0, useful for character reads only.",
    content: (
      <SectionBlock>
        <Table
          headers={["Activity", "Access", "Notes"]}
          rows={[
            [
              "School Match",
              "All scouts",
              "Very young prospects. High noise (\u00d71.2).",
            ],
            [
              "Grassroots Tournament",
              "Youth perk",
              "Multi-player events in community venues. Noise \u00d71.3.",
            ],
            [
              "Street Football",
              "Youth perk",
              "Hidden gems off the official circuit. Noise \u00d71.4.",
            ],
            [
              "Academy Trial Day",
              "Youth perk (Lv 15)",
              "Formal club-sponsored trial. Good accuracy (\u00d70.9).",
            ],
            [
              "Youth Festival",
              "All scouts",
              "Multi-team youth competition. Noise \u00d71.2.",
            ],
            [
              "Parent/Coach Meeting",
              "Youth scouts",
              "Supplementary intel. Very noisy (\u00d72.0) \u2014 useful for character reads only.",
            ],
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "unsigned-youth",
      "youth-scout-spec",
      "scheduling-your-week",
      "fatigue",
    ],
    tags: [
      "youth",
      "activities",
      "school",
      "grassroots",
      "tournament",
      "trial",
      "festival",
      "noise",
    ],
  },
];
