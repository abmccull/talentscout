import type { WikiArticle } from "@/components/game/wiki/wikiTypes";
import {
  SectionBlock,
  Para,
  Tag,
  Table,
  Subheading,
  BulletList,
  InfoCard,
  GridCards,
} from "./components";

// ─── Agency Management ──────────────────────────────────────────────────────

export const agencyArticles: WikiArticle[] = [
  // ── Agency Overview ─────────────────────────────────────────────────────
  {
    slug: "agency-overview",
    title: "Agency Overview",
    category: "agency",
    order: 0,
    summary:
      "Running your own scouting agency: office tiers, capacity, overhead, and the path from home office to headquarters.",
    searchText:
      "Independent scouts can grow from a solo operation into a full scouting agency. Your office tier determines how many employees you can hire, the quality of work your team produces, and your monthly overhead. Office tiers: Home Office costs 0 per month with 0 employee capacity and 0 quality bonus. Coworking Space costs 200 per month with 1 employee capacity and 5% quality bonus. Small Office costs 500 per month with 3 employee capacity and 10% quality bonus. Professional Office costs 1500 per month with 6 employee capacity and 20% quality bonus. Headquarters costs 4000 per month with 12 employee capacity and 35% quality bonus. Each upgrade requires meeting the previous tier's independent tier requirement and having sufficient funds. Your office quality bonus applies to all reports produced by your agency employees. Higher-tier offices also unlock the ability to take on more retainer contracts simultaneously. The agency system is only available to independent scouts. Club scouts operate within their club's existing infrastructure and do not manage offices or employees directly.",
    content: (
      <SectionBlock>
        <Para>
          Independent scouts can grow from a solo operation into a full scouting
          agency. Your <Tag color="emerald">office tier</Tag> determines how
          many employees you can hire, the quality of work your team produces,
          and your monthly overhead.
        </Para>
        <Table
          headers={["Office Tier", "Cost/Month", "Capacity", "Quality Bonus"]}
          rows={[
            ["Home Office", "Free", "0", "None"],
            ["Coworking Space", "$200", "1", "+5%"],
            ["Small Office", "$500", "3", "+10%"],
            ["Professional Office", "$1,500", "6", "+20%"],
            ["Headquarters", "$4,000", "12", "+35%"],
          ]}
        />
        <Para>
          Each upgrade requires meeting the previous tier&apos;s independent
          tier requirement and having sufficient funds. Your office quality bonus
          applies to all reports produced by agency employees.
        </Para>
        <InfoCard title="Club Scouts" color="amber">
          The agency system is only available to independent scouts. Club scouts
          operate within their club&apos;s existing infrastructure and do not
          manage offices or employees directly.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "agency-employees",
      "agency-clients",
      "satellite-offices",
      "income-sources",
      "expenses-overview",
      "career-tiers",
    ],
    tags: ["agency", "office", "independent", "capacity", "overhead"],
  },

  // ── Agency Employees ────────────────────────────────────────────────────
  {
    slug: "agency-employees",
    title: "Agency Employees",
    category: "agency",
    order: 1,
    summary:
      "Hire scouts, analysts, administrators, relationship managers, and mentees. Each role has a salary range, weekly processing, morale, and fatigue.",
    searchText:
      "Your agency can employ five types of staff, each serving a distinct function. Scout employees cost 500-2000 per month and produce observation reports autonomously. Analyst employees cost 400-1500 per month and improve data quality on reports and provide statistical analysis. Administrator employees cost 300-1000 per month and reduce administrative overhead and handle scheduling. Relationship Manager employees cost 600-2500 per month and maintain contact networks and negotiate retainer contracts. Mentee employees cost 200-600 per month and are junior staff who learn on the job and improve over time. Each employee has morale, fatigue, experience points, and a quality rating. Every week employees are processed: morale fluctuates based on workload and agency success, fatigue accumulates from assignments and recovers during light weeks, XP is earned from completed tasks improving their quality rating over time. If morale drops too low employees may resign. High-quality employees produce better work but command higher salaries. Mentees start weak but can develop into any of the other four roles given enough time and experience. The number of employees you can hire is capped by your office tier capacity.",
    content: (
      <SectionBlock>
        <Para>
          Your agency can employ five types of staff, each serving a distinct
          function. The number of employees you can hire is capped by your
          office tier capacity.
        </Para>
        <Table
          headers={["Role", "Salary Range", "Function"]}
          rows={[
            ["Scout", "$500 – $2,000/mo", "Produces observation reports autonomously"],
            ["Analyst", "$400 – $1,500/mo", "Improves data quality and statistical analysis"],
            ["Administrator", "$300 – $1,000/mo", "Reduces overhead, handles scheduling"],
            [
              "Relationship Manager",
              "$600 – $2,500/mo",
              "Maintains contacts, negotiates retainers",
            ],
            ["Mentee", "$200 – $600/mo", "Junior staff who learn and improve over time"],
          ]}
        />
        <Subheading>Weekly Processing</Subheading>
        <Para>
          Every week each employee is processed. Their internal stats shift
          based on workload and agency performance:
        </Para>
        <BulletList
          items={[
            <>
              <span className="font-medium text-zinc-200">Morale</span> —
              fluctuates based on workload and agency success. If morale drops
              too low the employee may resign.
            </>,
            <>
              <span className="font-medium text-zinc-200">Fatigue</span> —
              accumulates from assignments and recovers during light weeks.
            </>,
            <>
              <span className="font-medium text-zinc-200">Experience (XP)</span>{" "}
              — earned from completed tasks, gradually improving the
              employee&apos;s quality rating.
            </>,
          ]}
        />
        <InfoCard title="Mentees" color="emerald">
          Mentees start with low quality but can develop into any of the other
          four roles given enough time and experience. They are the most
          cost-effective long-term investment.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "agency-overview",
      "agency-clients",
      "expenses-overview",
      "satellite-offices",
    ],
    tags: [
      "employees",
      "hiring",
      "morale",
      "salary",
      "scout",
      "analyst",
      "mentee",
    ],
  },

  // ── Agency Clients ──────────────────────────────────────────────────────
  {
    slug: "agency-clients",
    title: "Agency Clients & Retainers",
    category: "agency",
    order: 2,
    summary:
      "Retainer contracts with clubs provide steady income. Five tiers from Basic to Platinum, with quarterly renewals based on satisfaction.",
    searchText:
      "Retainer contracts are the backbone of a stable independent scouting agency. Clubs hire your agency on a retainer basis, paying a monthly fee in exchange for a guaranteed number of scouting reports. Retainer tiers: Basic pays 500-1000 per month for 2 reports per month. Standard pays 1500-3000 per month for 3 reports per month. Premium pays 4000-8000 per month for 5 reports per month. Elite pays 10000-20000 per month for 7 reports per month. Platinum is the highest tier with the best pay and most reports required. The maximum number of retainers you can hold depends on your independent tier: Tier 1 allows 0 retainers, Tier 2 allows 1, Tier 3 allows 3, Tier 4 allows 6, Tier 5 allows unlimited retainers. Retainers renew quarterly based on client satisfaction. If satisfaction is above 70 there is a chance the client upgrades to a higher tier. If satisfaction is between 40 and 70 the retainer renews at the same level. If satisfaction drops below 40 the retainer is cancelled. Satisfaction is driven by report quality, timeliness, and whether your recommendations lead to successful transfers. Building a roster of Premium and Elite retainers is the most reliable way to achieve financial stability as an independent scout.",
    content: (
      <SectionBlock>
        <Para>
          Retainer contracts are the backbone of a stable independent scouting
          agency. Clubs hire your agency on a retainer basis, paying a monthly
          fee in exchange for a guaranteed number of scouting reports.
        </Para>
        <Table
          headers={["Tier", "Monthly Fee", "Reports Required"]}
          rows={[
            ["Basic", "$500 – $1,000", "2 per month"],
            ["Standard", "$1,500 – $3,000", "3 per month"],
            ["Premium", "$4,000 – $8,000", "5 per month"],
            ["Elite", "$10,000 – $20,000", "7 per month"],
            ["Platinum", "Highest tier", "Most reports"],
          ]}
        />
        <Subheading>Retainer Capacity by Tier</Subheading>
        <Table
          headers={["Independent Tier", "Max Retainers"]}
          rows={[
            ["Tier 1", "0"],
            ["Tier 2", "1"],
            ["Tier 3", "3"],
            ["Tier 4", "6"],
            ["Tier 5", "Unlimited"],
          ]}
        />
        <Subheading>Quarterly Renewal</Subheading>
        <Para>
          Retainers are reviewed every quarter based on client satisfaction:
        </Para>
        <BulletList
          items={[
            <>
              <Tag color="emerald">70+</Tag> satisfaction — chance to upgrade to
              a higher tier.
            </>,
            <>
              <Tag color="amber">40–70</Tag> satisfaction — retainer renews at
              the same level.
            </>,
            <>
              <Tag color="rose">Below 40</Tag> satisfaction — retainer is
              cancelled.
            </>,
          ]}
        />
        <InfoCard title="Satisfaction Drivers" color="blue">
          Client satisfaction is driven by report quality, timeliness, and
          whether your recommendations lead to successful transfers. Prioritise
          your retainer clients&apos; requests to maintain healthy renewals.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "agency-overview",
      "agency-employees",
      "income-sources",
      "report-quality",
      "career-tiers",
    ],
    tags: [
      "retainer",
      "clients",
      "contracts",
      "satisfaction",
      "renewal",
      "income",
    ],
  },

  // ── Satellite Offices ───────────────────────────────────────────────────
  {
    slug: "satellite-offices",
    title: "Satellite Offices",
    category: "agency",
    order: 3,
    summary:
      "Expand internationally by opening satellite offices in other countries. Each office costs 8,000 to set up and 1,200 per month to maintain.",
    searchText:
      "Satellite offices let you extend your scouting reach into foreign countries. Each satellite office costs 8000 to set up and 1200 per month to maintain. A satellite office provides a 10% quality bonus to all scouting work performed in that country. Each satellite office can house up to 3 employees from your agency roster. Employees stationed at a satellite office gain familiarity with the local league faster and produce higher-quality observations for players in that region. Opening a satellite office requires a Professional Office or Headquarters tier. You must also have sufficient financial reserves to cover the setup cost and ongoing monthly expenses. International expansion is a late-game strategy best pursued once your core agency is profitable. A satellite office in a country with a strong league (like Brazil, Argentina, France, or Portugal) can be extremely valuable for discovering talent before other scouts. Combine satellite offices with the Regional Expert specialization for maximum effectiveness in a target country.",
    content: (
      <SectionBlock>
        <Para>
          Satellite offices let you extend your scouting reach into foreign
          countries, establishing a permanent presence that improves the quality
          and speed of your overseas operations.
        </Para>
        <GridCards>
          <InfoCard title="Setup Cost" color="amber">
            $8,000 one-time fee to open a new satellite office in any country.
          </InfoCard>
          <InfoCard title="Monthly Upkeep" color="amber">
            $1,200 per month to maintain the office and its operations.
          </InfoCard>
          <InfoCard title="Quality Bonus" color="emerald">
            +10% quality to all scouting work performed in that country.
          </InfoCard>
          <InfoCard title="Staff Capacity" color="blue">
            Up to 3 employees can be stationed at each satellite office.
          </InfoCard>
        </GridCards>
        <Subheading>Requirements</Subheading>
        <BulletList
          items={[
            "Professional Office or Headquarters tier required.",
            "Sufficient financial reserves for setup cost and ongoing expenses.",
            "Employees stationed abroad gain familiarity with the local league faster.",
          ]}
        />
        <InfoCard title="Strategy Tip" color="emerald">
          International expansion is a late-game strategy best pursued once your
          core agency is profitable. Target countries with strong leagues —
          Brazil, Argentina, France, or Portugal — for the best talent
          discovery. Combine with the Regional Expert specialization for maximum
          effectiveness.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "agency-overview",
      "agency-employees",
      "international-offices",
      "familiarity",
      "countries-leagues",
      "expenses-overview",
    ],
    tags: [
      "satellite",
      "international",
      "expansion",
      "office",
      "overseas",
      "quality",
    ],
  },
];
