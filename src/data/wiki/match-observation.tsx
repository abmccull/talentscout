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

// ─── Match Observation ──────────────────────────────────────────────────────

export const matchObservationArticles: WikiArticle[] = [
  // ── Match Phases ──────────────────────────────────────────────────────────
  {
    slug: "match-phases",
    title: "Match Phases",
    category: "match-observation",
    order: 0,
    summary:
      "The six phase types and the player attributes each naturally reveals during a match.",
    searchText:
      "A match generates 12-18 phases, each representing a distinct passage of play. Each phase type naturally exposes different player attributes. Build-Up: Passing, First Touch, Dribbling, Composure, Positioning, Decision Making. Transition: Pace, Stamina, Agility, Decision Making, Passing, Off the Ball. Set Piece: Heading, Strength, Crossing, Composure, Positioning, Defensive Awareness. Pressing Sequence: Stamina, Work Rate, Pressing, Defensive Awareness, Agility, Decision Making. Counter Attack: Pace, Agility, Dribbling, Shooting, Composure, Off the Ball. Possession: Passing, First Touch, Positioning, Decision Making, Off the Ball, Composure. Within each phase, individual match events (goals, tackles, headers, sprints, etc.) can reveal additional attributes beyond the phase defaults.",
    content: (
      <SectionBlock>
        <Para>
          A match generates 12–18 phases, each representing a distinct passage
          of play. Each phase type naturally exposes different player attributes.
        </Para>
        <Table
          headers={["Phase Type", "Natural Attribute Reveals"]}
          rows={[
            [
              "Build-Up",
              "Passing, First Touch, Dribbling, Composure, Positioning, Decision Making",
            ],
            [
              "Transition",
              "Pace, Stamina, Agility, Decision Making, Passing, Off the Ball",
            ],
            [
              "Set Piece",
              "Heading, Strength, Crossing, Composure, Positioning, Defensive Awareness",
            ],
            [
              "Pressing Sequence",
              "Stamina, Work Rate, Pressing, Defensive Awareness, Agility, Decision Making",
            ],
            [
              "Counter Attack",
              "Pace, Agility, Dribbling, Shooting, Composure, Off the Ball",
            ],
            [
              "Possession",
              "Passing, First Touch, Positioning, Decision Making, Off the Ball, Composure",
            ],
          ]}
        />
        <Para>
          Within each phase, individual match events (goals, tackles, headers,
          sprints, etc.) can reveal additional attributes beyond the phase
          defaults.
        </Para>
      </SectionBlock>
    ),
    related: [
      "focus-lenses",
      "perception-model",
      "weather-effects",
      "maximising-observations",
    ],
    tags: [
      "phase",
      "build-up",
      "transition",
      "set piece",
      "pressing",
      "counter",
      "possession",
      "attributes",
    ],
  },

  // ── Weather Effects on Accuracy ───────────────────────────────────────────
  {
    slug: "weather-effects",
    title: "Weather Effects on Accuracy",
    category: "match-observation",
    order: 1,
    summary:
      "How weather conditions apply noise multipliers to all observations during a match.",
    searchText:
      "Weather conditions add a noise multiplier to all observations made during that match. Always check conditions before attending. Clear: Noise x0.8. Best accuracy — ideal conditions. Cloudy: Noise x1.0. Baseline conditions. Rain: Noise x1.2. Slightly degraded readings. Heavy Rain: Noise x1.6. Significantly degraded readings. Windy: Noise x1.4. Notably degraded readings. Snow: Noise x1.8. Most challenging conditions. In poor weather, prioritise using a tight focus lens on one or two key players rather than trying to watch the whole squad.",
    content: (
      <SectionBlock>
        <Para>
          Weather conditions add a noise multiplier to all observations made
          during that match. Always check conditions before attending.
        </Para>
        <Table
          headers={["Weather", "Noise Multiplier", "Effect"]}
          rows={[
            ["Clear", "\u00d70.8", "Best accuracy \u2014 ideal conditions"],
            ["Cloudy", "\u00d71.0", "Baseline conditions"],
            ["Rain", "\u00d71.2", "Slightly degraded readings"],
            ["Heavy Rain", "\u00d71.6", "Significantly degraded readings"],
            ["Windy", "\u00d71.4", "Notably degraded readings"],
            ["Snow", "\u00d71.8", "Most challenging conditions"],
          ]}
        />
        <Para>
          In poor weather, prioritise using a tight focus lens on one or two key
          players rather than trying to watch the whole squad.
        </Para>
      </SectionBlock>
    ),
    related: [
      "match-phases",
      "activity-quality",
      "fatigue",
      "perception-model",
    ],
    tags: [
      "weather",
      "rain",
      "snow",
      "wind",
      "clear",
      "noise",
      "accuracy",
      "conditions",
    ],
  },

  // ── Maximising Observations ───────────────────────────────────────────────
  {
    slug: "maximising-observations",
    title: "Maximising Observations",
    category: "match-observation",
    order: 2,
    summary:
      "Strategies for building comprehensive player profiles: focus, lens switching, follow-ups, and stacking.",
    searchText:
      "You can only be focused on one player at a time. To build a comprehensive picture of a player across a full match: Select the player before the match begins. Switch focus lens mid-match when a different phase type starts. Return to the same player in a Follow-Up Session to narrow confidence intervals further. Cross-reference with a Video session on the same fixture after the fact. Repeated observations of the same player stack — each session narrows the confidence range toward the true value. Three or more sessions in different contexts (live + video + training) produce the most reliable reports.",
    content: (
      <SectionBlock>
        <Para>
          You can only be focused on one player at a time. To build a
          comprehensive picture of a player across a full match:
        </Para>
        <BulletList
          items={[
            "Select the player before the match begins",
            "Switch focus lens mid-match when a different phase type starts",
            "Return to the same player in a Follow-Up Session to narrow confidence intervals further",
            "Cross-reference with a Video session on the same fixture after the fact",
          ]}
        />
        <Para>
          Repeated observations of the same player stack — each session narrows
          the confidence range toward the true value. Three or more sessions in
          different contexts (live + video + training) produce the most reliable
          reports.
        </Para>
      </SectionBlock>
    ),
    related: [
      "focus-lenses",
      "match-phases",
      "observation-modes",
      "scouting-activities",
    ],
    tags: [
      "observations",
      "stacking",
      "follow-up",
      "video",
      "confidence",
      "focus",
    ],
  },

  // ── Observation Modes ─────────────────────────────────────────────────────
  {
    slug: "observation-modes",
    title: "Observation Modes",
    category: "match-observation",
    order: 3,
    summary:
      "How live match, video, and training visit observations differ in accuracy, reveals, and fatigue cost.",
    searchText:
      "There are three primary contexts in which you can observe players, each with distinct characteristics. Live Match Observation: Attending a match in person is the primary scouting method. You observe 12-18 phases per match, each revealing attributes based on phase type. Live observation uses a baseline noise multiplier modified by weather, fatigue, and equipment. It costs the most fatigue but provides the widest range of attribute reveals and the most realistic view of a player under competitive pressure. Atmosphere, body language, and off-the-ball movement are all visible live. Video Observation: Watching video of a recorded match provides a controlled environment with no weather impact. However, video carries a x1.5 noise multiplier compared to live attendance — you lose peripheral vision, atmosphere cues, and real-time context. Video is lower fatigue than live attendance and allows you to re-watch the same fixture, stacking readings. Deep Video Analysis (Data Scout exclusive) reduces video noise to x1.1 by combining footage with statistical overlays. Training Visit Observation: Visiting a club's training ground is the most accurate observation context, with a x0.7 noise multiplier. Training reveals technical and physical attributes clearly in a controlled, low-pressure environment. However, it requires facility access (often tied to club relationships or the Youth specialization) and does not expose competitive mental attributes like composure under match pressure. Training visits cost moderate fatigue. Combining Modes: The most reliable reports come from observing a player across multiple modes. A live match reveals competitive behaviour, video lets you re-examine specific moments, and training shows technical polish without match pressure. Three or more sessions across different modes produce the narrowest confidence intervals.",
    content: (
      <SectionBlock>
        <Para>
          There are three primary contexts in which you can observe players, each
          with distinct characteristics.
        </Para>

        <Subheading>Live Match Observation</Subheading>
        <Para>
          Attending a match in person is the primary scouting method. You observe
          12–18 phases per match, each revealing attributes based on phase type.
          Live observation uses a baseline noise multiplier modified by weather,
          fatigue, and equipment. It costs the most fatigue but provides the
          widest range of attribute reveals and the most realistic view of a
          player under competitive pressure. Atmosphere, body language, and
          off-the-ball movement are all visible live.
        </Para>

        <Subheading>Video Observation</Subheading>
        <Para>
          Watching video of a recorded match provides a controlled environment
          with no weather impact. However, video carries a{" "}
          <Tag color="zinc">&times;1.5</Tag> noise multiplier compared to live
          attendance — you lose peripheral vision, atmosphere cues, and real-time
          context. Video is lower fatigue than live attendance and allows you to
          re-watch the same fixture, stacking readings.{" "}
          <Tag color="zinc">Deep Video Analysis</Tag> (Data Scout exclusive)
          reduces video noise to <Tag color="zinc">&times;1.1</Tag> by combining
          footage with statistical overlays.
        </Para>

        <Subheading>Training Visit Observation</Subheading>
        <Para>
          Visiting a club&apos;s training ground is the most accurate
          observation context, with a <Tag color="zinc">&times;0.7</Tag> noise
          multiplier. Training reveals technical and physical attributes clearly
          in a controlled, low-pressure environment. However, it requires
          facility access (often tied to club relationships or the Youth
          specialization) and does not expose competitive mental attributes like
          composure under match pressure. Training visits cost moderate fatigue.
        </Para>

        <Subheading>Combining Modes</Subheading>
        <Para>
          The most reliable reports come from observing a player across multiple
          modes. A live match reveals competitive behaviour, video lets you
          re-examine specific moments, and training shows technical polish
          without match pressure. Three or more sessions across different modes
          produce the narrowest confidence intervals.
        </Para>
      </SectionBlock>
    ),
    related: [
      "scouting-activities",
      "maximising-observations",
      "weather-effects",
      "perception-model",
      "fatigue",
    ],
    tags: [
      "live",
      "video",
      "training",
      "observation",
      "mode",
      "noise",
      "accuracy",
      "fatigue",
    ],
  },
];
