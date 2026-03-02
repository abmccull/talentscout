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
      "Earn money through salary, report marketplace sales, retainer contracts, placement fees, consulting, and specialization bonuses.",
    searchText:
      "Income arrives from multiple sources depending on your career path. Club scouts receive a weekly salary paid monthly (every 4 weeks). Salary bands by tier: Tier 1 0, Tier 2 500-1500, Tier 3 1500-4000, Tier 4 4000-10000, Tier 5 10000-25000 per week. Independent scouts sell reports on the marketplace, earn retainer fees from clubs, collect placement fees when recommended players transfer, and take consulting contracts. Report marketplace prices are based on conviction level: Note 100-200, Recommend 400-800, Strong Recommend 1200-2000, Table Pound 3000-5000. Prices are further modified by quality score, club tier, exclusivity (1.5x premium), market temperature (cold 0.7x to deadline 1.8x), and scout reputation. Placement fees are 2% of transfer fee base rate multiplied by conviction level (0.5x for Note up to 2x for Table Pound). Retainer contracts pay monthly fees: Basic 500-1000 for 2 reports, Standard 1500-3000 for 3 reports, Premium 4000-8000 for 5 reports, Elite 10000-20000 for 7 reports. Consulting contracts include Transfer Advisory 5000-25000 for 4 weeks, Youth Audit 3000-10000 for 6 weeks, Data Package 2000-8000 for 3 weeks, Talent Workshop 4000-15000 for 2 weeks. First report sale gets a 50% bonus. First placement fee gets a 25% bonus. New scouts receive a starter stipend for the first 4 weeks: 500 on casual, 300 on normal, 200 on hard, 150 on ironman. Starting cash: 4000 casual, 2000 for all other difficulties.",
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
          Salary is paid monthly (every 4 weeks), totalling weekly rate times 4.
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
          Final price is modified by report quality, target club tier, market
          temperature (<Tag color="zinc">cold 0.7x</Tag> to{" "}
          <Tag color="rose">deadline 1.8x</Tag>), exclusivity (
          <Tag color="emerald">1.5x premium</Tag>), and your reputation.
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
              <strong>Placement fees:</strong> 2% of transfer fee, multiplied
              by conviction level (0.5x Note to 2x Table Pound)
            </>,
            <>
              <strong>Consulting:</strong> Transfer Advisory (5k-25k / 4 wks),
              Youth Audit (3k-10k / 6 wks), Data Package (2k-8k / 3 wks),
              Talent Workshop (4k-15k / 2 wks)
            </>,
            <>
              <strong>Specialization bonuses:</strong> monthly income adjustments
              based on your specialization and unique income sources
            </>,
          ]}
        />

        <InfoCard title="Starter Bonuses" color="emerald">
          Your first report sale earns a 50% bonus. Your first placement fee
          earns a 25% bonus. New scouts also receive a starter stipend for 4
          weeks (300 on Normal difficulty).
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
      "Expenses are deducted monthly every 4 weeks alongside salary. Rent by tier: Tier 1 100, Tier 2 350, Tier 3 500, Tier 4 650, Tier 5 800. Travel base by tier: Tier 1 50, Tier 2 175, Tier 3 250, Tier 4 325, Tier 5 400. International travel adds 100 surcharge. Subscriptions are based on equipment loadout monthly total. Lifestyle costs: Level 1 Budget 200, Level 2 Comfortable 500, Level 3 Professional 1000, Level 4 Upscale 2000, Level 5 Luxury 5000. Higher lifestyle provides networking bonuses up to 20% and salary offer bonuses up to 15% but Luxury level carries a 10 point credit score penalty. Office costs: Home 0, Coworking 200, Small 500, Professional 1500, HQ 4000 monthly. Employee salaries vary by role: Scout 500-2000, Analyst 400-1500, Administrator 300-1000, Relationship Manager 600-2500, Mentee 200-600. Insurance costs 50 per employee per month. Loan payments are deducted based on active loan terms. NPC scout salaries at Tier 4 cost 500 each, Tier 5 costs 2000 each. Other incidentals: 35 at Tier 1, 50 at higher tiers.",
    content: (
      <SectionBlock>
        <Para>
          Expenses are deducted monthly (every 4 weeks) alongside your income.
          As you advance through career tiers and expand your agency, costs
          naturally increase.
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
      "Three loan types with dynamic interest rates based on your credit score. Credit score ranges 0-100 and affects loan terms.",
    searchText:
      "Three loan types are available: Business loan up to 20000 at 5% base monthly interest over 12 months, Equipment loan up to 10000 at 10% over 6 months, Emergency loan up to 2000 at 8% over 4 months. You can only have one active loan at a time. Interest rates are dynamic based on credit score. Better credit reduces rates by up to 40%. Score 100 gets 3% on business loans. Score 50 gets 5%. Score 0 gets 10%. Maximum loan amount is capped at 6 times your monthly income up to 20000. Credit score ranges from 0 to 100 with a default of 50. Positive balance months earn +2 credit. On time loan repayments earn +3. Missed payments cost -5. Loan default costs -10. Negative balance months cost -3. Completed retainer contracts earn +1. Business loans require positive balance and credit score of 30 or higher (40 at Tier 4+). Equipment loans require credit score of 20 or higher. Emergency loans are available when balance is below 500. Loans can be repaid early to save on interest. Existing debt exceeding 50% of monthly income blocks new loans.",
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
          Your credit score ranges from <Tag color="zinc">0 to 100</Tag>{" "}
          (starting at 50) and directly affects loan interest rates. Better
          credit can reduce rates by up to 40%.
        </Para>
        <Table
          headers={["Event", "Credit Impact"]}
          rows={[
            ["Positive balance (monthly)", "+2"],
            ["On-time loan repayment", "+3"],
            ["Completed retainer", "+1"],
            ["Missed payment", "-5"],
            ["Loan default", "-10"],
            ["Negative balance (monthly)", "-3"],
          ]}
        />

        <Subheading>Eligibility Rules</Subheading>
        <BulletList
          items={[
            "Business: requires positive balance and credit score 30+ (40+ at Tier 4+)",
            "Equipment: requires credit score 20+",
            "Emergency: available when balance drops below 500",
            "Maximum loan: 6x monthly income, capped at 20,000",
            "Denied if existing debt exceeds 50% of monthly income",
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
      "List reports for sale with set pricing. AI clubs bid over 1-2 weeks based on positional need, budget, and report quality.",
    searchText:
      "The report marketplace allows independent scouts to sell reports to AI clubs. List a report with a set price and optional exclusivity or target club. Listings stay active for up to 8 weeks before expiring. AI clubs evaluate listings and place bids based on need match score combining quality factor up to 30 points, conviction factor up to 20 points, position need up to 35 points, age fit up to 15 points, and budget appropriateness up to 10 points. Clubs only bid when need match exceeds 40. Bid probability factors in club affordability, scout reputation, and market temperature. Bids range from 60% to 250% of listing price based on need priority. Critical need adds 1.3x multiplier. Competition from other bidders adds 10% per existing bid. Bids expire after 2-3 weeks. You can accept or decline each bid. Exclusive listings are sold to one buyer only with a 1.5x price premium. Non-exclusive reports can receive multiple bids and be sold multiple times. Market temperature affects everything: cold reduces prices and bid frequency, hot increases both, deadline day provides a 1.8x multiplier. Listings generate inbox notifications when bids arrive.",
    content: (
      <SectionBlock>
        <Para>
          The Report Marketplace is the primary income source for independent
          scouts. List completed reports, set your price, and wait for AI clubs
          to bid.
        </Para>

        <Subheading>Listing a Report</Subheading>
        <BulletList
          items={[
            "Set a price based on the suggested calculation",
            "Choose exclusive (1.5x premium, one buyer only) or open",
            "Optionally target a specific club",
            "Listings remain active for up to 8 weeks",
          ]}
        />

        <Subheading>How Clubs Bid</Subheading>
        <Para>
          AI clubs evaluate each listing using a need match score (0-110) that
          combines five factors:
        </Para>
        <Table
          headers={["Factor", "Max Points"]}
          rows={[
            ["Report quality", "30"],
            ["Conviction level", "20"],
            ["Position need (roster gaps)", "35"],
            ["Age fit for club philosophy", "15"],
            ["Budget appropriateness", "10"],
          ]}
        />
        <Para>
          Clubs only bid when their need score exceeds 40. Higher scores produce
          larger bids. Critical need (85+) adds a{" "}
          <Tag color="amber">1.3x multiplier</Tag>. Competition from other
          bidders adds 10% per existing pending bid.
        </Para>

        <Subheading>Market Temperature</Subheading>
        <Table
          headers={["Temperature", "Price Multiplier"]}
          rows={[
            ["Cold", "0.7x"],
            ["Normal", "1.0x"],
            ["Hot", "1.3x"],
            ["Deadline", "1.8x"],
          ]}
        />

        <InfoCard title="Pricing Strategy" color="amber">
          Bid amounts range from 60% to 250% of your listing price. Setting a
          lower price attracts more bids but may undervalue strong reports.
          During deadline periods, even moderate reports can fetch premium prices.
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
      "Sustained negative balance triggers escalating distress: warnings, cutbacks, staff loss, and ultimately bankruptcy with a 10-week recovery period.",
    searchText:
      "Financial distress is an escalating cascade triggered by sustained negative balance. Five levels: Healthy (balance positive, no penalties), Warning (negative balance for 2+ weeks, inbox warning, minus 1 credit per week), Distressed (balance below minus 500 for 4+ weeks, premium subscriptions cancelled, travel budget reduced, minus 2 reputation per week), Critical (balance below minus 2000 for 8+ weeks, assistant scouts quit, lose one retainer client, minus 3 reputation per week), Bankruptcy (balance below minus 5000 for 12+ weeks, forced to Tier 1, all equipment liquidated, contracts terminated, reputation halved, 10 week recovery period). Distress can only escalate one level at a time. Recovery happens when balance returns positive, reducing distress by one level. Recovery suggestions include reducing lifestyle tier, selling equipment for 40% of value, downgrading lifestyle, taking emergency consulting, requesting salary advance from club employer. The broke threshold is minus 500. Starting cash is 2000 on normal difficulty or 4000 on casual. Budget management tip: always maintain a cash buffer above zero. A single bad month can trigger the distress cascade.",
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
