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

// ─── Finances & Marketplace ─────────────────────────────────────────────────

export const financesArticles: WikiArticle[] = [
  // ── Income Sources ───────────────────────────────────────────────────────
  {
    slug: "income-sources",
    title: "Income Sources",
    category: "finances",
    order: 0,
    summary:
      "Earn money through salary, marketplace sales, retainers, placements, consulting, and reputation-driven opportunities.",
    searchText:
      "Income arrives from multiple sources depending on your career path. Club scouts receive regular salary and bonuses tied to trust and responsibility. Independent scouts sell reports on the marketplace, earn retainer fees from clubs, collect placement fees when recommended players move, and take consulting contracts. Final prices rise or fall with report quality, conviction, exclusivity, timing, and reputation. New scouts receive a brief early-career cushion so one slow week does not immediately end a save.",
    content: (
      <SectionBlock>
        <Para>
          Income sources differ based on your career path. Club scouts receive a
          regular salary; independent scouts must generate their own revenue
          through multiple channels.
        </Para>

        <Subheading>Salary (Club Path)</Subheading>
        <Table
          headers={["Career Tier", "Weekly Salary Range"]}
          rows={[
            ["Tier 1 (Freelance)", "None"],
            ["Tier 2 (Junior Scout)", "500 - 1,500"],
            ["Tier 3 (Senior Scout)", "1,500 - 4,000"],
            ["Tier 4 (Chief Scout)", "4,000 - 10,000"],
            ["Tier 5 (Sporting Director)", "10,000 - 25,000"],
          ]}
        />
        <Para>
          Weekly salary is converted to a calendar-month equivalent. Twelve
          financial periods are distributed across each competition season.
        </Para>

        <Subheading>Report Marketplace (Independent)</Subheading>
        <Table
          headers={["Conviction", "Base Price Range"]}
          rows={[
            ["Note", "100 - 200"],
            ["Recommend", "400 - 800"],
            ["Strong Recommend", "1,200 - 2,000"],
            ["Table Pound", "3,000 - 5,000"],
          ]}
        />
        <Para>
          Final price is shaped by report quality, target club tier, transfer
          timing, exclusivity, and your reputation.
        </Para>

        <Subheading>Retainer Contracts</Subheading>
        <Table
          headers={["Tier", "Monthly Fee", "Reports Required"]}
          rows={[
            ["Basic", "500 - 1,000", "2 per month"],
            ["Standard", "1,500 - 3,000", "3 per month"],
            ["Premium", "4,000 - 8,000", "5 per month"],
            ["Elite", "10,000 - 20,000", "7 per month"],
            ["Platinum", "25,000 - 50,000", "10 per month"],
          ]}
        />

        <Subheading>Other Income</Subheading>
        <BulletList
          items={[
            <>
              <strong>Placement fees:</strong> stronger recommendations and
              bigger moves generally pay more.
            </>,
            <>
              <strong>Consulting:</strong> clubs may hire you for short,
              focused projects such as transfer advice, youth audits, data
              packages, or workshops.
            </>,
            <>
              <strong>Specialization bonuses:</strong> monthly income adjustments
              based on your specialization and unique income sources
            </>,
          ]}
        />

        <InfoCard title="Starter Bonuses" color="emerald">
          Your first successful sale and first placement both receive an
          early-career boost. New scouts also receive a short starter stipend
          to bridge the opening weeks.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "expenses-overview",
      "report-marketplace",
      "financial-health",
      "career-tiers",
      "career-paths",
    ],
    tags: [
      "income",
      "salary",
      "money",
      "retainer",
      "placement fee",
      "consulting",
      "marketplace",
      "revenue",
    ],
  },

  // ── Expenses ─────────────────────────────────────────────────────────────
  {
    slug: "expenses-overview",
    title: "Expenses",
    category: "finances",
    order: 1,
    summary:
      "Monthly costs include rent, travel, subscriptions, lifestyle, office, employee salaries, loan payments, and insurance.",
    searchText:
      "Expenses are deducted at the same 12 financial-period closes distributed across each competition season. Rent by tier: Tier 1 100, Tier 2 350, Tier 3 500, Tier 4 650, Tier 5 800. Travel base by tier: Tier 1 50, Tier 2 175, Tier 3 250, Tier 4 325, Tier 5 400. International travel adds 100 surcharge. Subscriptions are based on equipment loadout monthly total. Lifestyle costs: Level 1 Budget 200, Level 2 Comfortable 500, Level 3 Professional 1000, Level 4 Upscale 2000, Level 5 Luxury 5000. Higher lifestyle provides networking bonuses up to 20% and salary offer bonuses up to 15% but Luxury level carries a 10 point credit score penalty. Office costs: Home 0, Coworking 200, Small 500, Professional 1500, HQ 4000 monthly. Employee salaries vary by role: Scout 500-2000, Analyst 400-1500, Administrator 300-1000, Relationship Manager 600-2500, Mentee 200-600. Insurance costs 50 per employee per month. Loan payments are deducted based on active loan terms. NPC scout salaries at Tier 4 cost 500 each, Tier 5 costs 2000 each. Other incidentals: 35 at Tier 1, 50 at higher tiers.",
    content: (
      <SectionBlock>
        <Para>
          Expenses are deducted alongside income at the same 12 financial
          period closes distributed across the competition season. As you
          advance through career tiers and expand your agency, costs naturally
          increase.
        </Para>

        <Subheading>Fixed Expenses by Tier</Subheading>
        <Table
          headers={["Expense", "Tier 1", "Tier 2", "Tier 3", "Tier 4", "Tier 5"]}
          rows={[
            ["Rent", "100", "350", "500", "650", "800"],
            ["Travel (base)", "50", "175", "250", "325", "400"],
            ["Other", "35", "50", "50", "50", "50"],
          ]}
        />

        <Subheading>Lifestyle Costs</Subheading>
        <Table
          headers={["Level", "Monthly Cost", "Networking Bonus", "Salary Bonus"]}
          rows={[
            ["1 - Budget", "200", "0%", "0%"],
            ["2 - Comfortable", "500", "+5%", "0%"],
            ["3 - Professional", "1,000", "+10%", "+5%"],
            ["4 - Upscale", "2,000", "+15%", "+10%"],
            ["5 - Luxury", "5,000", "+20%", "+15%"],
          ]}
        />

        <Subheading>Agency Expenses (Independent Path)</Subheading>
        <BulletList
          items={[
            "Office rent: Home (free) to HQ (4,000/month)",
            "Employee salaries: 200-2,500 per employee based on role and skills",
            "Insurance: 50 per employee per month",
            "Marketing: set manually via agency management",
            "Satellite offices: 1,200 per office per month",
          ]}
        />

        <Subheading>Other Costs</Subheading>
        <BulletList
          items={[
            "International travel surcharge: +100 when abroad",
            "Subscriptions: based on equipment loadout",
            "Loan payments: deducted based on active loan terms",
            "NPC scout salaries (Tier 4+): 500 per scout at Tier 4, 2,000 at Tier 5",
          ]}
        />
      </SectionBlock>
    ),
    related: [
      "income-sources",
      "loans-credit",
      "financial-health",
      "agency-overview",
      "satellite-offices",
    ],
    tags: [
      "expenses",
      "costs",
      "rent",
      "travel",
      "lifestyle",
      "office",
      "salary",
      "budget",
    ],
  },

  // ── Loans & Credit ───────────────────────────────────────────────────────
  {
    slug: "loans-credit",
    title: "Loans & Credit",
    category: "finances",
    order: 2,
    summary:
      "Three loan types help you bridge gaps or invest in growth, with terms shaped by your financial reputation.",
    searchText:
      "Three loan types are available: business funding for growth, equipment financing for tools, and emergency cover for short-term distress. You can only hold one active loan at a time. Better financial discipline improves your terms, while missed payments and prolonged deficits make borrowing more expensive and more restrictive. Loans can be repaid early to save on interest.",
    content: (
      <SectionBlock>
        <Para>
          Loans provide emergency funding or investment capital, but come with
          monthly interest. You can only hold{" "}
          <Tag color="rose">one active loan</Tag> at a time.
        </Para>

        <Subheading>Loan Types</Subheading>
        <Table
          headers={["Type", "Max Amount", "Base Rate", "Term"]}
          rows={[
            ["Business", "20,000", "5% / month", "12 months"],
            ["Equipment", "10,000", "10% / month", "6 months"],
            ["Emergency", "2,000", "8% / month", "4 months"],
          ]}
        />

        <Subheading>Credit Score System</Subheading>
        <Para>
          Your credit standing affects loan interest rates, approval chances,
          and the amount lenders are willing to offer. Reliable cash
          management improves your terms; missed payments and long negative
          stretches damage them.
        </Para>
        <Table
          headers={["Event", "Credit Impact"]}
          rows={[
            ["Positive balance", "Builds trust with lenders"],
            ["On-time loan repayment", "Improves future terms"],
            ["Completed retainer", "Helps your file"],
            ["Missed payment", "Damages lender confidence"],
            ["Loan default", "Severely damages trust"],
            ["Long negative balance", "Pushes rates and restrictions upward"],
          ]}
        />

        <Subheading>Eligibility Rules</Subheading>
        <BulletList
          items={[
            "Business loans suit expansion when your books are in reasonable shape.",
            "Equipment loans suit tool upgrades and scouting infrastructure.",
            "Emergency loans are easier to access but usually come with harsher terms.",
            "Borrowing power scales with income and existing debt load.",
            "Heavy debt can block fresh borrowing until you stabilise.",
          ]}
        />

        <InfoCard title="Early Repayment" color="emerald">
          You can repay a loan early to save on interest. The full remaining
          balance (principal + accrued interest) must be paid at once.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "financial-health",
      "income-sources",
      "expenses-overview",
      "agency-overview",
    ],
    tags: [
      "loans",
      "credit",
      "interest",
      "debt",
      "finance",
      "borrowing",
      "credit score",
    ],
  },

  // ── The Report Marketplace ───────────────────────────────────────────────
  {
    slug: "report-marketplace",
    title: "The Report Marketplace",
    category: "finances",
    order: 3,
    summary:
      "List reports for sale with set pricing. Clubs respond according to need, budget, and the trust your report inspires.",
    searchText:
      "The report marketplace allows independent scouts to sell reports to clubs. List a report with a set price and optional exclusivity or target club. Listings stay active for several weeks before expiring. Clubs weigh report quality, conviction, positional need, age fit, budget, your reputation, and transfer timing before they bid. Exclusive listings command a premium because only one buyer can secure them. Competition, urgency, and market heat all change how quickly offers arrive and how aggressive they become.",
    content: (
      <SectionBlock>
        <Para>
          The Report Marketplace is the primary income source for independent
          scouts. List completed reports, set your price, and wait for clubs
          to bid.
        </Para>

        <Subheading>Listing a Report</Subheading>
        <BulletList
          items={[
            "Set a price that matches your confidence and the player's appeal",
            "Choose exclusive (one buyer only) or open",
            "Optionally target a specific club",
            "Listings remain active for up to 8 weeks",
          ]}
        />

        <Subheading>How Clubs Bid</Subheading>
        <Para>
          Clubs weigh five things before they commit money:
        </Para>
        <Table
          headers={["Factor", "Why it matters"]}
          rows={[
            ["Report quality", "Better craft makes the risk easier to justify"],
            ["Conviction level", "Stronger calls raise the ceiling and the downside"],
            ["Position need", "Urgent gaps create urgency"],
            ["Age fit", "Some clubs buy for now, others buy for the future"],
            ["Budget fit", "Even a good report dies if the fee feels wrong"],
          ]}
        />
        <Para>
          Stronger overall fit produces faster and larger bids. Competition
          from rival buyers can also raise the final offer.
        </Para>

        <Subheading>Market Temperature</Subheading>
        <Table
          headers={["Market", "What it feels like"]}
          rows={[
            ["Cold", "Fewer buyers and flatter prices"],
            ["Normal", "Steady demand and fair offers"],
            ["Hot", "More urgency and stronger bids"],
            ["Deadline", "Fast, emotional bidding with premium pressure"],
          ]}
        />

        <InfoCard title="Pricing Strategy" color="amber">
          Lower prices usually attract more attention, but strong reports can
          justify patience. Busy windows often reward timing as much as talent.
        </InfoCard>
      </SectionBlock>
    ),
    related: [
      "income-sources",
      "conviction-levels",
      "report-quality",
      "after-submission",
      "financial-health",
    ],
    tags: [
      "marketplace",
      "selling",
      "reports",
      "bids",
      "pricing",
      "demand",
      "exclusive",
    ],
  },

  // ── Financial Health ─────────────────────────────────────────────────────
  {
    slug: "financial-health",
    title: "Financial Health",
    category: "finances",
    order: 4,
    summary:
      "Sustained negative balance triggers escalating distress: warnings, cutbacks, staff loss, and eventually bankruptcy.",
    searchText:
      "Financial distress is an escalating cascade triggered by sustained negative balance. It moves from warning signs to cutbacks, then to staff and reputation damage, and finally to bankruptcy if the situation keeps worsening. Recovery happens when balance returns positive. Common recovery moves include lowering lifestyle costs, selling equipment, taking emergency consulting, requesting salary support from a club employer, or using short-term borrowing.",
    content: (
      <SectionBlock>
        <Para>
          Sustained negative balance triggers an escalating distress system with
          increasingly severe consequences. Understanding this cascade is
          critical to career survival.
        </Para>

        <Subheading>Distress Levels</Subheading>
        <Table
          headers={["Level", "Trigger", "Consequences"]}
          rows={[
            ["Healthy", "Balance positive", "No penalties"],
            [
              "Warning",
              "Negative for 2+ weeks",
              "Inbox warning, -1 credit/week",
            ],
            [
              "Distressed",
              "Below -500 for 4+ weeks",
              "Subs cancelled, -2 rep/week",
            ],
            [
              "Critical",
              "Below -2,000 for 8+ weeks",
              "Staff quit, lose retainer, -3 rep/week",
            ],
            [
              "Bankruptcy",
              "Below -5,000 for 12+ weeks",
              "Reset to Tier 1, reputation halved, 10-week cooldown",
            ],
          ]}
        />

        <Para>
          Distress can only escalate <Tag color="amber">one level at a time</Tag>
          . Recovery occurs when your balance returns positive, reducing distress
          by one level per positive week. Recovery is twice as fast as escalation.
        </Para>

        <Subheading>Bankruptcy Effects</Subheading>
        <BulletList
          items={[
            "Career tier forced to 1",
            "All equipment liquidated",
            "All retainer and consulting contracts terminated",
            "Reputation halved",
            "10-week recovery cooldown (no further distress processing)",
          ]}
        />

        <Subheading>Recovery Options</Subheading>
        <BulletList
          items={[
            "Reduce lifestyle tier to lower monthly expenses",
            "Sell equipment for emergency cash (40% of value)",
            "Take emergency consulting work",
            "Request a salary advance (club path)",
            "Take an emergency loan (less restrictive eligibility)",
          ]}
        />

        <GridCards>
          <InfoCard title="Starting Cash" color="blue">
            Casual: 4,000. Normal / Hard / Ironman: 2,000. New scouts also
            receive a starter stipend for 4 weeks to help bridge the gap.
          </InfoCard>
          <InfoCard title="Budget Rule of Thumb" color="amber">
            Always maintain at least one month of expenses as a cash buffer.
            A single missed paycheck or unexpected cost can trigger the
            warning cascade.
          </InfoCard>
        </GridCards>
      </SectionBlock>
    ),
    related: [
      "income-sources",
      "expenses-overview",
      "loans-credit",
      "report-marketplace",
      "career-tiers",
    ],
    tags: [
      "financial health",
      "distress",
      "bankruptcy",
      "debt",
      "budget",
      "recovery",
      "broke",
    ],
  },
];
