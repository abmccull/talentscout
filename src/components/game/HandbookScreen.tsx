"use client";

import { useState, useMemo } from "react";
import { GameLayout } from "./GameLayout";
import {
  Book,
  ChevronDown,
  Search,
  Zap,
  Target,
  TrendingUp,
  Star,
  Users,
  BarChart3,
  Wrench,
  Network,
  GraduationCap,
  Lightbulb,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HandbookSection {
  title: string;
  content: React.ReactNode;
}

interface HandbookChapter {
  id: string;
  title: string;
  icon: LucideIcon;
  sections: HandbookSection[];
}

// ─── Content helpers ──────────────────────────────────────────────────────────

function SectionBlock({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3 text-sm text-zinc-300">{children}</div>;
}

function Subheading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
      {children}
    </h4>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return <p className="leading-relaxed text-zinc-300">{children}</p>;
}

function Tag({ children, color = "zinc" }: { children: React.ReactNode; color?: "emerald" | "amber" | "zinc" | "blue" | "rose" }) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    zinc: "bg-zinc-800 text-zinc-400 border-zinc-700",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    rose: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  };
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800">
            {headers.map((h) => (
              <th key={h} className="pb-1.5 pr-4 text-left font-semibold text-zinc-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-zinc-800/50">
              {row.map((cell, j) => (
                <td key={j} className="py-1.5 pr-4 text-zinc-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PerkCard({
  name,
  level,
  description,
}: {
  name: string;
  level: number;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-semibold text-zinc-200">{name}</span>
        <span className="ml-auto rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
          Lv {level}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-zinc-400">{description}</p>
    </div>
  );
}

// ─── Chapter content definitions ──────────────────────────────────────────────

const CHAPTERS: HandbookChapter[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: Book,
    sections: [
      {
        title: "The Game Loop",
        content: (
          <SectionBlock>
            <Para>
              TalentScout runs on a week-by-week calendar. Each week you plan
              your schedule, advance time, and watch the results unfold. The
              core loop is:
            </Para>
            <ol className="ml-4 list-decimal space-y-1 text-zinc-300">
              <li>
                <span className="font-medium text-zinc-200">Schedule activities</span> — fill your 7 day-slots with matches, video sessions, network meetings, study, and more.
              </li>
              <li>
                <span className="font-medium text-zinc-200">Attend matches</span> — observe players live during match phases, applying focus lenses to gather attribute readings.
              </li>
              <li>
                <span className="font-medium text-zinc-200">Observe players</span> — each observation builds a confidence interval around a player&apos;s true attributes.
              </li>
              <li>
                <span className="font-medium text-zinc-200">Write reports</span> — compile your observations into a formal report with a conviction level.
              </li>
              <li>
                <span className="font-medium text-zinc-200">Submit and progress</span> — submitted reports earn reputation, which unlocks higher career tiers, better opportunities, and specialization perks.
              </li>
            </ol>
          </SectionBlock>
        ),
      },
      {
        title: "Fatigue",
        content: (
          <SectionBlock>
            <Para>
              Every activity costs fatigue. High fatigue (above ~60) degrades
              the accuracy of your observations — your readings become noisier
              and confidence intervals widen. At maximum fatigue you risk
              missing key moments entirely.
            </Para>
            <Para>
              Rest activities recover fatigue. The{" "}
              <Tag color="zinc">endurance</Tag> scout attribute reduces how
              quickly fatigue accumulates. Equipment upgrades in the Travel and
              Notebook slots can also reduce fatigue for specific activity types.
            </Para>
            <Para>
              Tip: build at least one rest slot into your week when scouting
              multiple matches to maintain observation quality.
            </Para>
          </SectionBlock>
        ),
      },
      {
        title: "Reputation",
        content: (
          <SectionBlock>
            <Para>
              Reputation (0–100) is your career currency. It rises when you
              submit accurate, high-quality reports and falls when reports are
              inaccurate or your conviction levels are repeatedly wrong. Your
              reputation determines:
            </Para>
            <ul className="ml-4 list-disc space-y-1 text-zinc-300">
              <li>Which career tier you qualify for</li>
              <li>The quality of job offers you receive</li>
              <li>How seriously clubs take your conviction levels</li>
              <li>Whether contacted agents and scouts trust you</li>
            </ul>
          </SectionBlock>
        ),
      },
    ],
  },
  {
    id: "activities",
    title: "Activities",
    icon: Zap,
    sections: [
      {
        title: "Scouting Activities",
        content: (
          <SectionBlock>
            <Para>
              These activities generate observations of players. Each has a slot
              cost (days used) and a noise multiplier that affects reading
              accuracy.
            </Para>
            <Table
              headers={["Activity", "Context", "Notes"]}
              rows={[
                ["Attend Match", "Live match", "Primary scouting activity. 12–18 phases, each revealing attributes."],
                ["Watch Video", "Video analysis", "Lower accuracy than live. Noise ×1.5. Good for repeat views."],
                ["Training Visit", "Training ground", "Best accuracy (×0.7). Requires access to a club's facilities."],
                ["Academy Visit", "Academy", "Good accuracy (×0.8). Unlocked by Youth specialization."],
                ["Youth Tournament", "Youth tournament", "Slightly noisy (×1.1). Multiple young players per event."],
                ["School Match", "School match", "Noisy (×1.2). For very young unsigned prospects."],
                ["Grassroots Tournament", "Grassroots", "Noisy (×1.3). Unlocked by Youth perk 'Grassroots Access'."],
                ["Street Football", "Street", "Very noisy (×1.4). Hidden gems only Youth scouts can access."],
                ["Academy Trial Day", "Trial", "Good accuracy (×0.9). Formal trial setting for unsigned youth."],
                ["Youth Festival", "Festival", "Noisy (×1.2). Multi-team youth tournament event."],
                ["Follow-Up Session", "Follow-up", "High accuracy (×0.85). Deepens existing observation."],
              ]}
            />
            <Subheading>First-Team Exclusive</Subheading>
            <Table
              headers={["Activity", "Context", "Notes"]}
              rows={[
                ["Reserve Match", "Reserve match", "Good accuracy (×0.9). Controlled environment."],
                ["Scouting Mission", "Live match", "Targeted assignment from a club directive."],
                ["Opposition Analysis", "Live/video", "Study upcoming opponents. Slightly noisy (×1.1)."],
                ["Agent Showcase", "Showcase", "Agents present players. Noisy (×1.2) — players performing under pressure."],
                ["Trial Match", "Trial", "Best first-team context (×0.75). Close, controlled observation."],
              ]}
            />
            <Subheading>Data Scout Exclusive</Subheading>
            <Table
              headers={["Activity", "Context", "Notes"]}
              rows={[
                ["Database Query", "Stats", "Pure statistics. Very noisy (×1.8). Supplements live reads."],
                ["Deep Video Analysis", "Video + data", "Enhanced video with stats overlay (×1.1). Best video context."],
                ["Stats Briefing", "Data summary", "Summary data (×1.6). Limited direct reads."],
                ["Data Conference", "Conference", "Networking + data insights. Builds data scout contacts."],
                ["Algorithm Calibration", "Analysis", "Improves model accuracy over time."],
                ["Market Inefficiency", "Analysis", "Identify undervalued players via statistical anomalies."],
                ["Analytics Team Meeting", "Meeting", "Collaborative session with your analyst team."],
              ]}
            />
          </SectionBlock>
        ),
      },
      {
        title: "Networking & Admin Activities",
        content: (
          <SectionBlock>
            <Table
              headers={["Activity", "Slot Cost", "Effect"]}
              rows={[
                ["Network Meeting", "1 slot", "Meet a contact to build relationship and share intel."],
                ["Manager Meeting", "1 slot", "Review directives and objectives with your club manager."],
                ["Board Presentation", "1 slot", "Tier 5 only. Present scouting strategy to the board."],
                ["Assign Territory", "1 slot", "Assign or reassign an NPC scout's territory."],
                ["Write Report", "1 slot", "Compile observations into a formal scouting report."],
                ["Write Placement Report", "1 slot", "Youth-specific report for unsigned player placement."],
                ["Review NPC Report", "1 slot", "Review a report from one of your NPC scouts."],
                ["Study", "1 slot", "Personal development. Gains skill or attribute XP."],
                ["Rest", "1 slot", "Recovers fatigue. Essential for maintaining observation quality."],
                ["Travel", "1–2 slots", "Domestic travel to reach fixtures."],
                ["International Travel", "2 slots", "Cross-country travel. Use the International screen to book."],
              ]}
            />
          </SectionBlock>
        ),
      },
      {
        title: "Activity Quality",
        content: (
          <SectionBlock>
            <Para>
              Each activity resolves with a quality rating (poor, average, good,
              excellent). Quality is influenced by:
            </Para>
            <ul className="ml-4 list-disc space-y-1 text-zinc-300">
              <li>Your relevant scout skills for the activity type</li>
              <li>Current fatigue level — higher fatigue lowers peak quality</li>
              <li>Weather conditions during live matches</li>
              <li>Equipment bonuses in your active loadout</li>
              <li>Specialization perks that enhance specific contexts</li>
            </ul>
            <Para>
              Higher quality activities yield more attribute readings per
              session and narrower confidence intervals.
            </Para>
          </SectionBlock>
        ),
      },
    ],
  },
  {
    id: "scouting-reports",
    title: "Scouting & Reports",
    icon: Target,
    sections: [
      {
        title: "The Three-Layer Perception Model",
        content: (
          <SectionBlock>
            <Para>
              Every observation you make passes through three layers of
              processing before it becomes a reading:
            </Para>
            <div className="space-y-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <p className="mb-1 text-xs font-semibold text-emerald-400">Layer 1 — Visibility</p>
                <p className="text-xs text-zinc-400">
                  Which attributes <em>can</em> be seen in a given phase or context.
                  Each match phase type (build-up, transition, set piece, etc.)
                  naturally exposes different attributes. Your skills and perks
                  can extend this set.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <p className="mb-1 text-xs font-semibold text-amber-400">Layer 2 — Accuracy</p>
                <p className="text-xs text-zinc-400">
                  How close your perceived value is to the player&apos;s true
                  attribute value. Accuracy is governed by your relevant scout
                  skill, the context noise multiplier, fatigue, and weather.
                  The closer to true, the better your report.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <p className="mb-1 text-xs font-semibold text-blue-400">Layer 3 — Confidence</p>
                <p className="text-xs text-zinc-400">
                  The uncertainty range around your estimate, e.g. [13–16].
                  Confidence narrows with more observations and higher skills.
                  Wider confidence = more uncertainty in your report.
                </p>
              </div>
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
      },
      {
        title: "Conviction Levels",
        content: (
          <SectionBlock>
            <Para>
              When you write a report you attach a conviction level — how
              strongly you back the player. Conviction directly affects how
              seriously clubs treat your recommendation.
            </Para>
            <Table
              headers={["Level", "Meaning", "Risk"]}
              rows={[
                ["Note", "Worth monitoring in future", "None"],
                ["Recommend", "We should consider this player", "Low"],
                ["Strong Recommend", "Sign this player soon", "Medium"],
                ["Table Pound", "I stake my reputation — sign now", "High (limited per season)"],
              ]}
            />
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 mt-2">
              <p className="mb-1 text-xs font-semibold text-rose-400">What is a &ldquo;Table Pound&rdquo;?</p>
              <p className="text-xs text-zinc-400">
                The term comes from the tradition of scouts physically banging the table to convince a manager to sign a player. It&apos;s your highest conviction level — you&apos;re staking your career reputation on this recommendation. Use sparingly.
              </p>
            </div>
            <Para>
              Table Pounds are a scarce resource. Each season you have a limited
              number. Using one incorrectly damages your reputation significantly.
              The <Tag color="zinc">persuasion</Tag> scout attribute amplifies
              the impact of your conviction levels on club transfer decisions.
            </Para>
          </SectionBlock>
        ),
      },
      {
        title: "Report Quality Scoring",
        content: (
          <SectionBlock>
            <Para>
              Report quality is calculated from:
            </Para>
            <ul className="ml-4 list-disc space-y-1 text-zinc-300">
              <li>Total number of attributes assessed</li>
              <li>Average confidence across all readings</li>
              <li>Accuracy of your attribute estimates vs the player&apos;s true values</li>
              <li>Whether your conviction level matched the outcome (post-transfer)</li>
              <li>Equipment bonuses from your active loadout (notebook, video, analysis slots)</li>
            </ul>
            <Para>
              High-quality reports increase your reputation more and are more
              likely to influence club decisions. You can also list reports on
              the marketplace as an independent scout to earn income directly.
            </Para>
          </SectionBlock>
        ),
      },
      {
        title: "Focus Lenses",
        content: (
          <SectionBlock>
            <Para>
              During a live match you can assign a focus lens to any player you
              are watching. The lens narrows which attributes are revealed in
              that phase, but significantly deepens the reading quality for
              attributes in that domain.
            </Para>
            <Table
              headers={["Lens", "Deepens"]}
              rows={[
                ["General", "All attributes equally — good for first looks"],
                ["Technical", "First Touch, Passing, Dribbling, Crossing, Shooting, Heading"],
                ["Physical", "Pace, Strength, Stamina, Agility"],
                ["Mental", "Composure, Positioning, Work Rate, Decision Making, Leadership"],
                ["Tactical", "Off the Ball, Pressing, Defensive Awareness"],
              ]}
            />
            <Para>
              You can only focus one player per phase slot. Choose the lens that
              targets the attributes most relevant to the position you are
              assessing.
            </Para>
          </SectionBlock>
        ),
      },
      {
        title: "After Submission",
        content: (
          <SectionBlock>
            <Para>
              Once submitted, a report enters the club&apos;s scouting pool.
              The club may request a follow-up, make an offer, or take no
              immediate action. You receive feedback via your inbox after
              transfer windows resolve.
            </Para>
            <Para>
              Track outcomes in the Report History screen. Accurate reports that
              led to successful transfers give you the largest reputation
              bonuses — and unlock post-transfer tracking in your Discoveries
              log.
            </Para>
          </SectionBlock>
        ),
      },
    ],
  },
  {
    id: "match-observation",
    title: "Match Observation",
    icon: Star,
    sections: [
      {
        title: "Match Phases",
        content: (
          <SectionBlock>
            <Para>
              A match generates 12–18 phases, each representing a distinct
              passage of play. Each phase type naturally exposes different
              player attributes.
            </Para>
            <Table
              headers={["Phase Type", "Natural Attribute Reveals"]}
              rows={[
                ["Build-Up", "Passing, First Touch, Dribbling, Composure, Positioning, Decision Making"],
                ["Transition", "Pace, Stamina, Agility, Decision Making, Passing, Off the Ball"],
                ["Set Piece", "Heading, Strength, Crossing, Composure, Positioning, Defensive Awareness"],
                ["Pressing Sequence", "Stamina, Work Rate, Pressing, Defensive Awareness, Agility, Decision Making"],
                ["Counter Attack", "Pace, Agility, Dribbling, Shooting, Composure, Off the Ball"],
                ["Possession", "Passing, First Touch, Positioning, Decision Making, Off the Ball, Composure"],
              ]}
            />
            <Para>
              Within each phase, individual match events (goals, tackles,
              headers, sprints, etc.) can reveal additional attributes beyond
              the phase defaults.
            </Para>
          </SectionBlock>
        ),
      },
      {
        title: "Weather Effects on Accuracy",
        content: (
          <SectionBlock>
            <Para>
              Weather conditions add a noise multiplier to all observations
              made during that match. Always check conditions before attending.
            </Para>
            <Table
              headers={["Weather", "Noise Multiplier", "Effect"]}
              rows={[
                ["Clear", "×0.8", "Best accuracy — ideal conditions"],
                ["Cloudy", "×1.0", "Baseline conditions"],
                ["Rain", "×1.2", "Slightly degraded readings"],
                ["Heavy Rain", "×1.6", "Significantly degraded readings"],
                ["Windy", "×1.4", "Notably degraded readings"],
                ["Snow", "×1.8", "Most challenging conditions"],
              ]}
            />
            <Para>
              In poor weather, prioritise using a tight focus lens on one or two
              key players rather than trying to watch the whole squad.
            </Para>
          </SectionBlock>
        ),
      },
      {
        title: "Maximising Observations",
        content: (
          <SectionBlock>
            <Para>
              You can only be focused on one player at a time. To build a
              comprehensive picture of a player across a full match:
            </Para>
            <ul className="ml-4 list-disc space-y-1 text-zinc-300">
              <li>Select the player before the match begins</li>
              <li>Switch focus lens mid-match when a different phase type starts</li>
              <li>Return to the same player in a Follow-Up Session to narrow confidence intervals further</li>
              <li>Cross-reference with a Video session on the same fixture after the fact</li>
            </ul>
            <Para>
              Repeated observations of the same player stack — each session
              narrows the confidence range toward the true value. Three or more
              sessions in different contexts (live + video + training) produce
              the most reliable reports.
            </Para>
          </SectionBlock>
        ),
      },
    ],
  },
  {
    id: "career",
    title: "Career Progression",
    icon: TrendingUp,
    sections: [
      {
        title: "Career Tiers",
        content: (
          <SectionBlock>
            <Table
              headers={["Tier", "Title", "Characteristics"]}
              rows={[
                ["1", "Freelance Scout", "Self-employed. No club retainer. Must sell reports on the open market or take club commissions."],
                ["2", "Part-Time Regional Scout", "Contracted to one club for a defined region. Limited salary but growing reputation."],
                ["3", "Full-Time Club Scout", "Core scouting staff. Regular directives from the manager, full salary, performance reviews."],
                ["4", "Head of Scouting", "Manages NPC scouts, assigns territories, responsible for club-wide scouting strategy."],
                ["5", "Director of Football", "Top role. Board presentations, strategic transfer influence, global network."],
              ]}
            />
          </SectionBlock>
        ),
      },
      {
        title: "Career Paths",
        content: (
          <SectionBlock>
            <Para>
              From tier 3 onward you can choose between two career paths:
            </Para>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <p className="mb-1 text-xs font-semibold text-emerald-400">Club Path</p>
                <p className="text-xs text-zinc-400">
                  Climb the club hierarchy from scout to Head of Scouting to
                  Director of Football. Stable salary, manager directives,
                  performance reviews, and potential job offers from rival clubs.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <p className="mb-1 text-xs font-semibold text-amber-400">Independent Path</p>
                <p className="text-xs text-zinc-400">
                  Run your own scouting agency. Sell reports on the marketplace,
                  take retainer contracts from clubs, hire employees, upgrade
                  your office, and build a business. Higher earning potential
                  but less stability.
                </p>
              </div>
            </div>
          </SectionBlock>
        ),
      },
      {
        title: "Performance Reviews",
        content: (
          <SectionBlock>
            <Para>
              At the end of each season (club path) your manager evaluates your
              performance against set directives. Reviews measure:
            </Para>
            <ul className="ml-4 list-disc space-y-1 text-zinc-300">
              <li>Number of reports submitted vs target</li>
              <li>Report accuracy and quality scores</li>
              <li>How many directives were fulfilled</li>
              <li>Whether any Table Pounds were justified</li>
            </ul>
            <Para>
              A strong review accelerates reputation growth and can fast-track
              a tier promotion. A poor review may lead to a contract review or
              job loss.
            </Para>
          </SectionBlock>
        ),
      },
      {
        title: "Specialization Level",
        content: (
          <SectionBlock>
            <Para>
              Your primary specialization has a depth level (1–20). It
              increases as you perform activities aligned with your
              specialization. Higher levels:
            </Para>
            <ul className="ml-4 list-disc space-y-1 text-zinc-300">
              <li>Unlock new perks in your specialization tree</li>
              <li>Provide a passive accuracy bonus on all readings (+1% reduction in error per level above 1)</li>
              <li>Increase your credibility in job applications</li>
            </ul>
            <Para>
              At tier 4+ you can unlock a secondary specialization, which gives
              access to the first few perks of a second tree.
            </Para>
          </SectionBlock>
        ),
      },
    ],
  },
  {
    id: "specializations",
    title: "Specializations",
    icon: Star,
    sections: [
      {
        title: "Youth Scout",
        content: (
          <SectionBlock>
            <Para>
              Focuses on players under 21. Better at reading potential ability
              over current ability. Unlocks grassroots venues and unsigned youth
              scouting circuits invisible to other specializations.
            </Para>
            <div className="space-y-2">
              <PerkCard
                name="Grassroots Access"
                level={1}
                description="Opens doors to street football sessions and grassroots tournaments. Discover unsigned youth in venues hidden from the mainstream scouting circuit."
              />
              <PerkCard
                name="Raw Potential Reading"
                level={3}
                description="Years of watching rough diamonds gives an instinctive sense of ceilings. Unlocks a rough potential ability range indicator on unsigned youth."
              />
              <PerkCard
                name="Instinct Sharpening"
                level={5}
                description="Your gut reactions to young talent are sharper than most. Gut feeling trigger rate increased by 40% when observing players under 16."
              />
              <PerkCard
                name="Youth Network"
                level={7}
                description="Your contacts begin sharing intel about unsigned youth sightings. Network meetings occasionally reveal hidden talents in the region."
              />
              <PerkCard
                name="Placement Reputation"
                level={9}
                description="Clubs trust your recommendations. Placement acceptance rate increases by 25% across all conviction levels."
              />
              <PerkCard
                name="Wonderkid Radar"
                level={12}
                description="Your pattern recognition for generational talent is razor-sharp. Auto-alert when observing an under-16 with generational potential markers."
              />
              <PerkCard
                name="Academy Whisperer"
                level={15}
                description="Your reputation opens private academy doors. You can request clubs to hold dedicated trial days for your recommended youth."
              />
              <PerkCard
                name="Generational Eye"
                level={18}
                description="The pinnacle of youth scouting intuition. Gut feelings now include a PA estimate within ±5 of the true value."
              />
            </div>
          </SectionBlock>
        ),
      },
      {
        title: "First Team Scout",
        content: (
          <SectionBlock>
            <Para>
              Focuses on ready-now senior players. Better at current ability
              accuracy and transfer market valuation. Unlocks agent showcase
              events and trial match observation.
            </Para>
            <div className="space-y-2">
              <PerkCard
                name="System Fit Analysis"
                level={1}
                description="Assess how well a player's movement and decision-making patterns match your club's tactical shape. Observations include a system-compatibility indicator alongside standard readings."
              />
              <PerkCard
                name="Form vs Ability"
                level={3}
                description="Distinguish between a player riding a hot streak and one whose underlying ability is genuinely elite. Unlocks a form-adjusted reading that separates current peak from long-term level."
              />
              <PerkCard
                name="Opposition Context Correction"
                level={5}
                description="Watching players against weak opposition no longer artificially inflates readings. Your assessments apply a quality-of-opposition adjustment."
              />
              <PerkCard
                name="Transfer Market Sense"
                level={8}
                description="Seasons spent tracking senior players gives an instinctive feel for fair value. Market valuation estimates carry significantly tighter error margins."
              />
              <PerkCard
                name="Adaptation Prediction"
                level={12}
                description="Predict how well a player will settle into a new league, club culture, or tactical demand. Unlock an adaptation-risk score on every report for players moving between leagues."
              />
              <PerkCard
                name="Conviction Commander"
                level={15}
                description="Your reputation for backing the right players is impeccable. Every conviction level you attach to a report now carries 50% more persuasive weight in the boardroom."
              />
              <PerkCard
                name="Transfer Kingmaker"
                level={18}
                description="At this level your word carries real institutional weight. Direct lobbying, targeted briefings, and relationship leverage give you meaningful influence over whether a club pursues a transfer."
              />
            </div>
          </SectionBlock>
        ),
      },
      {
        title: "Regional Expert",
        content: (
          <SectionBlock>
            <Para>
              Deep knowledge of one geographic territory. Better accuracy on
              home soil, faster contact relationship building, and the ability
              to create long-term player pipelines from a specific region.
            </Para>
            <div className="space-y-2">
              <PerkCard
                name="Local Network"
                level={1}
                description="Deep roots in your region mean contacts trust you faster. Meetings with regional scouts and journalists yield enhanced relationship gains and more candid intelligence."
              />
              <PerkCard
                name="League Knowledge"
                level={3}
                description="You know the playing styles, tactical tendencies, and quality variance of every club in your region intimately. Attribute readings from regional matches carry a 15% accuracy bonus."
              />
              <PerkCard
                name="Hidden Gem Finder"
                level={5}
                description="Lower leagues hide players no-one else is watching. Your thorough regional coverage reveals additional layers of mental and tactical attributes on players outside the top two tiers."
              />
              <PerkCard
                name="Cultural Translator"
                level={8}
                description="Understanding regional culture, language, and football philosophy lets you build bridges between players and new clubs. Agent contacts in your region yield substantially richer intel."
              />
              <PerkCard
                name="Pipeline Builder"
                level={12}
                description="Establish a formal talent pipeline from your region. Receive alerts when contracted players in your territory enter their final contract year or become available for loan."
              />
              <PerkCard
                name="Territory Mastery"
                level={15}
                description="You know your home region as well as anyone alive. Observations made on home soil carry a 70% accuracy bonus, narrowing confidence intervals to near-certainty."
              />
              <PerkCard
                name="Hidden Attribute Revealer"
                level={18}
                description="Years of intimate knowledge of players in your territory means Consistency and Professionalism are no longer hidden to you — you read them directly from sustained observation."
              />
            </div>
          </SectionBlock>
        ),
      },
      {
        title: "Data Scout",
        content: (
          <SectionBlock>
            <Para>
              Statistical analysis specialist. Unlocks data overlays on
              reports, advanced metrics, and automated anomaly detection.
              Less dependent on live observation than other paths.
            </Para>
            <div className="space-y-2">
              <PerkCard
                name="Statistical Baseline"
                level={1}
                description="Access to league-wide per-90 benchmarks lets you contextualise raw output numbers. Attribute readings gain a statistical confidence score drawn from data rather than pure observation."
              />
              <PerkCard
                name="Performance Modelling"
                level={3}
                description="A proprietary model blends observed attributes with underlying statistical profiles. All attribute confidence ranges narrow by 20% when sufficient data coverage is available."
              />
              <PerkCard
                name="Anomaly Detection"
                level={5}
                description="Flags players whose statistical output is significantly higher or lower than their observed attribute profile would predict — surfacing hidden gems and overrated names alike."
              />
              <PerkCard
                name="Video Efficiency Protocol"
                level={8}
                description="Systematic clip tagging and frame-by-frame review extracts more signal from footage than a standard viewing session. Video observations now yield attribute readings comparable to a live visit."
              />
              <PerkCard
                name="xG Chain Analysis"
                level={12}
                description="Decompose expected-goals chains to assess each player's contribution to attack creation and defensive disruption. Unlocks advanced shot-creation and pressing-intensity metrics on reports."
              />
              <PerkCard
                name="Predictive Analytics"
                level={15}
                description="When data coverage is rich enough, your models move from descriptive to predictive. Attribute confidence intervals tighten by 65% on players with high data coverage."
              />
              <PerkCard
                name="Neural Scout Network"
                level={18}
                description="Your pattern-matching systems now operate across the entire dataset simultaneously. Receive automated alerts whenever a cross-league statistical pattern matches a profile associated with breakout talent."
              />
            </div>
          </SectionBlock>
        ),
      },
    ],
  },
  {
    id: "equipment",
    title: "Equipment & Tools",
    icon: Wrench,
    sections: [
      {
        title: "Equipment Slots",
        content: (
          <SectionBlock>
            <Para>
              Your loadout has five equipment slots. Each slot has tiered items
              (Tier 1–4) and one specialization-specific item. You can only
              equip one item per slot at a time, but you can own multiple and
              swap between them.
            </Para>
            <Table
              headers={["Slot", "Governs"]}
              rows={[
                ["Notebook", "Observation confidence and attributes captured per session"],
                ["Video", "Video analysis confidence and report quality"],
                ["Travel", "Fatigue from travel and match attendance, travel cost reduction"],
                ["Network", "Relationship gain from meetings, intel reliability"],
                ["Analysis", "Data accuracy, youth discovery bonus, anomaly detection"],
              ]}
            />
          </SectionBlock>
        ),
      },
      {
        title: "Notebook Slot",
        content: (
          <SectionBlock>
            <Table
              headers={["Item", "Tier", "Key Bonuses"]}
              rows={[
                ["Spiral Notepad", "T1", "Free — baseline"],
                ["Leather Scout's Journal", "T2", "+3% observation confidence"],
                ["Tablet with Match Notes App", "T3", "+6% confidence, +1 attribute/session"],
                ["Professional Scouting Tablet", "T4", "+10% confidence, +2 attributes/session, -1 fatigue (matches)"],
                ["Grassroots Scouting Journal (Youth)", "Spec", "+4% confidence, +20% gut feeling, reduced youth activity fatigue"],
              ]}
            />
          </SectionBlock>
        ),
      },
      {
        title: "Video Slot",
        content: (
          <SectionBlock>
            <Table
              headers={["Item", "Tier", "Key Bonuses"]}
              rows={[
                ["Basic Laptop", "T1", "Free — baseline"],
                ["Match Replay Subscription", "T2", "+4% video confidence"],
                ["Multi-Angle Video Suite", "T3", "+8% video confidence, +5% report quality"],
                ["Professional Editing Bay", "T4", "+12% video confidence, +10% report quality, -1 fatigue (writing)"],
                ["Tactical Board Pro (First Team)", "Spec", "+10% video confidence, +15% system fit accuracy"],
                ["Statistical Video Overlay (Data)", "Spec", "+10% deep video confidence, +10% data accuracy"],
              ]}
            />
          </SectionBlock>
        ),
      },
      {
        title: "Travel, Network & Analysis Slots",
        content: (
          <SectionBlock>
            <Subheading>Travel Slot</Subheading>
            <Table
              headers={["Item", "Tier", "Key Bonuses"]}
              rows={[
                ["Public Transport Pass", "T1", "Free — baseline"],
                ["Scout's Car", "T2", "-2 fatigue (travel/matches), -10% travel cost"],
                ["Business Travel Account", "T3", "-4 fatigue, -20% travel cost, -1 travel slot"],
                ["Premium Travel Package", "T4", "-6 fatigue, -30% cost, -1 slot, +5 familiarity gain"],
                ["Regional Routes Optimizer (Regional)", "Spec", "-5 fatigue at home, -25% cost at home, +10 familiarity gain"],
              ]}
            />
            <Subheading>Network Slot</Subheading>
            <Table
              headers={["Item", "Tier", "Key Bonuses"]}
              rows={[
                ["Personal Phone", "T1", "Free — baseline"],
                ["Contacts Spreadsheet", "T2", "+5% relationship gain"],
                ["Scout CRM Subscription", "T3", "+10% relationship gain, +10% intel reliability, -1 fatigue (meetings)"],
                ["Industry Networking Suite", "T4", "+15% relationship gain, +20% intel reliability, -2 fatigue (meetings)"],
                ["Agent Relationship Manager (First Team)", "Spec", "+12% relationship gain, +15% valuation accuracy"],
                ["Local Intelligence Network (Regional)", "Spec", "+12% relationship gain at home, +25% intel reliability at home"],
              ]}
            />
            <Subheading>Analysis Slot</Subheading>
            <Table
              headers={["Item", "Tier", "Key Bonuses"]}
              rows={[
                ["Pen & Paper Stats", "T1", "Free — baseline"],
                ["Spreadsheet Templates", "T2", "+5% data accuracy"],
                ["Statistical Database Access", "T3", "+10% data accuracy, +10% youth discovery, +5% report quality"],
                ["Advanced Analytics Platform", "T4", "Full suite of data bonuses including anomaly detection and prediction accuracy"],
              ]}
            />
          </SectionBlock>
        ),
      },
      {
        title: "Tools (Unlockables)",
        content: (
          <SectionBlock>
            <Para>
              Tools are one-time unlocks that provide persistent bonuses.
              Unlike equipment they are not swappable — once unlocked they are
              always active. Tools are unlocked via career progression milestones
              and are displayed in your Career screen.
            </Para>
            <Para>
              Check the Career screen&apos;s Tools panel to see which tools are
              available at your current tier and what each one provides.
            </Para>
          </SectionBlock>
        ),
      },
    ],
  },
  {
    id: "contacts",
    title: "Contacts & Network",
    icon: Network,
    sections: [
      {
        title: "Contact Types",
        content: (
          <SectionBlock>
            <Para>
              Your network is built from contacts of different types. Each type
              provides different categories of intelligence.
            </Para>
            <Table
              headers={["Type", "Intel Provided"]}
              rows={[
                ["Agent", "Transfer availability, wage demands, player ambitions"],
                ["Scout", "Cross-region leads, secondary opinions on players"],
                ["Club Staff", "Training ground access, injury news, morale information"],
                ["Journalist", "Transfer rumours, club finance news, squad dynamics"],
                ["Academy Coach", "Youth talent tips, development progress, unsigned prospects"],
                ["Sporting Director", "Club transfer priorities, budget information, shortlist intel"],
                ["Grassroots Organizer", "Unsigned youth sightings, local tournament schedules"],
                ["School Coach", "Very young prospects (under 14), community talent leads"],
                ["Youth Agent", "Unsigned youth with representation, early PA hints"],
                ["Academy Director", "Formal youth intake information, trial day access"],
                ["Local Scout", "Regional coverage in areas you cannot personally attend"],
              ]}
            />
          </SectionBlock>
        ),
      },
      {
        title: "Relationship Building",
        content: (
          <SectionBlock>
            <Para>
              Each contact has a relationship score (0–100). Higher relationship
              means more candid intel and willingness to share sensitive
              information. Relationships are built through:
            </Para>
            <ul className="ml-4 list-disc space-y-1 text-zinc-300">
              <li>Network Meeting activities</li>
              <li>Providing useful intel back to the contact</li>
              <li>Acting on tips they provide (following up with visits)</li>
              <li>Specialization perks (e.g. Regional Expert&apos;s Local Network perk)</li>
              <li>Network equipment bonuses</li>
            </ul>
            <Para>
              Relationships decay slowly over time if you do not maintain them.
              The <Tag color="zinc">networking</Tag> scout attribute speeds up
              relationship gain per meeting.
            </Para>
          </SectionBlock>
        ),
      },
      {
        title: "Intel Reliability",
        content: (
          <SectionBlock>
            <Para>
              Each contact also has a hidden reliability rating (0–100) that
              you discover over time. High-reliability contacts share accurate
              intel. Low-reliability contacts may pass on rumours or
              deliberately misleading information.
            </Para>
            <Para>
              Reliability is revealed gradually through repeated interactions —
              when a contact&apos;s tip proves accurate after you follow it up,
              their reliability estimate improves. Network equipment and the
              Scout CRM subscription boost intel reliability across all contacts.
            </Para>
          </SectionBlock>
        ),
      },
    ],
  },
  {
    id: "youth",
    title: "Youth Scouting",
    icon: GraduationCap,
    sections: [
      {
        title: "Unsigned Youth",
        content: (
          <SectionBlock>
            <Para>
              Youth scouting focuses on players not yet signed to a professional
              academy. These players appear in grassroots venues, school
              matches, youth tournaments, and festivals — most of which are only
              accessible to scouts with the Youth specialization.
            </Para>
            <Para>
              Unsigned youth appear in the Youth Scouting screen. Each has a
              scouting status (unobserved, partially observed, fully assessed)
              and, if you have sufficient observations, a placement report can
              be written.
            </Para>
          </SectionBlock>
        ),
      },
      {
        title: "Placement Reports",
        content: (
          <SectionBlock>
            <Para>
              Instead of a standard scouting report, unsigned youth receive a
              Placement Report — a recommendation to a specific club academy.
              The placement report contains:
            </Para>
            <ul className="ml-4 list-disc space-y-1 text-zinc-300">
              <li>Your attribute assessments (with confidence ranges)</li>
              <li>Your estimated potential ability range</li>
              <li>A conviction level matching standard report conventions</li>
              <li>A target academy recommendation</li>
            </ul>
            <Para>
              The club considers your conviction level, your reputation, the
              player&apos;s observed quality, and your specialization perks when
              deciding whether to offer a trial. The{" "}
              <Tag color="zinc">Placement Reputation</Tag> perk at level 9
              increases acceptance rates by 25%.
            </Para>
          </SectionBlock>
        ),
      },
      {
        title: "Alumni Tracking",
        content: (
          <SectionBlock>
            <Para>
              Players you have placed in academies become part of your alumni
              network. The Alumni Dashboard tracks their development over
              subsequent seasons, letting you see how accurate your potential
              assessments were.
            </Para>
            <Para>
              High-accuracy alumni placements that develop into quality
              professionals are a major source of long-term reputation gains
              and are counted in your career Discoveries log.
            </Para>
          </SectionBlock>
        ),
      },
      {
        title: "Youth-Specific Activities",
        content: (
          <SectionBlock>
            <Table
              headers={["Activity", "Access", "Notes"]}
              rows={[
                ["School Match", "All scouts", "Very young prospects. High noise (×1.2)."],
                ["Grassroots Tournament", "Youth perk", "Multi-player events in community venues. Noise ×1.3."],
                ["Street Football", "Youth perk", "Hidden gems off the official circuit. Noise ×1.4."],
                ["Academy Trial Day", "Youth perk (Lv 15)", "Formal club-sponsored trial. Good accuracy (×0.9)."],
                ["Youth Festival", "All scouts", "Multi-team youth competition. Noise ×1.2."],
                ["Parent/Coach Meeting", "Youth scouts", "Supplementary intel. Very noisy (×2.0) — useful for character reads only."],
              ]}
            />
          </SectionBlock>
        ),
      },
    ],
  },
  {
    id: "tips",
    title: "Match Observation Tips",
    icon: Lightbulb,
    sections: [
      {
        title: "Choosing the Right Lens",
        content: (
          <SectionBlock>
            <Para>
              Match lens selection is the single biggest decision in live
              scouting. A few guiding principles:
            </Para>
            <ul className="ml-4 list-disc space-y-1 text-zinc-300">
              <li>
                <span className="font-medium text-zinc-200">First-time watch:</span> Use General. Get a broad overview before committing to a deep read on any domain.
              </li>
              <li>
                <span className="font-medium text-zinc-200">Assessing a striker:</span> Physical in transitions and counter-attacks; Technical in build-up and set pieces.
              </li>
              <li>
                <span className="font-medium text-zinc-200">Assessing a midfielder:</span> Tactical during pressing phases; Mental in possession and build-up.
              </li>
              <li>
                <span className="font-medium text-zinc-200">Assessing a defender:</span> Physical during counter-attacks; Tactical during pressing and set pieces.
              </li>
              <li>
                <span className="font-medium text-zinc-200">Checking hidden attributes:</span> Watch for leadership events and errors to get Composure and Decision Making reads. Consistency and Professionalism require multiple sessions over different matches.
              </li>
            </ul>
          </SectionBlock>
        ),
      },
      {
        title: "Phase Matching",
        content: (
          <SectionBlock>
            <Para>
              Different phase types expose different things. Watch for the phase
              type indicator and switch your lens to match:
            </Para>
            <Table
              headers={["If you want to see…", "Wait for this phase"]}
              rows={[
                ["Pace, Stamina, Agility", "Transition or Counter Attack"],
                ["Heading, Strength", "Set Piece"],
                ["Passing, First Touch", "Build-Up or Possession"],
                ["Pressing, Defensive Awareness", "Pressing Sequence"],
                ["Decision Making, Composure", "Any phase — revealed by errors and assists"],
                ["Off the Ball, Positioning", "Possession or Transition"],
              ]}
            />
          </SectionBlock>
        ),
      },
      {
        title: "Building Conviction",
        content: (
          <SectionBlock>
            <Para>
              Never submit a report with a strong conviction level based on a
              single session. The three-observation rule is a safe baseline:
            </Para>
            <ul className="ml-4 list-disc space-y-1 text-zinc-300">
              <li>
                <Tag color="zinc">Note</Tag> — One session, wide confidence ranges, limited phase coverage
              </li>
              <li>
                <Tag color="zinc">Recommend</Tag> — Two to three sessions, multiple phase types seen
              </li>
              <li>
                <Tag color="amber">Strong Recommend</Tag> — Three or more sessions across different contexts, confidence intervals narrowed
              </li>
              <li>
                <Tag color="rose">Table Pound</Tag> — Five or more sessions, training visit if possible, near-certainty on key attributes. (Named for the tradition of scouts banging the table to convince the manager — your strongest possible recommendation.)
              </li>
            </ul>
            <Para>
              A Table Pound with insufficient observation depth is the fastest
              way to destroy your reputation. Clubs remember wrong calls.
            </Para>
          </SectionBlock>
        ),
      },
      {
        title: "Reading Between the Lines",
        content: (
          <SectionBlock>
            <Para>
              Some of the most valuable information is not in the attribute
              readings themselves:
            </Para>
            <ul className="ml-4 list-disc space-y-1 text-zinc-300">
              <li>
                A player with high technical readings but poor form indicators
                may be in a temporary slump — check for the Form vs Ability perk
                if you are a First Team scout.
              </li>
              <li>
                A player performing well against weak opposition gets an inflated
                reading — adjust your conviction accordingly unless you have the
                Opposition Context Correction perk.
              </li>
              <li>
                Check your contact network for character information —
                Professionalism and Consistency are hidden attributes that only
                emerge through sustained observation or contact tips.
              </li>
              <li>
                Young players (under 18) have volatile development curves.
                A low current ability with a wide PA range may be more valuable
                than a slightly higher but ceiling-capped older prospect.
              </li>
            </ul>
          </SectionBlock>
        ),
      },
    ],
  },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function HandbookScreen() {
  const [search, setSearch] = useState("");
  const [openChapters, setOpenChapters] = useState<Set<string>>(new Set());

  const normalised = search.toLowerCase().trim();

  const filteredChapters = useMemo(() => {
    if (!normalised) return CHAPTERS;
    return CHAPTERS.map((chapter) => {
      const titleMatch = chapter.title.toLowerCase().includes(normalised);
      const filteredSections = chapter.sections.filter(
        (s) => titleMatch || s.title.toLowerCase().includes(normalised),
      );
      if (titleMatch || filteredSections.length > 0) {
        return { ...chapter, sections: titleMatch ? chapter.sections : filteredSections };
      }
      return null;
    }).filter(Boolean) as HandbookChapter[];
  }, [normalised]);

  // When searching, open all matched chapters automatically
  const chaptersToShow = useMemo(() => {
    if (normalised) {
      return filteredChapters.map((c) => ({ ...c, forceOpen: true }));
    }
    return filteredChapters.map((c) => ({ ...c, forceOpen: false }));
  }, [filteredChapters, normalised]);

  function toggleChapter(id: string) {
    setOpenChapters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <GameLayout>
      <div className="min-h-screen bg-zinc-950 p-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
            <Book size={18} className="text-emerald-400" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Scout&apos;s Handbook</h1>
            <p className="text-xs text-zinc-500">Reference guide to game mechanics</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search chapters and sections…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search handbook"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2.5 pl-9 pr-4 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
          />
        </div>

        {/* Chapters */}
        {chaptersToShow.length === 0 ? (
          <div className="py-16 text-center text-sm text-zinc-500">
            No chapters match &ldquo;{search}&rdquo;
          </div>
        ) : (
          <div className="space-y-2" role="list" aria-label="Handbook chapters">
            {chaptersToShow.map(({ forceOpen, ...chapter }) => {
              const isOpen = forceOpen || openChapters.has(chapter.id);
              const ChapterIcon = chapter.icon;
              return (
                <div
                  key={chapter.id}
                  role="listitem"
                  className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
                >
                  {/* Chapter header */}
                  <button
                    onClick={() => toggleChapter(chapter.id)}
                    aria-expanded={isOpen}
                    aria-controls={`chapter-body-${chapter.id}`}
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition hover:bg-zinc-800/50"
                  >
                    <ChapterIcon
                      size={15}
                      className="shrink-0 text-emerald-400"
                      aria-hidden="true"
                    />
                    <span className="flex-1 text-sm font-semibold text-zinc-100">
                      {chapter.title}
                    </span>
                    <ChevronDown
                      size={14}
                      className={`shrink-0 text-zinc-500 transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </button>

                  {/* Chapter body */}
                  {isOpen && (
                    <div
                      id={`chapter-body-${chapter.id}`}
                      className="border-t border-zinc-800"
                    >
                      {chapter.sections.map((section, si) => (
                        <div
                          key={section.title}
                          className={`px-5 py-4 ${
                            si < chapter.sections.length - 1
                              ? "border-b border-zinc-800/60"
                              : ""
                          }`}
                        >
                          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                            {section.title}
                          </h3>
                          {section.content}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </GameLayout>
  );
}
