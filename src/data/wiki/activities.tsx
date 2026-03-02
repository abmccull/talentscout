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

// ─── Activities ─────────────────────────────────────────────────────────────

export const activitiesArticles: WikiArticle[] = [
  // ── Scouting Activities ───────────────────────────────────────────────────
  {
    slug: "scouting-activities",
    title: "Scouting Activities",
    category: "activities",
    order: 0,
    summary:
      "Full table of all scouting activities with context and noise multipliers, including specialization exclusives.",
    searchText:
      "These activities generate observations of players. Each has a slot cost (days used) and a noise multiplier that affects reading accuracy. Attend Match: Live match. Primary scouting activity. 12-18 phases, each revealing attributes. Watch Video: Video analysis. Lower accuracy than live. Noise x1.5. Good for repeat views. Training Visit: Training ground. Best accuracy (x0.7). Requires access to a club's facilities. Academy Visit: Academy. Good accuracy (x0.8). Unlocked by Youth specialization. Youth Tournament: Youth tournament. Slightly noisy (x1.1). Multiple young players per event. School Match: School match. Noisy (x1.2). For very young unsigned prospects. Grassroots Tournament: Grassroots. Noisy (x1.3). Unlocked by Youth perk Grassroots Access. Street Football: Street. Very noisy (x1.4). Hidden gems only Youth scouts can access. Academy Trial Day: Trial. Good accuracy (x0.9). Formal trial setting for unsigned youth. Youth Festival: Festival. Noisy (x1.2). Multi-team youth tournament event. Follow-Up Session: Follow-up. High accuracy (x0.85). Deepens existing observation. First-Team Exclusive: Reserve Match: Reserve match. Good accuracy (x0.9). Controlled environment. Scouting Mission: Live match. Targeted assignment from a club directive. Opposition Analysis: Live/video. Study upcoming opponents. Slightly noisy (x1.1). Agent Showcase: Showcase. Agents present players. Noisy (x1.2) — players performing under pressure. Trial Match: Trial. Best first-team context (x0.75). Close, controlled observation. Data Scout Exclusive: Database Query: Stats. Pure statistics. Very noisy (x1.8). Supplements live reads. Deep Video Analysis: Video + data. Enhanced video with stats overlay (x1.1). Best video context. Stats Briefing: Data summary. Summary data (x1.6). Limited direct reads. Data Conference: Conference. Networking + data insights. Builds data scout contacts. Algorithm Calibration: Analysis. Improves model accuracy over time. Market Inefficiency: Analysis. Identify undervalued players via statistical anomalies. Analytics Team Meeting: Meeting. Collaborative session with your analyst team.",
    content: (
      <SectionBlock>
        <Para>
          These activities generate observations of players. Each has a slot
          cost (days used) and a noise multiplier that affects reading accuracy.
        </Para>
        <Table
          headers={["Activity", "Context", "Notes"]}
          rows={[
            [
              "Attend Match",
              "Live match",
              "Primary scouting activity. 12\u201318 phases, each revealing attributes.",
            ],
            [
              "Watch Video",
              "Video analysis",
              "Lower accuracy than live. Noise \u00d71.5. Good for repeat views.",
            ],
            [
              "Training Visit",
              "Training ground",
              "Best accuracy (\u00d70.7). Requires access to a club\u2019s facilities.",
            ],
            [
              "Academy Visit",
              "Academy",
              "Good accuracy (\u00d70.8). Unlocked by Youth specialization.",
            ],
            [
              "Youth Tournament",
              "Youth tournament",
              "Slightly noisy (\u00d71.1). Multiple young players per event.",
            ],
            [
              "School Match",
              "School match",
              "Noisy (\u00d71.2). For very young unsigned prospects.",
            ],
            [
              "Grassroots Tournament",
              "Grassroots",
              "Noisy (\u00d71.3). Unlocked by Youth perk \u2018Grassroots Access\u2019.",
            ],
            [
              "Street Football",
              "Street",
              "Very noisy (\u00d71.4). Hidden gems only Youth scouts can access.",
            ],
            [
              "Academy Trial Day",
              "Trial",
              "Good accuracy (\u00d70.9). Formal trial setting for unsigned youth.",
            ],
            [
              "Youth Festival",
              "Festival",
              "Noisy (\u00d71.2). Multi-team youth tournament event.",
            ],
            [
              "Follow-Up Session",
              "Follow-up",
              "High accuracy (\u00d70.85). Deepens existing observation.",
            ],
          ]}
        />
        <Subheading>First-Team Exclusive</Subheading>
        <Table
          headers={["Activity", "Context", "Notes"]}
          rows={[
            [
              "Reserve Match",
              "Reserve match",
              "Good accuracy (\u00d70.9). Controlled environment.",
            ],
            [
              "Scouting Mission",
              "Live match",
              "Targeted assignment from a club directive.",
            ],
            [
              "Opposition Analysis",
              "Live/video",
              "Study upcoming opponents. Slightly noisy (\u00d71.1).",
            ],
            [
              "Agent Showcase",
              "Showcase",
              "Agents present players. Noisy (\u00d71.2) \u2014 players performing under pressure.",
            ],
            [
              "Trial Match",
              "Trial",
              "Best first-team context (\u00d70.75). Close, controlled observation.",
            ],
          ]}
        />
        <Subheading>Data Scout Exclusive</Subheading>
        <Table
          headers={["Activity", "Context", "Notes"]}
          rows={[
            [
              "Database Query",
              "Stats",
              "Pure statistics. Very noisy (\u00d71.8). Supplements live reads.",
            ],
            [
              "Deep Video Analysis",
              "Video + data",
              "Enhanced video with stats overlay (\u00d71.1). Best video context.",
            ],
            [
              "Stats Briefing",
              "Data summary",
              "Summary data (\u00d71.6). Limited direct reads.",
            ],
            [
              "Data Conference",
              "Conference",
              "Networking + data insights. Builds data scout contacts.",
            ],
            [
              "Algorithm Calibration",
              "Analysis",
              "Improves model accuracy over time.",
            ],
            [
              "Market Inefficiency",
              "Analysis",
              "Identify undervalued players via statistical anomalies.",
            ],
            [
              "Analytics Team Meeting",
              "Meeting",
              "Collaborative session with your analyst team.",
            ],
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "networking-admin-activities",
      "activity-quality",
      "specialization-exclusive-activities",
      "match-phases",
      "focus-lenses",
    ],
    tags: [
      "scouting",
      "match",
      "video",
      "training",
      "academy",
      "noise",
      "observation",
    ],
  },

  // ── Networking & Admin Activities ─────────────────────────────────────────
  {
    slug: "networking-admin-activities",
    title: "Networking & Admin Activities",
    category: "activities",
    order: 1,
    summary:
      "All non-scouting activities: network meeting, manager meeting, study, rest, travel, and more.",
    searchText:
      "Network Meeting: 1 slot. Meet a contact to build relationship and share intel. Manager Meeting: 1 slot. Review directives and objectives with your club manager. Board Presentation: 1 slot. Tier 5 only. Present scouting strategy to the board. Assign Territory: 1 slot. Assign or reassign an NPC scout's territory. Write Report: 1 slot. Compile observations into a formal scouting report. Write Placement Report: 1 slot. Youth-specific report for unsigned player placement. Review NPC Report: 1 slot. Review a report from one of your NPC scouts. Study: 1 slot. Personal development. Gains skill or attribute XP. Rest: 1 slot. Recovers fatigue. Essential for maintaining observation quality. Travel: 1-2 slots. Domestic travel to reach fixtures. International Travel: 2 slots. Cross-country travel. Use the International screen to book.",
    content: (
      <SectionBlock>
        <Table
          headers={["Activity", "Slot Cost", "Effect"]}
          rows={[
            [
              "Network Meeting",
              "1 slot",
              "Meet a contact to build relationship and share intel.",
            ],
            [
              "Manager Meeting",
              "1 slot",
              "Review directives and objectives with your club manager.",
            ],
            [
              "Board Presentation",
              "1 slot",
              "Tier 5 only. Present scouting strategy to the board.",
            ],
            [
              "Assign Territory",
              "1 slot",
              "Assign or reassign an NPC scout\u2019s territory.",
            ],
            [
              "Write Report",
              "1 slot",
              "Compile observations into a formal scouting report.",
            ],
            [
              "Write Placement Report",
              "1 slot",
              "Youth-specific report for unsigned player placement.",
            ],
            [
              "Review NPC Report",
              "1 slot",
              "Review a report from one of your NPC scouts.",
            ],
            [
              "Study",
              "1 slot",
              "Personal development. Gains skill or attribute XP.",
            ],
            [
              "Rest",
              "1 slot",
              "Recovers fatigue. Essential for maintaining observation quality.",
            ],
            [
              "Travel",
              "1\u20132 slots",
              "Domestic travel to reach fixtures.",
            ],
            [
              "International Travel",
              "2 slots",
              "Cross-country travel. Use the International screen to book.",
            ],
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "scouting-activities",
      "activity-quality",
      "scheduling-your-week",
      "fatigue",
    ],
    tags: [
      "network",
      "admin",
      "study",
      "rest",
      "travel",
      "report",
      "meeting",
    ],
  },

  // ── Activity Quality ──────────────────────────────────────────────────────
  {
    slug: "activity-quality",
    title: "Activity Quality",
    category: "activities",
    order: 2,
    summary:
      "Quality ratings, what influences quality, and how quality affects your readings.",
    searchText:
      "Each activity resolves with a quality rating (poor, average, good, excellent). Quality is influenced by: Your relevant scout skills for the activity type. Current fatigue level — higher fatigue lowers peak quality. Weather conditions during live matches. Equipment bonuses in your active loadout. Specialization perks that enhance specific contexts. Higher quality activities yield more attribute readings per session and narrower confidence intervals.",
    content: (
      <SectionBlock>
        <Para>
          Each activity resolves with a quality rating (poor, average, good,
          excellent). Quality is influenced by:
        </Para>
        <BulletList
          items={[
            "Your relevant scout skills for the activity type",
            "Current fatigue level \u2014 higher fatigue lowers peak quality",
            "Weather conditions during live matches",
            "Equipment bonuses in your active loadout",
            "Specialization perks that enhance specific contexts",
          ]}
        />
        <Para>
          Higher quality activities yield more attribute readings per session and
          narrower confidence intervals.
        </Para>
      </SectionBlock>
    ),
    related: [
      "scouting-activities",
      "fatigue",
      "weather-effects",
      "perception-model",
    ],
    tags: ["quality", "rating", "poor", "average", "good", "excellent"],
  },

  // ── Specialization-Exclusive Activities ───────────────────────────────────
  {
    slug: "specialization-exclusive-activities",
    title: "Specialization-Exclusive Activities",
    category: "activities",
    order: 3,
    summary:
      "Activities unique to each specialization path: Youth, First Team, Data, and Regional.",
    searchText:
      "Each of the four specialization paths unlocks unique scouting activities that are unavailable to scouts on other paths. These exclusive activities provide access to venues, contexts, and player pools that differentiate your career. Youth Scout Exclusives: Youth specialization scouts gain access to grassroots and youth-focused venues. Academy Visit lets you observe youth players in a structured academy environment with good accuracy. Youth Tournament and Youth Festival expose you to multiple young prospects per event. School Match and Grassroots Tournament reach younger, unsigned players invisible to the mainstream circuit. Street Football offers the noisiest but most hidden talent pool. Academy Trial Day provides a formal trial setting with strong accuracy. First Team Scout Exclusives: First Team scouts access senior-level observation contexts. Reserve Match provides a controlled environment to observe fringe players. Scouting Mission is a targeted assignment from your club's manager. Opposition Analysis covers upcoming opponents via live or video contexts. Agent Showcase lets you see players presented by agents under performance pressure. Trial Match offers the best first-team accuracy in a close, controlled setting. Data Scout Exclusives: Data scouts operate through statistical and analytical lenses. Database Query supplements live reads with pure statistics. Deep Video Analysis combines video with a statistical overlay for the best video-based context. Stats Briefing provides summary data with limited direct reads. Data Conference combines networking with data insights. Algorithm Calibration improves your model accuracy over time. Market Inefficiency identifies undervalued players through statistical anomalies. Analytics Team Meeting is a collaborative session with your analyst team. Regional Expert Exclusives: Regional experts do not unlock entirely new activity types. Instead, their perks enhance existing activities when performed on home soil — providing significant accuracy bonuses, reduced fatigue, and deeper attribute reveals within their region. The Local Network and League Knowledge perks transform standard match attendance and networking into region-powered advantages.",
    content: (
      <SectionBlock>
        <Para>
          Each of the four specialization paths unlocks unique scouting
          activities that are unavailable to scouts on other paths. These
          exclusive activities provide access to venues, contexts, and player
          pools that differentiate your career.
        </Para>

        <Subheading>Youth Scout Exclusives</Subheading>
        <Para>
          Youth specialization scouts gain access to grassroots and
          youth-focused venues. <Tag color="zinc">Academy Visit</Tag> lets you
          observe youth players in a structured academy environment with good
          accuracy. <Tag color="zinc">Youth Tournament</Tag> and{" "}
          <Tag color="zinc">Youth Festival</Tag> expose you to multiple young
          prospects per event. <Tag color="zinc">School Match</Tag> and{" "}
          <Tag color="zinc">Grassroots Tournament</Tag> reach younger, unsigned
          players invisible to the mainstream circuit.{" "}
          <Tag color="zinc">Street Football</Tag> offers the noisiest but most
          hidden talent pool. <Tag color="zinc">Academy Trial Day</Tag> provides
          a formal trial setting with strong accuracy.
        </Para>

        <Subheading>First Team Scout Exclusives</Subheading>
        <Para>
          First Team scouts access senior-level observation contexts.{" "}
          <Tag color="zinc">Reserve Match</Tag> provides a controlled
          environment to observe fringe players.{" "}
          <Tag color="zinc">Scouting Mission</Tag> is a targeted assignment from
          your club&apos;s manager.{" "}
          <Tag color="zinc">Opposition Analysis</Tag> covers upcoming opponents
          via live or video contexts.{" "}
          <Tag color="zinc">Agent Showcase</Tag> lets you see players presented
          by agents under performance pressure.{" "}
          <Tag color="zinc">Trial Match</Tag> offers the best first-team
          accuracy in a close, controlled setting.
        </Para>

        <Subheading>Data Scout Exclusives</Subheading>
        <Para>
          Data scouts operate through statistical and analytical lenses.{" "}
          <Tag color="zinc">Database Query</Tag> supplements live reads with
          pure statistics. <Tag color="zinc">Deep Video Analysis</Tag> combines
          video with a statistical overlay for the best video-based context.{" "}
          <Tag color="zinc">Stats Briefing</Tag> provides summary data with
          limited direct reads. <Tag color="zinc">Data Conference</Tag> combines
          networking with data insights.{" "}
          <Tag color="zinc">Algorithm Calibration</Tag> improves your model
          accuracy over time. <Tag color="zinc">Market Inefficiency</Tag>{" "}
          identifies undervalued players through statistical anomalies.{" "}
          <Tag color="zinc">Analytics Team Meeting</Tag> is a collaborative
          session with your analyst team.
        </Para>

        <Subheading>Regional Expert Exclusives</Subheading>
        <Para>
          Regional experts do not unlock entirely new activity types. Instead,
          their perks enhance existing activities when performed on home soil —
          providing significant accuracy bonuses, reduced fatigue, and deeper
          attribute reveals within their region. The{" "}
          <Tag color="zinc">Local Network</Tag> and{" "}
          <Tag color="zinc">League Knowledge</Tag> perks transform standard
          match attendance and networking into region-powered advantages.
        </Para>
      </SectionBlock>
    ),
    related: [
      "scouting-activities",
      "activity-quality",
      "specialization-depth",
      "the-game-loop",
    ],
    tags: [
      "specialization",
      "youth",
      "first team",
      "data",
      "regional",
      "exclusive",
      "perks",
    ],
  },
];
