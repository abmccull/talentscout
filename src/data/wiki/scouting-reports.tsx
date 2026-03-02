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

// ─── Scouting & Reports ─────────────────────────────────────────────────────

export const scoutingReportsArticles: WikiArticle[] = [
  // ── The Three-Layer Perception Model ──────────────────────────────────────
  {
    slug: "perception-model",
    title: "The Three-Layer Perception Model",
    category: "scouting-reports",
    order: 0,
    summary:
      "Every observation passes through three layers: Visibility, Accuracy, and Confidence.",
    searchText:
      "Every observation you make passes through three layers of processing before it becomes a reading. Layer 1 — Visibility: Which attributes can be seen in a given phase or context. Each match phase type (build-up, transition, set piece, etc.) naturally exposes different attributes. Your skills and perks can extend this set. Layer 2 — Accuracy: How close your perceived value is to the player's true attribute value. Accuracy is governed by your relevant scout skill, the context noise multiplier, fatigue, and weather. The closer to true, the better your report. Layer 3 — Confidence: The uncertainty range around your estimate, e.g. [13-16]. Confidence narrows with more observations and higher skills. Wider confidence = more uncertainty in your report. The domain-to-skill mapping is: technical to Technical Eye, physical to Physical Assessment, mental/hidden to Psychological Read, tactical to Tactical Understanding.",
    content: (
      <SectionBlock>
        <Para>
          Every observation you make passes through three layers of processing
          before it becomes a reading:
        </Para>
        <div className="space-y-2">
          <InfoCard title="Layer 1 — Visibility" color="emerald">
            Which attributes <em>can</em> be seen in a given phase or context.
            Each match phase type (build-up, transition, set piece, etc.)
            naturally exposes different attributes. Your skills and perks can
            extend this set.
          </InfoCard>
          <InfoCard title="Layer 2 — Accuracy" color="amber">
            How close your perceived value is to the player&apos;s true
            attribute value. Accuracy is governed by your relevant scout skill,
            the context noise multiplier, fatigue, and weather. The closer to
            true, the better your report.
          </InfoCard>
          <InfoCard title="Layer 3 — Confidence" color="blue">
            The uncertainty range around your estimate, e.g. [13–16]. Confidence
            narrows with more observations and higher skills. Wider confidence =
            more uncertainty in your report.
          </InfoCard>
        </div>
        <Para>
          The domain-to-skill mapping is:{" "}
          <Tag color="zinc">technical → Technical Eye</Tag>{" "}
          <Tag color="zinc">physical → Physical Assessment</Tag>{" "}
          <Tag color="zinc">mental/hidden → Psychological Read</Tag>{" "}
          <Tag color="zinc">tactical → Tactical Understanding</Tag>
        </Para>
      </SectionBlock>
    ),
    related: [
      "focus-lenses",
      "match-phases",
      "activity-quality",
      "conviction-levels",
      "weather-effects",
    ],
    tags: [
      "perception",
      "visibility",
      "accuracy",
      "confidence",
      "skills",
      "reading",
    ],
  },

  // ── Conviction Levels ─────────────────────────────────────────────────────
  {
    slug: "conviction-levels",
    title: "Conviction Levels",
    category: "scouting-reports",
    order: 1,
    summary:
      "The four conviction levels (Note through Table Pound) and how they affect your career.",
    searchText:
      "When you write a report you attach a conviction level — how strongly you back the player. Conviction directly affects how seriously clubs treat your recommendation. Note: Worth monitoring in future. Risk: None. Recommend: We should consider this player. Risk: Low. Strong Recommend: Sign this player soon. Risk: Medium. Table Pound: I stake my reputation — sign now. Risk: High (limited per season). What is a Table Pound? The term comes from the tradition of scouts physically banging the table to convince a manager to sign a player. It's your highest conviction level — you're staking your career reputation on this recommendation. Use sparingly. Table Pounds are a scarce resource. Each season you have a limited number. Using one incorrectly damages your reputation significantly. The persuasion scout attribute amplifies the impact of your conviction levels on club transfer decisions.",
    content: (
      <SectionBlock>
        <Para>
          When you write a report you attach a conviction level — how strongly
          you back the player. Conviction directly affects how seriously clubs
          treat your recommendation.
        </Para>
        <Table
          headers={["Level", "Meaning", "Risk"]}
          rows={[
            ["Note", "Worth monitoring in future", "None"],
            ["Recommend", "We should consider this player", "Low"],
            ["Strong Recommend", "Sign this player soon", "Medium"],
            [
              "Table Pound",
              "I stake my reputation \u2014 sign now",
              "High (limited per season)",
            ],
          ]}
        />
        <InfoCard title='What is a "Table Pound"?' color="rose">
          The term comes from the tradition of scouts physically banging the
          table to convince a manager to sign a player. It&apos;s your highest
          conviction level — you&apos;re staking your career reputation on this
          recommendation. Use sparingly.
        </InfoCard>
        <Para>
          Table Pounds are a scarce resource. Each season you have a limited
          number. Using one incorrectly damages your reputation significantly.
          The <Tag color="zinc">persuasion</Tag> scout attribute amplifies the
          impact of your conviction levels on club transfer decisions.
        </Para>
      </SectionBlock>
    ),
    related: [
      "report-quality",
      "reputation",
      "after-submission",
      "your-first-report",
    ],
    tags: [
      "conviction",
      "note",
      "recommend",
      "table pound",
      "persuasion",
      "risk",
    ],
  },

  // ── Report Quality Scoring ────────────────────────────────────────────────
  {
    slug: "report-quality",
    title: "Report Quality Scoring",
    category: "scouting-reports",
    order: 2,
    summary:
      "The five factors that determine report quality and how quality affects reputation and income.",
    searchText:
      "Report quality is calculated from: Total number of attributes assessed. Average confidence across all readings. Accuracy of your attribute estimates vs the player's true values. Whether your conviction level matched the outcome (post-transfer). Equipment bonuses from your active loadout (notebook, video, analysis slots). High-quality reports increase your reputation more and are more likely to influence club decisions. You can also list reports on the marketplace as an independent scout to earn income directly.",
    content: (
      <SectionBlock>
        <Para>Report quality is calculated from:</Para>
        <BulletList
          items={[
            "Total number of attributes assessed",
            "Average confidence across all readings",
            "Accuracy of your attribute estimates vs the player\u2019s true values",
            "Whether your conviction level matched the outcome (post-transfer)",
            "Equipment bonuses from your active loadout (notebook, video, analysis slots)",
          ]}
        />
        <Para>
          High-quality reports increase your reputation more and are more likely
          to influence club decisions. You can also list reports on the
          marketplace as an independent scout to earn income directly.
        </Para>
      </SectionBlock>
    ),
    related: [
      "conviction-levels",
      "reputation",
      "perception-model",
      "after-submission",
      "activity-quality",
    ],
    tags: ["quality", "scoring", "attributes", "confidence", "marketplace"],
  },

  // ── Focus Lenses ──────────────────────────────────────────────────────────
  {
    slug: "focus-lenses",
    title: "Focus Lenses",
    category: "scouting-reports",
    order: 3,
    summary:
      "The five focus lens types and how they narrow attribute reveals while deepening reading quality.",
    searchText:
      "During a live match you can assign a focus lens to any player you are watching. The lens narrows which attributes are revealed in that phase, but significantly deepens the reading quality for attributes in that domain. General: All attributes equally — good for first looks. Technical: First Touch, Passing, Dribbling, Crossing, Shooting, Heading. Physical: Pace, Strength, Stamina, Agility. Mental: Composure, Positioning, Work Rate, Decision Making, Leadership. Tactical: Off the Ball, Pressing, Defensive Awareness. You can only focus one player per phase slot. Choose the lens that targets the attributes most relevant to the position you are assessing.",
    content: (
      <SectionBlock>
        <Para>
          During a live match you can assign a focus lens to any player you are
          watching. The lens narrows which attributes are revealed in that phase,
          but significantly deepens the reading quality for attributes in that
          domain.
        </Para>
        <Table
          headers={["Lens", "Deepens"]}
          rows={[
            ["General", "All attributes equally \u2014 good for first looks"],
            [
              "Technical",
              "First Touch, Passing, Dribbling, Crossing, Shooting, Heading",
            ],
            ["Physical", "Pace, Strength, Stamina, Agility"],
            [
              "Mental",
              "Composure, Positioning, Work Rate, Decision Making, Leadership",
            ],
            ["Tactical", "Off the Ball, Pressing, Defensive Awareness"],
          ]}
        />
        <Para>
          You can only focus one player per phase slot. Choose the lens that
          targets the attributes most relevant to the position you are assessing.
        </Para>
      </SectionBlock>
    ),
    related: [
      "match-phases",
      "perception-model",
      "maximising-observations",
      "your-first-report",
    ],
    tags: [
      "lens",
      "focus",
      "general",
      "technical",
      "physical",
      "mental",
      "tactical",
      "attributes",
    ],
  },

  // ── After Submission ──────────────────────────────────────────────────────
  {
    slug: "after-submission",
    title: "After Submission",
    category: "scouting-reports",
    order: 4,
    summary:
      "What happens after you submit a report: scouting pool, follow-ups, history, and discoveries.",
    searchText:
      "Once submitted, a report enters the club's scouting pool. The club may request a follow-up, make an offer, or take no immediate action. You receive feedback via your inbox after transfer windows resolve. Track outcomes in the Report History screen. Accurate reports that led to successful transfers give you the largest reputation bonuses — and unlock post-transfer tracking in your Discoveries log.",
    content: (
      <SectionBlock>
        <Para>
          Once submitted, a report enters the club&apos;s scouting pool. The
          club may request a follow-up, make an offer, or take no immediate
          action. You receive feedback via your inbox after transfer windows
          resolve.
        </Para>
        <Para>
          Track outcomes in the Report History screen. Accurate reports that led
          to successful transfers give you the largest reputation bonuses — and
          unlock post-transfer tracking in your Discoveries log.
        </Para>
      </SectionBlock>
    ),
    related: [
      "conviction-levels",
      "report-quality",
      "reputation",
      "your-first-report",
    ],
    tags: [
      "submission",
      "scouting pool",
      "follow-up",
      "history",
      "discoveries",
      "transfer",
    ],
  },
];
