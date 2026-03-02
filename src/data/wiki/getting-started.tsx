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

// ─── Getting Started ────────────────────────────────────────────────────────

export const gettingStartedArticles: WikiArticle[] = [
  // ── The Game Loop ─────────────────────────────────────────────────────────
  {
    slug: "the-game-loop",
    title: "The Game Loop",
    category: "getting-started",
    order: 0,
    summary:
      "Week-by-week flow: schedule activities, attend matches, observe players, write reports, and progress your career.",
    searchText:
      "TalentScout runs on a week-by-week calendar. Each week you plan your schedule, advance time, and watch the results unfold. The core loop is: Schedule activities — fill your 7 day-slots with matches, video sessions, network meetings, study, and more. Attend matches — observe players live during match phases, applying focus lenses to gather attribute readings. Observe players — each observation builds a confidence interval around a player's true attributes. Write reports — compile your observations into a formal report with a conviction level. Submit and progress — submitted reports earn reputation, which unlocks higher career tiers, better opportunities, and specialization perks.",
    content: (
      <SectionBlock>
        <Para>
          TalentScout runs on a week-by-week calendar. Each week you plan your
          schedule, advance time, and watch the results unfold. The core loop
          is:
        </Para>
        <NumberedList
          items={[
            <>
              <span className="font-medium text-zinc-200">
                Schedule activities
              </span>{" "}
              — fill your 7 day-slots with matches, video sessions, network
              meetings, study, and more.
            </>,
            <>
              <span className="font-medium text-zinc-200">Attend matches</span>{" "}
              — observe players live during match phases, applying focus lenses
              to gather attribute readings.
            </>,
            <>
              <span className="font-medium text-zinc-200">
                Observe players
              </span>{" "}
              — each observation builds a confidence interval around a
              player&apos;s true attributes.
            </>,
            <>
              <span className="font-medium text-zinc-200">Write reports</span>{" "}
              — compile your observations into a formal report with a conviction
              level.
            </>,
            <>
              <span className="font-medium text-zinc-200">
                Submit and progress
              </span>{" "}
              — submitted reports earn reputation, which unlocks higher career
              tiers, better opportunities, and specialization perks.
            </>,
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "fatigue",
      "reputation",
      "scheduling-your-week",
      "your-first-report",
      "scouting-activities",
    ],
    tags: ["week", "calendar", "schedule", "loop", "basics"],
  },

  // ── Fatigue ───────────────────────────────────────────────────────────────
  {
    slug: "fatigue",
    title: "Fatigue",
    category: "getting-started",
    order: 1,
    summary:
      "Activities cost fatigue; high fatigue degrades observation accuracy. Rest and the endurance attribute help manage it.",
    searchText:
      "Every activity costs fatigue. High fatigue (above ~60) degrades the accuracy of your observations — your readings become noisier and confidence intervals widen. At maximum fatigue you risk missing key moments entirely. Rest activities recover fatigue. The endurance scout attribute reduces how quickly fatigue accumulates. Equipment upgrades in the Travel and Notebook slots can also reduce fatigue for specific activity types. Tip: build at least one rest slot into your week when scouting multiple matches to maintain observation quality.",
    content: (
      <SectionBlock>
        <Para>
          Every activity costs fatigue. High fatigue (above ~60) degrades the
          accuracy of your observations — your readings become noisier and
          confidence intervals widen. At maximum fatigue you risk missing key
          moments entirely.
        </Para>
        <Para>
          Rest activities recover fatigue. The{" "}
          <Tag color="zinc">endurance</Tag> scout attribute reduces how quickly
          fatigue accumulates. Equipment upgrades in the Travel and Notebook
          slots can also reduce fatigue for specific activity types.
        </Para>
        <Para>
          Tip: build at least one rest slot into your week when scouting
          multiple matches to maintain observation quality.
        </Para>
      </SectionBlock>
    ),
    related: [
      "the-game-loop",
      "scheduling-your-week",
      "activity-quality",
      "weather-effects",
    ],
    tags: ["fatigue", "rest", "endurance", "energy", "accuracy"],
  },

  // ── Reputation ────────────────────────────────────────────────────────────
  {
    slug: "reputation",
    title: "Reputation",
    category: "getting-started",
    order: 2,
    summary:
      "Career currency (0-100) that rises with accurate reports and determines your tier, offers, and trust.",
    searchText:
      "Reputation (0-100) is your career currency. It rises when you submit accurate, high-quality reports and falls when reports are inaccurate or your conviction levels are repeatedly wrong. Your reputation determines: Which career tier you qualify for. The quality of job offers you receive. How seriously clubs take your conviction levels. Whether contacted agents and scouts trust you.",
    content: (
      <SectionBlock>
        <Para>
          Reputation (0–100) is your career currency. It rises when you submit
          accurate, high-quality reports and falls when reports are inaccurate or
          your conviction levels are repeatedly wrong. Your reputation
          determines:
        </Para>
        <BulletList
          items={[
            "Which career tier you qualify for",
            "The quality of job offers you receive",
            "How seriously clubs take your conviction levels",
            "Whether contacted agents and scouts trust you",
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "the-game-loop",
      "career-tiers",
      "conviction-levels",
      "report-quality",
      "performance-reviews",
    ],
    tags: ["reputation", "career", "tier", "trust", "accuracy"],
  },

  // ── Scheduling Your Week ──────────────────────────────────────────────────
  {
    slug: "scheduling-your-week",
    title: "Scheduling Your Week",
    category: "getting-started",
    order: 3,
    summary:
      "How to plan your 7 day-slots, balancing scouting versus rest versus admin tasks.",
    searchText:
      "Each week gives you 7 day-slots to fill with activities. The scheduling screen shows a row of slots for each day. Activities consume one or more slots depending on their type. Most scouting and admin activities cost 1 slot. Travel costs 1 slot for domestic and 2 slots for international. You must schedule travel before an away match — it occupies its own slot(s) the day before. Balance is critical. Loading every slot with matches burns through your fatigue fast, degrading observation quality by mid-week. A sustainable pattern for an active scouting week might look like: travel, match, rest, match, video session, write report, study. Rest slots recover fatigue and keep your readings sharp. Admin activities like writing reports and study sessions are low-fatigue and can fill gaps without wearing you down. Network meetings are also light but essential for building contacts. Tip: schedule your highest-priority match early in the week when fatigue is lowest, then use the tail end for lighter tasks. If you are scouting two matches in the same week, slot a rest day between them.",
    content: (
      <SectionBlock>
        <Para>
          Each week gives you 7 day-slots to fill with activities. The
          scheduling screen shows a row of slots for each day. Activities
          consume one or more slots depending on their type.
        </Para>
        <BulletList
          items={[
            "Most scouting and admin activities cost 1 slot.",
            "Travel costs 1 slot for domestic and 2 slots for international.",
            "You must schedule travel before an away match — it occupies its own slot(s) the day before.",
          ]}
        />
        <Subheading>Balancing Your Week</Subheading>
        <Para>
          Balance is critical. Loading every slot with matches burns through
          your fatigue fast, degrading observation quality by mid-week. A
          sustainable pattern for an active scouting week might look like:
        </Para>
        <NumberedList
          items={[
            "Travel",
            "Match",
            "Rest",
            "Match",
            "Video session",
            "Write report",
            "Study",
          ]}
        />
        <Subheading>Tips for an Efficient Week</Subheading>
        <BulletList
          items={[
            "Rest slots recover fatigue and keep your readings sharp.",
            "Admin activities like writing reports and study sessions are low-fatigue and can fill gaps without wearing you down.",
            "Network meetings are also light but essential for building contacts.",
            "Schedule your highest-priority match early in the week when fatigue is lowest, then use the tail end for lighter tasks.",
            "If you are scouting two matches in the same week, slot a rest day between them.",
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "the-game-loop",
      "fatigue",
      "scouting-activities",
      "networking-admin-activities",
    ],
    tags: ["schedule", "planning", "week", "slots", "balance", "travel"],
  },

  // ── Your First Report ─────────────────────────────────────────────────────
  {
    slug: "your-first-report",
    title: "Your First Report",
    category: "getting-started",
    order: 4,
    summary:
      "Step-by-step walkthrough of observing a player and writing your first scouting report.",
    searchText:
      "Writing your first scouting report is the core milestone of TalentScout. Here is how to go from observation to submission. Step 1: Attend a Match. Schedule an Attend Match activity and select a fixture from the available list. Before the match starts you will choose a player to focus on and a focus lens (General is safest for your first time). Step 2: Watch the Phases. The match plays out in 12-18 phases. During each phase your focus lens gathers attribute readings for the player you selected. After each phase you can see preliminary readings appear — these have confidence intervals that show how certain the reading is. Step 3: Review Your Readings. After the match, check the player's profile in the Observations tab. You will see each attribute you observed alongside its confidence range. Wider ranges mean more uncertainty; narrow ranges mean you have a strong read. Step 4: Write the Report. Schedule a Write Report activity in a future day-slot. Select the player, review all your readings, and choose a conviction level. For your first report, Note or Recommend are safe choices — save Strong Recommend and Table Pound until you are confident in your skills. Step 5: Submit. Once the report is written, submit it. If you are on the club path it goes into your club's scouting pool. If independent, you can list it on the marketplace. After submission you earn reputation based on report quality. Check your Report History screen to track outcomes as transfer windows resolve.",
    content: (
      <SectionBlock>
        <Para>
          Writing your first scouting report is the core milestone of
          TalentScout. Here is how to go from observation to submission.
        </Para>
        <Subheading>Step 1: Attend a Match</Subheading>
        <Para>
          Schedule an <Tag color="zinc">Attend Match</Tag> activity and select a
          fixture from the available list. Before the match starts you will
          choose a player to focus on and a focus lens (General is safest for
          your first time).
        </Para>
        <Subheading>Step 2: Watch the Phases</Subheading>
        <Para>
          The match plays out in 12–18 phases. During each phase your focus lens
          gathers attribute readings for the player you selected. After each
          phase you can see preliminary readings appear — these have confidence
          intervals that show how certain the reading is.
        </Para>
        <Subheading>Step 3: Review Your Readings</Subheading>
        <Para>
          After the match, check the player&apos;s profile in the Observations
          tab. You will see each attribute you observed alongside its confidence
          range. Wider ranges mean more uncertainty; narrow ranges mean you have
          a strong read.
        </Para>
        <Subheading>Step 4: Write the Report</Subheading>
        <Para>
          Schedule a <Tag color="zinc">Write Report</Tag> activity in a future
          day-slot. Select the player, review all your readings, and choose a
          conviction level. For your first report,{" "}
          <Tag color="zinc">Note</Tag> or <Tag color="zinc">Recommend</Tag> are
          safe choices — save Strong Recommend and Table Pound until you are
          confident in your skills.
        </Para>
        <Subheading>Step 5: Submit</Subheading>
        <Para>
          Once the report is written, submit it. If you are on the club path it
          goes into your club&apos;s scouting pool. If independent, you can list
          it on the marketplace. After submission you earn reputation based on
          report quality. Check your Report History screen to track outcomes as
          transfer windows resolve.
        </Para>
      </SectionBlock>
    ),
    related: [
      "the-game-loop",
      "conviction-levels",
      "report-quality",
      "focus-lenses",
      "after-submission",
    ],
    tags: [
      "report",
      "first",
      "tutorial",
      "walkthrough",
      "observation",
      "submission",
    ],
  },
];
