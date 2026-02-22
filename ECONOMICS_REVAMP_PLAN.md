# TalentScout Economics Revamp — Design Plan

## Overview

The current economics system is **salary-and-reputation-driven** with minimal financial
decision-making. Tier 1 freelancers have zero income and no way to earn money. Tiers 2–5
receive a fixed salary with predictable expenses. Equipment purchases are the only
meaningful financial decision.

This revamp introduces **two divergent career paths** with fundamentally different
economic models, meaningful financial decisions at every tier, and systems where money
is both a resource and a score.

---

## The Two Paths

### Path A: Club Scout (Salaried Career)
> *"Climb the ladder. Earn stability. Sacrifice autonomy."*

The traditional career path. You work for clubs, earn a salary, follow directives,
and invest in personal development to climb the hierarchy.

**Progression:** Freelance → Part-time → Full-time → Head Scout → Director

**Economic model:** Steady salary income, limited side income, career advancement
unlocks higher pay. Financial pressure comes from investing in yourself (courses,
certifications, lifestyle) to stay competitive for promotions. You're trading
autonomy for security.

### Path B: Independent Scout / Agency Owner
> *"Build your empire. Earn freedom. Accept the risk."*

A new entrepreneurial path. You sell reports, earn placement fees, build an agency,
hire staff, and manage overhead. Higher ceiling, lower floor.

**Progression:** Freelance → Solo Independent → Small Agency → Established Agency → Elite Consultancy

**Economic model:** Variable income from report sales, placement fees, retainer
contracts, and consulting. Financial pressure comes from managing overhead (office,
staff, tools) against unpredictable revenue. You're trading security for upside.

---

## Phase 1: Foundation — Revenue Systems for Independents

### 1.1 Report Marketplace

Currently, reports are submitted to clubs for free. Independents need to **sell** them.

#### Report Pricing Model

```
basePrice = BASE_BY_CONVICTION[conviction] × QUALITY_MULTIPLIER(qualityScore)

Modifiers:
  × CLUB_TIER_MULTIPLIER    (elite clubs pay more)
  × EXCLUSIVITY_BONUS       (1.0 shared, 1.5 exclusive to one club)
  × URGENCY_BONUS           (1.0 normal, 1.3 during transfer window)
  × REPUTATION_MULTIPLIER   (0.5 at rep 0, up to 2.0 at rep 100)
  × SPECIALIZATION_MATCH    (1.2 if report type matches scout spec)
```

**Base prices by conviction level:**

| Conviction | Base Price | Description |
|---|---|---|
| note | £100–200 | Basic monitoring brief |
| recommend | £400–800 | Detailed assessment |
| strongRecommend | £1,200–2,000 | Comprehensive report with recommendation |
| tablePound | £3,000–5,000 | Career-stake endorsement |

**Quality multiplier:** `0.5 + (qualityScore / 100) × 1.0` → range [0.5, 1.5]

**Club tier multiplier:**
- League 2 / lower leagues: ×0.6
- Championship / mid-tier: ×0.8
- Lower Premier / top domestic: ×1.0
- Upper Premier / elite domestic: ×1.3
- Champions League clubs: ×1.6
- Super clubs (top 10 world): ×2.0

**How it works in gameplay:**
- After completing a report, the independent scout chooses: "Submit to marketplace" or
  "Offer exclusively to [specific club]"
- Marketplace listings are picked up by interested clubs (probability based on report
  quality + player desirability + scout reputation)
- Exclusive offers have higher price but require an existing relationship with the club
- Clubs can also **commission** reports (see 1.3 Retainer Contracts)

### 1.2 Placement Fees

When a player you recommended is actually signed, you earn a placement fee. This is the
big-money mechanic for independents.

#### Placement Fee Formula

```
placementFee = TRANSFER_FEE × FEE_PERCENTAGE

FEE_PERCENTAGE =
  BASE_RATE                          (1–3% of transfer fee)
  × CONVICTION_MULTIPLIER            (higher conviction = higher %)
  × REPUTATION_FACTOR                (rep gates the % you can command)
  × EXCLUSIVITY_BONUS                (were you the only scout who reported?)
  + POTENTIAL_BONUS                   (flat bonus for high-PA players)
```

**Base rates by player type:**
- Free agent / youth signing: Flat fee (£500–£5,000) rather than percentage
- Budget transfer (<£5M): 2–3% of fee
- Mid-range transfer (£5M–£20M): 1.5–2.5%
- Premium transfer (£20M–£50M): 1–2%
- Marquee transfer (>£50M): 0.5–1.5%

**Conviction multiplier:**
- note: ×0.5 (you just flagged them)
- recommend: ×1.0
- strongRecommend: ×1.5
- tablePound: ×2.5 (you staked your reputation)

**Timing matters:** If your report was submitted >6 months before the signing, the
fee is halved (stale intel discount). If submitted during the same transfer window,
full rate applies.

**For youth placements** (existing system enhancement):
- Currently placements generate zero income
- New: Youth placement fee = flat £1,000–£10,000 based on:
  - Academy tier of the receiving club
  - Player's potential ability
  - Scout's placement reputation perk level

**Sell-on clause tracking** (advanced):
- When a player you placed at a youth level later transfers for a large fee, you receive
  a small residual (0.1–0.5% of future transfer, capped)
- This creates a "portfolio" mechanic for youth scouts — invest early, reap later
- Displayed on the Alumni Tracking page alongside career snapshots

### 1.3 Retainer Contracts (Independent Path — Tier 2+)

Clubs can offer independent scouts **retainer contracts** — steady income in exchange
for regular report delivery.

| Retainer Tier | Monthly Fee | Required Reports/Month | Club Level |
|---|---|---|---|
| Basic | £500–1,000 | 2 reports | Lower league |
| Standard | £1,500–3,000 | 3–4 reports | Mid-table |
| Premium | £4,000–8,000 | 4–6 reports | Top flight |
| Elite | £10,000–20,000 | 6–8 reports | Champions League |

**Retainer mechanics:**
- Maximum retainers at once: 1 (solo) / 2–3 (small agency) / 4–6 (established) / unlimited (elite)
- Missing report quotas → retainer downgraded or cancelled
- Delivering high-quality reports → retainer upgraded over time
- Retainers from rival clubs create **conflict of interest** events
- Retainers provide access to the club's player database (first-team & youth)

### 1.4 Consulting Fees (Independent Path — Tier 4+)

At higher tiers, independent scouts can offer **consulting services**:

- **Transfer window advisory:** £5,000–£25,000 per window for shortlist creation
- **Youth development audit:** £3,000–£10,000 one-time fee for academy assessment
- **Data analysis package:** £2,000–£8,000 for statistical scouting report batch
- **Talent identification workshop:** Revenue from running courses (see Phase 3)

---

## Phase 2: Divergent Career Progression

### 2.1 Club Scout Path — Enhanced Salaried Tiers

The existing tier system stays but gains economic depth:

#### Tier 1 → Tier 2 (Freelance → Part-time)
- **Current:** Reputation ≥25 → job offers appear
- **Enhanced:** During Tier 1, you choose which path to pursue:
  - Accept a club offer → **Club Path** (existing flow, enhanced below)
  - Reach reputation ≥15 + complete first report sale → **Independent Path** unlocks

#### Club Path Tier 2: Part-time Club Scout
- **Salary:** £500–£1,500/week (unchanged)
- **New — Side income:** Can sell reports for non-competing clubs at 50% market rate
  (club has right of first refusal on your work)
- **New — Performance bonus:** End-of-season bonus = £500–£5,000 based on review score
- **New — Contract negotiation:** When offered a new contract, negotiate salary within
  the band (persuasion attribute affects outcome)

#### Club Path Tier 3: Full-time Club Scout
- **Salary:** £1,500–£4,000/week
- **New — Signing bonus:** One-time £2,000–£10,000 when accepting role
- **New — Discovery bonus:** £500–£2,000 per successful signing attributed to you
- **New — No side work:** Full exclusivity to club; violation = immediate firing
- **New — Relocation expenses:** If club is in different country, club covers moving
  costs but you lose local contacts (relationship reset penalty)

#### Club Path Tier 4: Head of Scouting
- **Salary:** £4,000–£10,000/week
- **New — Department budget:** You're given a monthly budget (£10K–£50K) to allocate
  across: NPC scout salaries, travel, tools, scouting databases
- **New — Budget management scoring:** Over/under budget affects performance review
- **New — Bonus pool:** £5,000–£25,000 annual bonus tied to department performance
- **New — Political capital:** Spend to influence transfer decisions (limited resource)

#### Club Path Tier 5: Director of Football
- **Salary:** £10,000–£25,000/week
- **New — Transfer budget influence:** Your recommendations affect the club's willingness
  to spend on targets
- **New — Profit sharing:** Small % of net transfer profit on players you identified
- **New — Board confidence meter:** Directly tied to job security and bonus structure
- **New — Golden parachute:** Severance pay if fired (contractLength × 4 weeks salary)

### 2.2 Independent Scout Path — New Tier System

#### Independent Tier 1: Freelance Scout (existing)
- **Income:** Report sales only (Phase 1.1)
- **Starting balance:** £500
- **Expenses:** Minimal (home office, basic tools)
- **Goal:** Build reputation + save £2,000 to establish yourself

#### Independent Tier 2: Solo Independent
- **Unlocked at:** Reputation ≥15 + £2,000 balance + 5 reports sold
- **Income:** Report sales + first retainer contract eligible
- **New — Office choice:** Home office (free) or shared co-working (£200/month, +5%
  report quality from professional environment, access to networking events)
- **New — Business registration:** One-time £500 fee to register as a sole trader
  (required for retainer contracts and placement fees)
- **Expenses:** Equipment, travel, optional office, business insurance (£100/month)
- **Max retainers:** 1

#### Independent Tier 3: Small Agency
- **Unlocked at:** Reputation ≥40 + £10,000 balance + 2 active retainers
- **Income:** Report sales + retainers + placement fees + youth placement fees
- **New — Hire first employee:** 1–2 junior scouts (similar to NPC scouts but:
  you pay their salary, you set their assignments, their output generates revenue)
- **New — Office upgrade:** Small office (£500/month, +10% quality, client meetings
  possible, required for employees)
- **New — Brand building:** Invest in marketing (£200–£1,000/month) to increase
  inbound retainer offers and report demand
- **Max retainers:** 2–3
- **Max employees:** 2

#### Independent Tier 4: Established Agency
- **Unlocked at:** Reputation ≥65 + £50,000 balance + agency revenue >£5,000/month
- **Income:** All previous + consulting fees + premium retainers
- **New — Office upgrade:** Professional office (£1,500/month, client meeting room,
  analysis suite, +15% quality)
- **New — Hire specialists:** Up to 5 employees across roles:
  - Scout (field work, generates reports)
  - Analyst (data processing, improves report quality)
  - Administrator (reduces overhead, manages scheduling)
  - Relationship manager (maintains club contacts while you work)
- **New — Agency reputation:** Separate from personal rep; affected by employee output
- **Max retainers:** 4–6
- **Max employees:** 5

#### Independent Tier 5: Elite Consultancy
- **Unlocked at:** Reputation ≥85 + £200,000 balance + 3+ elite retainers
- **Income:** All previous + transfer advisory fees + talent ID workshops
- **New — Premium office:** Elite office/HQ (£4,000/month, boardroom, video suite,
  data center)
- **New — Unlimited employees** (practical cap: salary overhead)
- **New — Franchise model:** License your methodology to junior scouts for passive income
- **New — Industry events:** Host and attend galas, conferences (reputation + networking)
- **New — Legacy investments:** Fund youth academies in developing nations (long-term
  alumni pipeline + reputation)
- **Max retainers:** Unlimited
- **Max employees:** 10+

---

## Phase 3: Personal Development Investment

### 3.1 Courses & Certifications

Replace the linear equipment-level system with a **skill tree of purchasable
qualifications** that gate abilities and boost performance.

#### Course Categories

**Scouting Licenses** (progressive, required for tier advancement):

| License | Cost | Duration | Prerequisite | Effect |
|---|---|---|---|---|
| FA Level 1 Scouting | £500 | 2 weeks | None | Required for Tier 2 offers |
| FA Level 2 Advanced | £1,500 | 4 weeks | Level 1 | +5% report quality |
| FA Level 3 Senior | £4,000 | 6 weeks | Level 2 + Tier 3 | Required for Tier 4 offers |
| UEFA A Scouting License | £10,000 | 8 weeks | Level 3 + Tier 4 | Required for Tier 5 |
| UEFA Pro | £25,000 | 12 weeks | UEFA A + Rep ≥90 | Prestige; +20% consulting fees |

**Specialization Courses** (optional, boost specific skills):

| Course | Cost | Duration | Spec | Effect |
|---|---|---|---|---|
| Youth Development Psychology | £800 | 3 weeks | Youth | +10% potential assessment accuracy |
| Grassroots Talent ID | £600 | 2 weeks | Youth | +15% unsigned youth discovery rate |
| Tactical Analysis Masterclass | £1,200 | 3 weeks | FirstTeam | +10% system fit accuracy |
| Advanced Match Analysis | £1,000 | 3 weeks | FirstTeam | +1 attribute per observation |
| Language Course (per language) | £400 | 4 weeks | Regional | New language = new region access |
| Cultural Intelligence | £600 | 2 weeks | Regional | +10% familiarity gain in foreign regions |
| Data Science for Football | £2,000 | 6 weeks | Data | +15% prediction accuracy |
| Machine Learning Fundamentals | £3,000 | 8 weeks | Data | Unlock automated anomaly detection |
| Sports Law & Contracts | £1,500 | 4 weeks | All | Understand contract details, negotiate better |
| Financial Management | £800 | 3 weeks | Independent | -10% overhead costs, unlock P&L reports |
| Leadership & Management | £1,200 | 4 weeks | All (Tier 4+) | +15% NPC/employee morale |
| Negotiation Skills | £900 | 3 weeks | All | +persuasion attribute, +10% salary/fee negotiation |

**Implementation details:**
- Courses consume activity slots (like observations) during their duration
- Can't observe/travel during course weeks (opportunity cost)
- Course completion is permanent (one-time investment)
- Some courses are prerequisites for others (skill tree)
- Displayed in a new "Development" tab alongside equipment

### 3.2 Equipment System Enhancement

Keep the existing 5-slot loadout but add:

**New equipment slot: Office/Workspace**
- Home desk (free, no bonus)
- Co-working membership (£200/month, +5% quality, networking access)
- Private office (£800/month, +10% quality, client meetings, employee space for 2)
- Professional suite (£2,000/month, +15% quality, video room, employee space for 5)
- Agency HQ (£5,000/month, +20% quality, boardroom, full data center, unlimited staff)

**Equipment financing:**
- New: Lease option for expensive items — pay monthly instead of upfront, but 30% more
  expensive over the item's lifetime
- New: Used equipment marketplace — buy at 60% cost, -2% effectiveness vs new
- This adds financial decision-making to equipment purchases

### 3.3 Continuing Professional Development (CPD)

**Annual CPD requirement** (optional system, toggleable):
- Each season, scouts are expected to complete CPD activities
- Activities: attend a conference (£500–£2,000), complete an online module (£100–£400),
  mentor a junior scout (free, gives back), publish a scouting article (free, +rep)
- Meeting CPD targets: +2 reputation at season end, eligible for premium job offers
- Missing CPD: -1 reputation, some elite clubs won't offer contracts

---

## Phase 4: Personal Lifestyle & Expenses

### 4.1 Lifestyle Tier System

Scouts choose a lifestyle that affects expenses, reputation perception, and
networking opportunities. This creates a "how much of my income do I reinvest
vs. enjoy?" tension.

#### Lifestyle Levels

| Level | Name | Monthly Cost | Effect |
|---|---|---|---|
| 1 | Budget | £200 | Base rent. No bonuses. -5% networking effectiveness (perception) |
| 2 | Comfortable | £500 | Modest flat. No penalties or bonuses. |
| 3 | Professional | £1,000 | Nice apartment. +5% networking, access to social events |
| 4 | Upscale | £2,000 | Premium housing. +10% networking, +5% club offer salary |
| 5 | Luxury | £5,000 | Penthouse. +15% networking, +10% salary offers, invited to galas |

**Lifestyle replaces the current flat TIER_RENT system.** Scouts choose their level
independently of career tier, though:
- Lifestyle level 4–5 is "expected" at career tier 4–5 (no penalty if maintained,
  -3 reputation/season if living below perceived station at elite level)
- Lifestyle level 1 at tier 4+ triggers narrative events ("colleagues notice your modest
  lifestyle" — could be positive spin for independents: "humble and focused")

### 4.2 Personal Purchases & Investments

One-time and recurring purchases that provide tangible gameplay benefits:

**Vehicle:**
- No car (public transport, existing travel system)
- Economy car (£5,000): -10% travel time/fatigue for domestic
- Professional car (£15,000): -20% travel time, +5% punctuality (arrive rested)
- Luxury car (£40,000): -25% travel, +10% networking first impressions
- *Cars depreciate 20% per season; can be sold*

**Home office upgrade** (for independents working from home):
- Basic desk: Free (included)
- Professional setup (£1,000): +5% report writing speed
- Full home office (£3,000): +10% report writing speed, video analysis at home
- Dedicated scouting room (£8,000): +15%, secure filing, client video calls

**Wardrobe:**
- Casual (free): No effect
- Business casual (£500/season): Required for professional meetings
- Professional (£1,500/season): +5% first impression networking
- Designer (£5,000/season): +10% first impression, access to exclusive events
- *Seasonal because fashion*

**Tech & Subscriptions** (overlaps with equipment but personal):
- Premium data service (£100/month): Access to advanced stats across all leagues
- Video library subscription (£50/month): Full match replays, not just highlights
- AI scouting assistant (£200/month, late-game unlock): Automated data alerts

### 4.3 Financial Health & Credit

**Bank balance states:**
- Thriving (>£50,000): Access to premium loans, investment opportunities
- Comfortable (£10,000–£50,000): Normal operations
- Stable (£2,000–£10,000): Normal, some investments locked
- Tight (£0–£2,000): Warning indicators, can't make luxury purchases
- Overdraft (£0 to -£500): Emergency mode, existing BROKE_THRESHOLD
- Bankrupt (<-£500): Game-over for independents / forced to accept any club offer

**Loans** (independent path only):
- Business loan: Up to £20,000 at 5% monthly interest, for office/staff expansion
- Equipment financing: Spread equipment costs over 6 months at 10% premium
- Emergency loan: £2,000 at 8% monthly interest (desperation option)

---

## Phase 5: Dynamic Economic Impact

### 5.1 Market Conditions

The game world's economy fluctuates seasonally:

**Transfer Market Temperature:**
- Hot market (summer window): +20% report demand, +30% placement fees
- Cold market (mid-season): -10% report demand, retainers more valuable
- Window deadline rush (final 2 weeks): +50% report prices, -20% quality expectations

**Economic Events** (new narrative event category):
- "Market crash" — transfer budgets slashed league-wide (affects revenue for 1 season)
- "TV deal bonanza" — specific league gets cash injection (+50% fees from that league)
- "FFP investigation" — specific club freezes spending (lost retainer, halted signings)
- "New ownership" — club gets new wealthy owner (spending spree, premium report demand)
- "Wage cap introduced" — league implements salary restrictions (affects club scout path)

### 5.2 Specialization-Specific Economics

Each specialization generates income differently:

**Youth Scout Economics:**
- Primary revenue: Placement fees (flat fees, but sell-on clauses create long-term value)
- Secondary: Report sales for youth players (lower per-report, higher volume)
- Unique: "Youth pipeline partnerships" — recurring revenue from clubs who trust your
  youth network (£500–£2,000/month per partnership)
- Long game: Alumni who succeed generate windfall sell-on payments years later
- Risk: Youth assessments are inherently uncertain; high placement failure rate

**First-Team Scout Economics:**
- Primary revenue: High-value individual reports (premium pricing)
- Secondary: Placement fees on major transfers (biggest single paydays)
- Unique: "Transfer window advisory" — short-term, high-fee consulting during windows
- Volatility: Feast or famine; massive fees during windows, quiet between them
- Risk: Table pound failures are expensive reputationally and financially

**Regional Scout Economics:**
- Primary revenue: Retainer contracts (clubs pay for territorial coverage)
- Secondary: "Discovery premium" — first-to-find bonus on previously unknown players
- Unique: "Regional intelligence packages" — monthly briefings sold to multiple clubs
  (non-exclusive, lower per-client, high-volume)
- Steady: Most consistent income stream of any specialization
- Risk: Currency fluctuation when working across countries, travel cost volatility

**Data Scout Economics:**
- Primary revenue: Analytics packages and statistical reports
- Secondary: Consulting fees for data infrastructure setup
- Unique: "Anomaly alerts" — subscription-based service where clubs pay monthly for
  automated statistical alerts on breakout players (passive income)
- Scalable: Data products can be sold to many clubs simultaneously (highest margin)
- Risk: Tech costs are high; ML pipeline equipment is expensive

### 5.3 Choice Consequences Matrix

Every major financial decision should have **visible consequences** 2–4 weeks later:

| Decision | Immediate Effect | Delayed Consequence |
|---|---|---|
| Take cheap office | Save money | Lower quality reports, fewer client meetings |
| Hire a junior scout | -£X/month salary | +reports generated, but quality varies |
| Skip CPD this season | Save time + money | -1 rep, locked out of elite offers |
| Upgrade to luxury lifestyle | -£5K/month | Better networking, higher salary offers |
| Take out a business loan | +£20K cash | Monthly interest payments reduce margins |
| Sell report exclusively | +50% price | Only one club sees it; miss wider market |
| Invest in youth pipeline | -£5K upfront | Sell-on clauses pay off in 2–5 seasons |
| Hire administrator | -£1K/month | -15% overhead costs on everything else |
| Complete UEFA A license | -£10K, 8 weeks | Required for tier 5, +consulting fee rates |
| Fire underperforming employee | Save salary | Lose their contacts/territory knowledge |

### 5.4 Financial Dashboard

New UI panel showing:
- **Profit & Loss:** Monthly income vs expenses breakdown
- **Cash flow forecast:** Projected balance for next 3 months
- **Revenue breakdown:** By source (salary/reports/fees/retainers/consulting)
- **Expense breakdown:** By category (staff/office/travel/equipment/lifestyle/loans)
- **Net worth trend:** Graph over time
- **Key metrics:** Revenue per report, cost per acquisition, ROI on employees

---

## Phase 6: Specialization-Path Gating

### What each path unlocks by specialization:

#### Youth + Club Path
- Tier 3: Youth scouting department access, grassroots tournament invites
- Tier 4: Academy director relationship, youth draft priority
- Tier 5: Shape the club's entire youth philosophy

#### Youth + Independent Path
- Tier 3: Youth pipeline partnerships with multiple clubs
- Tier 4: Run your own grassroots identification camps (revenue event)
- Tier 5: Fund and brand your own youth academy in a developing nation

#### FirstTeam + Club Path
- Tier 3: Manager's inner circle access, direct influence on transfers
- Tier 4: Transfer committee seat, veto power on signings
- Tier 5: Final say on all transfer targets

#### FirstTeam + Independent Path
- Tier 3: Transfer window advisory contracts
- Tier 4: Bidding war facilitation (earn fees from both buyer and seller)
- Tier 5: "Super agent of scouting" — clubs come to you for marquee signings

#### Regional + Club Path
- Tier 3: International scouting network expansion budget
- Tier 4: Open satellite offices in assigned territories
- Tier 5: Global scouting network director

#### Regional + Independent Path
- Tier 3: Multi-region retainer stacking
- Tier 4: Regional intelligence subscription service (passive income)
- Tier 5: International scouting conglomerate with offices worldwide

#### Data + Club Path
- Tier 3: Full analytics department access, custom dashboards
- Tier 4: Build the club's data infrastructure (shapes future scouting)
- Tier 5: AI-assisted scouting system design (automated alerts)

#### Data + Independent Path
- Tier 3: Analytics-as-a-service subscription model
- Tier 4: Predictive modeling products sold to multiple clubs
- Tier 5: Industry-leading analytics consultancy (highest margin business)

---

## Implementation Approach

### New Types Required

```typescript
// Career path choice
type CareerPath = "club" | "independent";

// Independent tier system (parallel to existing CareerTier)
type IndependentTier = 1 | 2 | 3 | 4 | 5;

// Report marketplace
interface ReportListing {
  id: string;
  reportId: string;
  price: number;
  isExclusive: boolean;
  targetClubId?: string;   // exclusive offer target
  listedWeek: number;
  listedSeason: number;
  status: "listed" | "sold" | "expired" | "withdrawn";
  buyerClubId?: string;
}

// Placement fee tracking
interface PlacementFeeRecord {
  playerId: string;
  clubId: string;
  transferFee: number;
  feePercentage: number;
  earnedFee: number;
  week: number;
  season: number;
  hasSellOnClause: boolean;
  sellOnPercentage?: number;
}

// Retainer contracts
interface RetainerContract {
  id: string;
  clubId: string;
  tier: "basic" | "standard" | "premium" | "elite";
  monthlyFee: number;
  requiredReportsPerMonth: number;
  reportsDeliveredThisMonth: number;
  startWeek: number;
  startSeason: number;
  status: "active" | "suspended" | "cancelled" | "upgraded";
}

// Employee (extension of NPCScout for independents)
interface AgencyEmployee {
  id: string;
  name: string;
  role: "scout" | "analyst" | "administrator" | "relationshipManager";
  quality: 1 | 2 | 3 | 4 | 5;
  salary: number;
  specialization?: Specialization;
  morale: number;
  fatigue: number;
  hiredWeek: number;
  hiredSeason: number;
}

// Office/workspace
interface Office {
  tier: "home" | "coworking" | "small" | "professional" | "hq";
  monthlyCost: number;
  qualityBonus: number;       // % bonus to report quality
  maxEmployees: number;
  hasClientMeetingRoom: boolean;
  hasVideoSuite: boolean;
  hasDataCenter: boolean;
}

// Courses & certifications
interface Course {
  id: string;
  name: string;
  category: "license" | "specialization" | "business" | "personal";
  cost: number;
  durationWeeks: number;
  prerequisiteIds: string[];
  effects: CourseEffect[];
  requiredTier?: number;
  requiredSpecialization?: Specialization;
}

interface CourseEffect {
  type: string;          // e.g., "reportQuality", "potentialAccuracy", "overheadReduction"
  value: number;         // e.g., 0.10 for +10%
}

interface CourseEnrollment {
  courseId: string;
  startWeek: number;
  startSeason: number;
  completionWeek: number;
  status: "inProgress" | "completed";
}

// Lifestyle
interface Lifestyle {
  level: 1 | 2 | 3 | 4 | 5;
  monthlyCost: number;
  networkingBonus: number;
  salaryOfferBonus: number;
}

// Loan
interface Loan {
  id: string;
  type: "business" | "equipment" | "emergency";
  principal: number;
  monthlyInterestRate: number;
  remainingBalance: number;
  monthlyPayment: number;
  startWeek: number;
  startSeason: number;
}

// Enhanced FinancialRecord
interface EnhancedFinancialRecord extends FinancialRecord {
  careerPath: CareerPath;
  independentTier?: IndependentTier;

  // Revenue tracking
  reportSalesRevenue: number;       // cumulative
  placementFeeRevenue: number;
  retainerRevenue: number;
  consultingRevenue: number;
  sellOnRevenue: number;
  bonusRevenue: number;             // club path bonuses

  // Active contracts & obligations
  retainerContracts: RetainerContract[];
  activeLoan?: Loan;
  placementFeeRecords: PlacementFeeRecord[];

  // Assets
  office: Office;
  employees: AgencyEmployee[];
  lifestyle: Lifestyle;
  completedCourses: string[];       // course IDs
  activeEnrollment?: CourseEnrollment;
  ownedVehicle?: { tier: number; purchasePrice: number; currentValue: number };
}
```

### New Engine Files

```
src/engine/finance/
  ├── expenses.ts           (existing — extend with new expense types)
  ├── equipmentBonuses.ts   (existing — unchanged)
  ├── equipmentCatalog.ts   (existing — add office slot)
  ├── reportMarketplace.ts  (NEW — report pricing, listing, sales)
  ├── placementFees.ts      (NEW — fee calculation, sell-on tracking)
  ├── retainers.ts          (NEW — retainer contract management)
  ├── consulting.ts         (NEW — consulting fee generation)
  ├── loans.ts              (NEW — loan management, interest)
  ├── lifestyle.ts          (NEW — lifestyle tier management)
  └── agency.ts             (NEW — employee management, office, overhead)

src/engine/career/
  ├── progression.ts        (existing — extend with independent tier progression)
  ├── management.ts         (existing — unchanged for club path)
  ├── npcScouts.ts          (existing — refactor to share logic with agency employees)
  ├── courses.ts            (NEW — course catalog, enrollment, completion)
  └── pathChoice.ts         (NEW — path selection logic, tier requirements)

src/engine/events/
  ├── eventTemplates.ts     (existing — add economic events)
  ├── narrativeEvents.ts    (existing — extend event resolution)
  └── economicEvents.ts     (NEW — market conditions, financial events)
```

### Changes to Existing Files

**`src/engine/core/types.ts`:**
- Add `CareerPath`, `IndependentTier` to Scout type
- Add all new interfaces above
- Extend `GameState` with new financial state
- Add new `ExpenseType` variants: `officeCost`, `employeeSalaries`, `marketing`,
  `loanPayment`, `lifestyle`, `courseFees`, `insurance`
- Add new `ReputationEvent` variants for economic activities

**`src/engine/core/gameLoop.ts`:**
- `processWeeklyTick()`: Add financial processing for independents
  - Process retainer contract deliveries
  - Check report marketplace sales
  - Process placement fee triggers on AI transfers
  - Trigger economic events
  - Process course completion
  - Process loan interest
- `advanceWeek()`: Apply all new financial state changes

**`src/engine/finance/expenses.ts`:**
- `calculateMonthlyExpenses()`: Add office, employees, lifestyle, loan, insurance,
  marketing line items
- `processWeeklyFinances()`: Add income from retainers, report sales, placement fees
- Replace flat `TIER_RENT` with dynamic lifestyle cost

**`src/engine/career/progression.ts`:**
- `calculatePerformanceReview()`: Add independent path review criteria
  - Revenue targets instead of/alongside report targets
  - Agency health metrics for independent tiers 3+
  - Client satisfaction scores from retainer performance
- `generateJobOffers()`: Generate retainer offers for independents
- Add `generateIndependentTierAdvancement()` for path B progression
- Add negotiation mechanics for salary/fee discussions

### Suggested Implementation Order

1. **Types & state** — Define all new types, extend GameState
2. **Path choice** — Career path selection at Tier 1→2 transition
3. **Report marketplace** — Pricing model, listing, AI-driven purchasing
4. **Placement fees** — Fee calculation, trigger on signings
5. **Retainer contracts** — Contract generation, quota tracking, renewal
6. **Lifestyle system** — Replace TIER_RENT, add lifestyle choices
7. **Courses & certifications** — Course catalog, enrollment, skill tree
8. **Agency management** — Employees, offices, overhead
9. **Loans & financing** — Business loans, equipment leasing
10. **Economic events** — Market conditions, financial narrative events
11. **Financial dashboard** — P&L, cash flow, revenue breakdown UI
12. **Consulting system** — High-tier independent revenue stream
13. **Sell-on clauses** — Long-term youth investment tracking
14. **Balance & tuning** — Playtest both paths, adjust numbers

---

## Design Principles

1. **Both paths should be equally viable and fun** — Club path has stability and
   progression clarity; Independent path has freedom and higher ceiling
2. **Every financial decision should have a gameplay consequence** — No dead-end
   investments; everything affects something visible within 1–4 weeks
3. **Risk/reward is the core tension** — Spending money should feel like a meaningful
   gamble, not a no-brainer upgrade
4. **Specialization matters economically** — A data scout and a youth scout should have
   genuinely different financial profiles and strategies
5. **Time is money** — Courses cost weeks. Office upgrades take time. Hiring takes
   interviews. This prevents "buy everything immediately" strategies
6. **Pure functions, immutable state** — All new engine code follows the existing
   architecture: `(state, rng) → newState`, no mutations, no I/O
7. **Backward compatible** — Existing saves should migrate gracefully (default to
   club path, current tier, existing finances extended with new defaults)
