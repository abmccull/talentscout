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
      "Week-by-week rhythm: plan your calendar, observe players, file reports, and build your name.",
    searchText:
      "TalentScout runs on a week-by-week calendar. Plan scarce time, gather evidence in different contexts, form a judgment, and file a distinct scouting case. Deliver the recommendation, then live with club decisions and long-term player outcomes. Revisions require new evidence and do not inflate your body of work.",
    content: (
      <SectionBlock>
        <Para>
          TalentScout runs on a week-by-week calendar. Each week you plan your
          schedule, advance time, and watch the results unfold. The weekly
          rhythm is:
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
                Submit and live with the call
              </span>{" "}
              — open a distinct evidence-backed case, deliver it to a decision-maker,
              and build lasting reputation from what happens next.
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
      "Career trust that rises with strong calls and shapes your tier, offers, and credibility.",
    searchText:
      "Reputation is your career currency. It rises when you submit accurate, high-quality reports and falls when your calls miss too often. Your reputation determines which career tier you qualify for, the quality of job offers you receive, how seriously clubs take your conviction, and whether agents and scouts trust you.",
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
      "Writing your first scouting report is TalentScout's core milestone. Observe a player, review uncertain readings, choose conviction, and file one accountable case. Club scouts deliver it internally; independent scouts may list it on the marketplace. The first filing receives modest craft credit, but the meaningful reputation comes from delivery, decisions, and later outcomes. A revision requires new evidence.",
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
          it on the marketplace. The first filing receives modest craft credit;
          revisions need new evidence and do not inflate your output. Check
          Report History to follow the decision and long-term outcome.
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
