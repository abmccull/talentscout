# Agency Path Implementation Plan

## Architecture Overview

This document specifies a five-phase plan to transform the independent scout agency path from a hollow shell into a compelling business-management simulation loop. Each phase is self-contained and builds on the previous one.

### Current State Summary

**What exists:**
- Office tiers (home through HQ) with costs, quality bonuses, and employee caps
- Employee hiring/firing with role, quality (3-15 on 1-20 scale), salary, morale, fatigue
- Weekly employee processing: morale drifts toward 60, fatigue recovers slowly
- Retainer contracts: clubs offer monthly fee for X reports/month, auto-generated based on rep
- Consulting contracts: tier 4+ only, one-off advisory fees with deadlines
- Report marketplace: list reports for sale, AI clubs purchase probabilistically
- Placement fees and sell-on clauses from scouted players being transferred
- Financial dashboard with P&L, cash flow forecast, revenue breakdown, loans
- Independent tier 1-5 progression with requirements (reputation, balance, reports, retainers, employees)

**What is broken:**
1. Agency nav tab hidden until independent tier 3 (`GameLayout.tsx` line 151)
2. Dashboard.tsx has zero references to agency, independent path, or business metrics
3. Employees update morale/fatigue weekly but produce nothing -- no reports, no scouting, no revenue contribution
4. `processEmployeeWeek()` only adjusts morale/fatigue numbers; the comment says "Actual report generation happens in the game loop" but it never does
5. Retainer/consulting offers are purely passive RNG events; player has no way to pursue clients
6. Employee quality is fixed at hire time (`rng.nextInt(3, 15)`) and never changes
7. Morale and fatigue have zero downstream effects on anything
8. Tier 4 only unlocks consulting offers (5% weekly chance); tier 5 has no exclusive content
9. `AgencyEmployee` type has no fields for: specialization, experience, hired week, assigned work, output history

---

## Phase 1: Progressive Visibility and Aspiration Hooks

**Goal:** Independent-path players see what they are building toward from day one. The agency feature transitions from invisible to aspirational to available.

**Player experience change:** From the moment a player chooses the independent path, they see a "Your Agency" card on the main dashboard with their current tier, progress toward the next tier, and a preview of what unlocks at each milestone. The sidebar shows a locked "Agency" nav item starting at tier 1 (not hidden entirely). At tier 2 the agency screen becomes accessible in a limited "planning mode."

### 1.1 -- Sidebar: Show locked Agency tab from tier 1

**File:** `/Users/tsc-001/talentscout/src/components/game/GameLayout.tsx`

**Change the `getNavVisibility` function** (line 127-183):

Currently line 150-151:
```typescript
case "agency":
  return careerPath === "independent" && tier >= 3;
```

Change to:
```typescript
case "agency":
  return careerPath === "independent";
```

**Add a locked state indicator to the nav rendering** (around line 253-285). When `tier < 2`, render the agency nav item with a lock icon and `opacity-50 pointer-events-none` styling. When `tier === 2`, render it normally but with a "Preview" badge. When `tier >= 3`, render it normally.

This requires passing `tier` and `careerPath` into the nav item renderer. Add a new helper:

```typescript
function getNavLockState(
  screen: GameScreen,
  tier: number,
  careerPath: string,
): "unlocked" | "preview" | "locked" | null {
  if (screen === "agency" && careerPath === "independent") {
    if (tier >= 3) return "unlocked";
    if (tier === 2) return "preview";
    return "locked";
  }
  return null;
}
```

In the nav button rendering (line 256-285), check the lock state and conditionally render:
- `"locked"`: Show `Lock` icon overlay, reduced opacity, no click handler, tooltip "Unlocks at Tier 3"
- `"preview"`: Normal click handler but show "Preview" badge instead of "New"
- `"unlocked"` / `null`: Current behavior

### 1.2 -- Agency Screen: Add tier-gated preview mode

**File:** `/Users/tsc-001/talentscout/src/components/game/AgencyScreen.tsx`

When `independentTier < 3`, show a roadmap/preview version instead of the management UI. This screen should display:

1. **Agency Roadmap Card** -- A vertical timeline showing all 5 tiers with:
   - Tier 1: "Freelance Scout" -- what the player can do now (marketplace, manual reports)
   - Tier 2: "Established Freelancer" -- first retainer contract slot, agency planning access
   - Tier 3: "Agency Founder" -- office upgrades, first employee, full agency management
   - Tier 4: "Professional Agency" -- consulting contracts, relationship managers, 6 employees max
   - Tier 5: "Elite Firm" -- unlimited retainers, 12 employees, premium clients, legacy features

2. **Tier Progress Card** -- Show current tier requirements and progress bars for each:
   - Reputation: X/Y
   - Balance: X/Y
   - Reports Submitted: X/Y
   - Active Retainers: X/Y (if applicable)
   - Employees: X/Y (if applicable)

   Import `getIndependentTierRequirements` from `@/engine/career/pathChoice` and read current values from `gameState.scout` and `gameState.finances`.

3. **"What's Next" callout** -- A highlighted card showing the single most impactful thing the player should do next to advance (lowest-progress requirement).

**Implementation approach:** Wrap the existing `AgencyScreen` content in a conditional. If `independentTier >= 3`, show existing UI. Otherwise, show the preview/roadmap UI. The preview UI is new JSX within the same component file -- no new component file needed.

### 1.3 -- Dashboard: Add independent path business summary card

**File:** `/Users/tsc-001/talentscout/src/components/game/Dashboard.tsx`

Add a new card section that appears only for `careerPath === "independent"`. Insert it after the existing summary cards (around line 200 based on the file structure). The card should show:

- **Business Health Mini-Dashboard:**
  - Monthly revenue (retainers + report sales + placement fees)
  - Monthly expenses (office + salaries + lifestyle)
  - Net cash flow (green/red)
  - Active retainer count / max allowed
  - Employee count / max capacity
  - Next tier progress (compact progress bar)

- **Quick Actions:**
  - "View Agency" button (navigates to agency screen)
  - "View Finances" button (navigates to financial dashboard)
  - If pending offers exist, show a badge: "2 pending offers"

**New imports needed:**
```typescript
import { calculateAgencyOverhead } from "@/engine/finance";
import { getIndependentTierRequirements } from "@/engine/career/pathChoice";
```

Read `finances.retainerContracts`, `finances.employees`, `finances.office` from `gameState.finances`. Use `calculateAgencyOverhead()` for expense calculation.

### 1.4 -- Inbox: Agency milestone notifications

**File:** `/Users/tsc-001/talentscout/src/stores/gameStore.ts` (weekly processing, around line 4184-4194)

After the independent tier advancement check (line 4185-4194), add an inbox message when tier advances:

```typescript
if (nextTier) {
  // ... existing advancement code ...

  // Add milestone notification
  const tierNames: Record<number, string> = {
    2: "Established Freelancer",
    3: "Agency Founder",
    4: "Professional Agency",
    5: "Elite Firm",
  };
  const milestoneMsg: InboxMessage = {
    id: `tier-advance-${nextTier}-${stateWithPhase2.currentSeason}`,
    week: stateWithPhase2.currentWeek,
    season: stateWithPhase2.currentSeason,
    type: "event",
    title: `Tier ${nextTier} Reached: ${tierNames[nextTier] ?? ""}`,
    body: `Your agency has reached Tier ${nextTier}. New capabilities are now available.`,
    read: false,
    actionRequired: false,
  };
  stateWithPhase2 = {
    ...stateWithPhase2,
    inbox: [milestoneMsg, ...stateWithPhase2.inbox],
  };
}
```

### Phase 1 Dependencies
- None. This phase only changes UI visibility and adds read-only display logic.
- No type changes required.
- No engine function changes required.

### Phase 1 Checklist
- [ ] 1.1 Sidebar locked/preview/unlocked agency tab states
- [ ] 1.2 Agency roadmap/preview screen for tier 1-2
- [ ] 1.3 Dashboard business summary card for independent path
- [ ] 1.4 Inbox milestone notifications on tier advancement

---

## Phase 2: Employee Productivity Loop

**Goal:** Employees produce visible, valuable output. This is the single most important missing feature. Scouts generate reports autonomously, analysts improve report quality, administrators reduce overhead, relationship managers generate leads.

**Player experience change:** After hiring employees, the player sees weekly activity logs showing what each employee did. Scout employees produce draft reports that the player can review and submit (or auto-submit for retainer fulfillment). The agency feels alive.

### 2.1 -- Extend AgencyEmployee type

**File:** `/Users/tsc-001/talentscout/src/engine/core/types.ts`

Add new fields to the `AgencyEmployee` interface (line 1577-1585):

```typescript
export interface AgencyEmployee {
  id: string;
  name: string;
  role: AgencyEmployeeRole;
  quality: number;       // 1-20 skill level
  salary: number;
  morale: number;        // 0-100
  fatigue: number;       // 0-100

  // --- NEW FIELDS (Phase 2) ---
  /** Week the employee was hired. Used for tenure calculations. */
  hiredWeek: number;
  /** Season the employee was hired. */
  hiredSeason: number;
  /** Region specialization (e.g., "England", "Spain"). Affects scouting quality. */
  regionSpecialization?: string;
  /** Position specialization (e.g., "CB", "ST"). Affects scouting accuracy. */
  positionSpecialization?: string;
  /** IDs of reports this employee generated (for tracking output). */
  reportsGenerated: string[];
  /** Current weekly assignment. */
  currentAssignment?: EmployeeAssignment;
  /** Cumulative experience points. Drives quality improvement in Phase 4. */
  experience: number;
  /** Weekly activity log entries (keep last 8 weeks). */
  weeklyLog: EmployeeLogEntry[];
}
```

Add new supporting types:

```typescript
export interface EmployeeAssignment {
  type: "scoutRegion" | "scoutPlayer" | "analyzeReports" | "manageClients" | "adminDuties" | "idle";
  /** Target region for scouting assignments. */
  targetRegion?: string;
  /** Target player ID for specific scouting assignments. */
  targetPlayerId?: string;
  /** Target club ID for relationship management. */
  targetClubId?: string;
  /** Week the assignment was given. */
  assignedWeek: number;
  assignedSeason: number;
}

export interface EmployeeLogEntry {
  week: number;
  season: number;
  action: string;
  /** Optional result description. */
  result?: string;
  /** Optional generated report ID. */
  reportId?: string;
}
```

### 2.2 -- New engine module: Employee work simulation

**New file:** `/Users/tsc-001/talentscout/src/engine/finance/employeeWork.ts`

This is the core new module. Pure functions that simulate what employees do each week.

```typescript
/**
 * Employee work simulation -- processes weekly employee assignments
 * and generates output (reports, quality bonuses, client leads, admin savings).
 *
 * All functions are pure: (state, rng) => newState.
 */

import type { RNG } from "../rng/index";
import type {
  FinancialRecord,
  AgencyEmployee,
  EmployeeAssignment,
  EmployeeLogEntry,
  ScoutReport,
  Player,
  Club,
  Scout,
} from "../core/types";
```

**Key functions to implement:**

#### `processEmployeeWork(rng, finances, players, clubs, scout, week, season) => { finances, generatedReports, logEntries }`

Main entry point. Iterates over all employees and delegates to role-specific handlers:

- **Scout employees:** Call `processScoutWork()`. Based on quality and assignment, the scout has a probability of generating a draft report on a player in their assigned region. Higher quality = better report quality score. Morale affects work rate (low morale = chance of doing nothing). Fatigue above 70 = reduced quality.

  ```
  reportChance = 0.3 + (employee.quality / 20) * 0.4  // 30-70% per week
  if (morale < 30) reportChance *= 0.3
  if (fatigue > 70) reportChance *= 0.6
  ```

  When a report is generated:
  - Pick a player from the assigned region (or random if unassigned)
  - Generate a simplified `ScoutReport` with quality based on employee skill + office bonus
  - Quality score: `(employee.quality / 20) * 60 + officeBonus * 100 + rng.nextInt(0, 15)`
  - Mark it as `scoutId: employee.id` (not the player scout's ID)
  - Add to `employee.reportsGenerated`
  - Log the activity

- **Analyst employees:** Call `processAnalystWork()`. Analysts improve the quality of the player's pending reports. Each week, an analyst can boost the `qualityScore` of one un-submitted report by `analyst.quality * 2` points (capped at 100). This represents data enrichment and statistical analysis.

  Log: "Analyzed report on {playerName} -- quality improved by +{X}"

- **Administrator employees:** Call `processAdminWork()`. Administrators reduce monthly overhead by a percentage based on quality: `overhead_reduction = quality * 0.5%` (max 10%). They also process retainer delivery paperwork -- if there are active retainers with undelivered reports AND available employee-generated reports matching that club's needs, the admin auto-delivers them (incrementing `reportsDeliveredThisMonth`).

  Log: "Processed {N} retainer deliveries" or "Reduced overhead by {X}%"

- **Relationship Manager employees:** Call `processRelationshipManagerWork()`. Each week, a relationship manager has a chance to generate a new retainer or consulting lead. This is a curated offer (not random like the existing system) where the RM's quality affects the tier and fee of the offer.

  ```
  leadChance = 0.1 + (employee.quality / 20) * 0.15  // 10-25% per week
  ```

  When a lead is generated, add it to `pendingRetainerOffers` or `pendingConsultingOffers` with a tag indicating it came from the RM (for UI differentiation).

  Log: "Generated a lead with {clubName} for a Tier {X} retainer"

#### `assignEmployee(finances, employeeId, assignment) => FinancialRecord`

Store action to set an employee's current assignment.

#### `getEmployeeEfficiency(employee) => number`

Calculate an employee's current work efficiency (0.0 to 1.0) based on morale, fatigue, and quality. Used by all role-specific processors.

```typescript
export function getEmployeeEfficiency(employee: AgencyEmployee): number {
  const moraleFactor = employee.morale / 100;             // 0.0 - 1.0
  const fatigueFactor = 1 - (employee.fatigue / 200);     // 0.5 - 1.0
  const qualityFactor = employee.quality / 20;             // 0.0 - 1.0
  return moraleFactor * fatigueFactor * qualityFactor;
}
```

### 2.3 -- Wire employee work into weekly processing

**File:** `/Users/tsc-001/talentscout/src/stores/gameStore.ts`

In the weekly processing block (around line 4156-4159), replace the simple `processEmployeeWeek` call with the new system:

```typescript
// Agency employee processing
if (econFinances.employees.length > 0) {
  // Update morale/fatigue (existing)
  econFinances = processEmployeeWeek(econRng, econFinances);

  // NEW: Process employee work output
  const workResult = processEmployeeWork(
    econRng,
    econFinances,
    stateWithPhase2.players,
    stateWithPhase2.clubs,
    stateWithPhase2.scout,
    stateWithPhase2.currentWeek,
    stateWithPhase2.currentSeason,
  );
  econFinances = workResult.finances;

  // Store generated reports in game state
  if (workResult.generatedReports.length > 0) {
    const newReports = { ...stateWithPhase2.reports };
    for (const report of workResult.generatedReports) {
      newReports[report.id] = report;
    }
    stateWithPhase2 = { ...stateWithPhase2, reports: newReports };
  }
}
```

**Add import** for `processEmployeeWork` in the store's import block and in `/Users/tsc-001/talentscout/src/engine/finance/index.ts`.

### 2.4 -- Update agency.ts hire function for new fields

**File:** `/Users/tsc-001/talentscout/src/engine/finance/agency.ts`

Update `hireEmployee()` (line 78-107) to include the new fields. The function signature needs `week` and `season` parameters:

```typescript
export function hireEmployee(
  rng: RNG,
  finances: FinancialRecord,
  role: AgencyEmployeeRole,
  week: number,
  season: number,
  regions: string[],    // Available regions for specialization
): FinancialRecord | null {
```

New employee initialization:
```typescript
const employee: AgencyEmployee = {
  id: `emp_${Date.now()}_${rng.nextInt(1000, 9999)}`,
  name: `${firstName} ${lastName}`,
  role,
  quality,
  salary,
  morale: 70,
  fatigue: 0,
  // New fields
  hiredWeek: week,
  hiredSeason: season,
  regionSpecialization: role === "scout" ? rng.pick(regions) : undefined,
  positionSpecialization: undefined,
  reportsGenerated: [],
  currentAssignment: undefined,
  experience: 0,
  weeklyLog: [],
};
```

**Update the store action** `hireAgencyEmployee` in `gameStore.ts` (line 6604-6611) to pass `week`, `season`, and `regions`:

```typescript
hireAgencyEmployee: (role: AgencyEmployeeRole) => {
  const { gameState } = get();
  if (!gameState || !gameState.finances) return;
  const rng = createRNG(`${gameState.seed}-hire-${gameState.currentWeek}`);
  const regions = gameState.countries.map(c => c.name);
  const updated = hireEmployee(
    rng, gameState.finances, role,
    gameState.currentWeek, gameState.currentSeason,
    regions,
  );
  if (updated) {
    set({ gameState: { ...gameState, finances: updated } });
  }
},
```

### 2.5 -- Agency Screen: Employee assignment UI and activity log

**File:** `/Users/tsc-001/talentscout/src/components/game/AgencyScreen.tsx`

Extend the employee card (lines 233-305) to show:

1. **Current Assignment** -- Below the morale/salary row, show the current assignment type with a dropdown/selector to change it. Options vary by role:
   - Scout: "Scout Region: [dropdown of regions]" | "Scout Player: [search]" | "Idle"
   - Analyst: "Analyze Reports" | "Idle"
   - Administrator: "Admin Duties" | "Idle"
   - Relationship Manager: "Manage Clients" | "Target Club: [dropdown]" | "Idle"

2. **Activity Log** -- Expandable section showing the employee's last 4-8 `weeklyLog` entries. Each entry shows week, action description, and result.

3. **Output Stats** -- "Reports generated: {N}" for scouts, "Reports improved: {N}" for analysts, "Leads generated: {N}" for relationship managers.

**New store action needed:** `assignAgencyEmployee(employeeId: string, assignment: EmployeeAssignment)`

**Add to store interface** (around line 389):
```typescript
assignAgencyEmployee: (employeeId: string, assignment: EmployeeAssignment) => void;
```

**Add store implementation:**
```typescript
assignAgencyEmployee: (employeeId: string, assignment: EmployeeAssignment) => {
  const { gameState } = get();
  if (!gameState || !gameState.finances) return;
  const updated = assignEmployee(gameState.finances, employeeId, assignment);
  set({ gameState: { ...gameState, finances: updated } });
},
```

### 2.6 -- Employee-generated reports: Review queue

**File:** `/Users/tsc-001/talentscout/src/components/game/AgencyScreen.tsx`

Add a new tab or section to the Agency screen: **"Employee Reports"**

This shows reports generated by employee scouts that week. Each report card shows:
- Player name, position, age
- Report quality score
- Generating employee's name
- Actions: "Submit to Retainer" (if matches a retainer club), "List on Marketplace", "Discard"

For retainer fulfillment: when the player clicks "Submit to Retainer", call `recordRetainerDelivery()` with the matching club ID. For marketplace: call the existing `listReportForSale()` action.

**New store actions needed:**
```typescript
submitEmployeeReportToRetainer: (reportId: string, clubId: string) => void;
discardEmployeeReport: (reportId: string) => void;
```

### Phase 2 Dependencies
- Phase 1 must be complete (agency screen needs to be visible)
- Save migration needed for new `AgencyEmployee` fields (add defaults for existing saves)

### Phase 2 Checklist
- [ ] 2.1 Extend `AgencyEmployee` type with new fields
- [ ] 2.2 Create `employeeWork.ts` engine module with role-specific processors
- [ ] 2.3 Wire `processEmployeeWork` into weekly game loop
- [ ] 2.4 Update `hireEmployee()` signature and initialization
- [ ] 2.5 Agency screen employee assignment UI and activity log
- [ ] 2.6 Employee report review queue UI and store actions

### Save Migration Note

**File:** `/Users/tsc-001/talentscout/src/engine/finance/saveMigration.ts`

Add a migration step that backfills existing `AgencyEmployee` objects with default values for new fields:

```typescript
// Phase 2 migration: backfill employee fields
if (finances.employees) {
  finances.employees = finances.employees.map(emp => ({
    ...emp,
    hiredWeek: emp.hiredWeek ?? 1,
    hiredSeason: emp.hiredSeason ?? 1,
    regionSpecialization: emp.regionSpecialization ?? undefined,
    positionSpecialization: emp.positionSpecialization ?? undefined,
    reportsGenerated: emp.reportsGenerated ?? [],
    currentAssignment: emp.currentAssignment ?? undefined,
    experience: emp.experience ?? 0,
    weeklyLog: emp.weeklyLog ?? [],
  }));
}
```

---

## Phase 3: Business Development and Client Relationships

**Goal:** Transform client acquisition from passive offer generation to an active player-driven process. Add a client relationship system where clubs have satisfaction scores, preferred report types, and renewal dynamics.

**Player experience change:** The player can actively pitch to clubs, negotiate retainer terms, build relationships through consistent delivery, and lose clients through poor service. Business development feels like a skill the player develops.

### 3.1 -- New type: ClientRelationship

**File:** `/Users/tsc-001/talentscout/src/engine/core/types.ts`

Add after the `RetainerContract` interface:

```typescript
export interface ClientRelationship {
  clubId: string;
  /** Satisfaction score 0-100. Drives renewal probability and tier upgrade offers. */
  satisfaction: number;
  /** Total reports delivered to this client across all retainers. */
  totalReportsDelivered: number;
  /** Total revenue earned from this client. */
  totalRevenue: number;
  /** Weeks since first interaction. */
  tenureWeeks: number;
  /** Club's preferred report focus areas. */
  preferences: ClientPreference[];
  /** Whether the client is open to new business. */
  status: "prospect" | "active" | "cooling" | "lost";
  /** Last interaction week. */
  lastInteractionWeek: number;
  lastInteractionSeason: number;
}

export type ClientPreference =
  | "youth"
  | "firstTeam"
  | "data"
  | "physical"
  | "technical"
  | "specificPosition";

export interface PitchResult {
  success: boolean;
  message: string;
  /** If successful, the offered contract. */
  offeredContract?: RetainerContract;
}
```

Add `clientRelationships: ClientRelationship[]` to the `FinancialRecord` interface (line 1787 area).

### 3.2 -- New engine module: Client relationship management

**New file:** `/Users/tsc-001/talentscout/src/engine/finance/clientRelationships.ts`

**Key functions:**

#### `initializeClientRelationships(finances, clubs) => FinancialRecord`
Create initial client relationship entries for any clubs that have existing retainer contracts. Called during save migration.

#### `updateClientSatisfaction(finances, clubId, delta, reason) => FinancialRecord`
Adjust a client's satisfaction score. Called when:
- Report delivered on time: +3 to +8 (based on report quality)
- Report quota missed: -15 to -25
- Consulting delivered successfully: +10
- Consulting failed/expired: -20
- Employee-generated report quality is high: +2

#### `processClientRelationshipWeek(rng, finances, week, season) => FinancialRecord`
Weekly tick that:
- Decays satisfaction toward 50 (neutral) for inactive relationships (no interaction in 4+ weeks)
- Processes "cooling" relationships: if satisfaction < 20 for 4 consecutive weeks, status becomes "lost"
- Generates organic referrals: satisfied clients (satisfaction > 80) have a 5% weekly chance of referring a new prospect club

#### `pitchToClub(rng, scout, finances, clubId, pitchType) => PitchResult`
Active business development. The player selects a club and a pitch type:
- `"coldCall"` -- Low success rate (10-20%), scales with reputation and relationship manager quality
- `"referral"` -- Requires an existing satisfied client, higher success (30-50%)
- `"showcase"` -- Present a portfolio of recent reports. Success scales with report quality average

Success probability formula:
```
base = pitchTypeBase
repMod = scout.reputation / 100 * 0.3
rmMod = bestRelationshipManager.quality / 20 * 0.2
satisfactionMod = existingRelationship.satisfaction / 100 * 0.2
probability = base + repMod + rmMod + satisfactionMod
```

On success, generate a retainer offer (similar to existing `generateRetainerOffers` but with better terms for higher pitch quality).

#### `negotiateRetainerTerms(rng, contract, scout, negotiationStrength) => RetainerContract`
Allow the player to negotiate the monthly fee of an offered retainer. `negotiationStrength` is derived from scout reputation + relationship manager quality. Result: fee adjusted by -20% to +30% of the original offer.

### 3.3 -- Retainer renewal system

**File:** `/Users/tsc-001/talentscout/src/engine/finance/retainers.ts`

Add to `processRetainerDeliveries()` (line 149-192):

When a retainer has been active for 12+ weeks (3 months) and quota was met, check for renewal/upgrade:
- Satisfaction > 70: Auto-renew, 20% chance of tier upgrade offer
- Satisfaction 40-70: Auto-renew at same tier
- Satisfaction < 40: Contract not renewed (status becomes "expired", not "cancelled")

Add a new function:
```typescript
export function processRetainerRenewals(
  rng: RNG,
  finances: FinancialRecord,
  week: number,
  season: number,
): FinancialRecord
```

### 3.4 -- Business Development UI

**New file:** `/Users/tsc-001/talentscout/src/components/game/BusinessDevelopment.tsx`

This is a new section within the Agency screen (or a sub-tab). Shows:

1. **Client List** -- Table of all client relationships with columns:
   - Club name + crest
   - Status (prospect/active/cooling/lost)
   - Satisfaction bar (0-100)
   - Active contracts count
   - Total revenue
   - Last interaction

2. **Pitch Panel** -- Select a prospect club and a pitch type. Show success probability estimate. "Make Pitch" button triggers the pitch and shows the result.

3. **Negotiation Modal** -- When accepting a retainer offer, option to negotiate terms. Slider for desired fee, with a "risk meter" showing probability of the club accepting.

### 3.5 -- Wire client relationships into weekly processing

**File:** `/Users/tsc-001/talentscout/src/stores/gameStore.ts`

In the weekly processing block, after retainer delivery processing:

```typescript
// Client relationship weekly update
if (stateWithPhase2.scout.careerPath === "independent") {
  econFinances = processClientRelationshipWeek(
    econRng, econFinances,
    stateWithPhase2.currentWeek, stateWithPhase2.currentSeason,
  );
}
```

**New store actions:**
```typescript
pitchToClient: (clubId: string, pitchType: "coldCall" | "referral" | "showcase") => void;
negotiateRetainer: (contractId: string, desiredFee: number) => void;
```

### Phase 3 Dependencies
- Phase 2 must be complete (employee work output is needed for client satisfaction)
- Relationship manager employees from Phase 2 affect pitch success rates

### Phase 3 Checklist
- [ ] 3.1 Add `ClientRelationship` type and `clientRelationships` to `FinancialRecord`
- [ ] 3.2 Create `clientRelationships.ts` engine module
- [ ] 3.3 Add retainer renewal logic to `retainers.ts`
- [ ] 3.4 Business development UI component
- [ ] 3.5 Wire into weekly processing and add store actions
- [ ] Save migration: initialize `clientRelationships: []` on existing saves

---

## Phase 4: Management Depth

**Goal:** Employee management becomes a meaningful skill. Quality improves with experience. Morale and fatigue have real consequences. Rival agencies compete for the player's staff.

**Player experience change:** Employees grow over time, creating attachment. Poor management leads to resignations, poaching, and performance degradation. Good management creates a competitive advantage. The player faces genuine tradeoffs between pushing employees hard for short-term output vs investing in their growth.

### 4.1 -- Employee growth system

**File:** `/Users/tsc-001/talentscout/src/engine/finance/employeeWork.ts`

Add to the weekly processing:

#### Experience accumulation
Every week an employee works (not idle), they gain experience:
```typescript
const expGain = employee.currentAssignment?.type !== "idle" ?
  Math.round(5 + employee.quality * 0.5 + (employee.morale / 100) * 3) : 0;
```

#### Quality improvement
At experience thresholds, quality increases by 1 (capped at 20):
```typescript
const QUALITY_THRESHOLDS = [50, 120, 210, 320, 450, 600, 780, 990, 1230, 1500];
// Check if experience crossed a threshold this week
```

This means a quality-10 employee who works consistently will reach quality-15 in roughly 30-40 weeks (about one season). New hires start between 3-15, so there is a real arc.

#### Specialization development
Scout employees who work the same region for 8+ consecutive weeks gain a +2 quality bonus when scouting that region. This is tracked via a new field:

Add to `AgencyEmployee`:
```typescript
/** Consecutive weeks on current region assignment. */
regionFocusWeeks: number;
```

### 4.2 -- Morale and fatigue consequences

**File:** `/Users/tsc-001/talentscout/src/engine/finance/agency.ts`

Update `processEmployeeWeek()` (line 130-149) to apply consequences:

#### Fatigue effects
- Fatigue > 60: Quality penalty of `-2` on work output
- Fatigue > 80: 5% weekly chance of injury/sick leave (employee produces nothing for 2 weeks, marked with `onLeave: true`)
- Fatigue > 90: 10% weekly chance of resignation

#### Morale effects
- Morale < 30: 50% chance of doing nothing each week (already in Phase 2 `reportChance` modifier, but formalize it)
- Morale < 20: 3% weekly chance of resignation
- Morale < 10: 10% weekly chance of resignation + damages morale of adjacent employees by -5

#### Morale drivers (expand beyond random drift)
Add meaningful morale modifiers:
- **Overwork:** If fatigue > 70, morale drops by -3/week instead of drifting
- **Good office:** Professional/HQ office: +1 morale/week baseline
- **Salary satisfaction:** If employee quality outgrows salary (quality > salary / max_salary * 20), morale drops by -2/week ("underpaid")
- **Successful work:** When an employee's report sells or fulfills a retainer, +3 morale
- **Idle:** If assigned to "idle" for 3+ weeks, morale drops by -5/week ("bored")

### 4.3 -- Employee events and poaching

**New file:** `/Users/tsc-001/talentscout/src/engine/finance/employeeEvents.ts`

Weekly event check for each employee. Pure function:

```typescript
export function checkEmployeeEvents(
  rng: RNG,
  employee: AgencyEmployee,
  finances: FinancialRecord,
  scout: Scout,
  week: number,
  season: number,
): EmployeeEvent | null
```

Event types:
- **Poaching attempt:** 2% weekly chance per employee with quality > 12. A rival agency offers higher salary. Player must match (+20% raise) or lose the employee. Higher morale reduces poaching success.
- **Training request:** 5% weekly chance. Employee asks to attend a course (costs money, reduces output for N weeks, but guarantees +1 quality).
- **Personal issue:** 2% weekly chance. Employee needs time off (1-3 weeks reduced output). Granting it: +10 morale. Denying: -15 morale, 20% quit chance.
- **Breakthrough:** 3% weekly chance for scouts with quality > 10. Employee finds a hidden gem player (generates a high-quality report on a youth player with high potential). Narrative event.

Add `EmployeeEvent` type:
```typescript
export interface EmployeeEvent {
  type: "poaching" | "trainingRequest" | "personalIssue" | "breakthrough";
  employeeId: string;
  description: string;
  /** Options the player can choose from. */
  options: EmployeeEventOption[];
  /** Deadline week to respond (auto-resolves if ignored). */
  deadline: number;
}

export interface EmployeeEventOption {
  label: string;
  cost?: number;
  moraleChange: number;
  /** Additional effects. */
  effect: "matchSalary" | "grantLeave" | "denyLeave" | "fundTraining" | "declineTraining" | "acceptPoach";
}
```

Store pending employee events in a new field on `FinancialRecord`:
```typescript
pendingEmployeeEvents: EmployeeEvent[];
```

### 4.4 -- Employee management UI enhancements

**File:** `/Users/tsc-001/talentscout/src/components/game/AgencyScreen.tsx`

Enhance the employee card with:

1. **Growth progress** -- Show experience bar and "Next quality upgrade at {X} XP"
2. **Tenure badge** -- "6 months" / "1 year" etc.
3. **Mood indicator** -- More granular than current (Excellent/Good/Fair/Low/Critical). Add tooltip explaining why morale is where it is: "Overworked (-3/wk)", "Good office (+1/wk)"
4. **Salary review button** -- Opens a slider to adjust salary. Shows whether employee feels underpaid.
5. **Region specialization badge** -- For scouts, show their region and any region focus bonus.

Add a new **Events panel** on the Agency screen showing pending `EmployeeEvent` entries with action buttons.

**New store actions:**
```typescript
adjustEmployeeSalary: (employeeId: string, newSalary: number) => void;
resolveEmployeeEvent: (eventId: string, optionIndex: number) => void;
```

### 4.5 -- Mentoring system (player teaches employees)

Add a new assignment type for the player: "Mentor Employee". On the calendar/schedule, the player can spend a day mentoring a specific employee. This gives:
- +5 employee experience
- +3 employee morale
- +2 employee quality for that week's work
- Costs the player one calendar slot (opportunity cost: can't scout that day)

**File:** `/Users/tsc-001/talentscout/src/engine/core/types.ts`

Add `"mentorEmployee"` to the existing activity type union (find `ActivityType`).

**File:** `/Users/tsc-001/talentscout/src/engine/core/activityMetadata.ts`

Add metadata for the mentoring activity.

### Phase 4 Dependencies
- Phase 2 must be complete (employee work output needed for consequences to matter)
- Phase 3 is recommended but not strictly required

### Phase 4 Checklist
- [ ] 4.1 Employee growth system (experience, quality thresholds, specialization)
- [ ] 4.2 Morale/fatigue consequence system (resignations, sick leave, performance)
- [ ] 4.3 Employee events module (poaching, training, personal, breakthrough)
- [ ] 4.4 Enhanced employee management UI
- [ ] 4.5 Mentoring calendar activity
- [ ] Save migration: backfill `experience`, `regionFocusWeeks`, `pendingEmployeeEvents`

---

## Phase 5: Tier 4-5 Exclusive Content

**Goal:** Make the highest tiers feel like a qualitative shift in gameplay, not just bigger numbers. Tier 4 introduces multi-club consulting and international expansion. Tier 5 introduces legacy mechanics and industry influence.

**Player experience change:** At tier 4, the player manages a professional agency with international reach, handling concurrent consulting engagements and expanding into new football markets. At tier 5, the player shapes the scouting industry, mentors the next generation, and builds a lasting legacy.

### 5.1 -- Tier 4: International expansion

**New engine module:** `/Users/tsc-001/talentscout/src/engine/finance/internationalExpansion.ts`

At tier 4, the player can open satellite offices in new regions:

```typescript
export interface SatelliteOffice {
  id: string;
  region: string;
  /** Monthly cost for the satellite. */
  monthlyCost: number;
  /** Quality bonus for scouting in this region. */
  qualityBonus: number;
  /** Employee capacity at this location. */
  maxEmployees: number;
  /** Employees stationed here. */
  employeeIds: string[];
  /** Establishment week. */
  openedWeek: number;
  openedSeason: number;
}
```

Add `satelliteOffices: SatelliteOffice[]` to `FinancialRecord`.

**Key functions:**
- `openSatelliteOffice(finances, region, week, season) => FinancialRecord | null` -- Costs a one-time setup fee (5000-15000 based on region) + monthly overhead
- `closeSatelliteOffice(finances, officeId) => FinancialRecord` -- Recall employees, close office
- `assignEmployeeToSatellite(finances, employeeId, officeId) => FinancialRecord`

**UI:** New "Offices" tab on the Agency screen showing a world map style layout of the main office and satellites. Each satellite shows its employees, output, and costs.

### 5.2 -- Tier 4: Advanced consulting

**File:** `/Users/tsc-001/talentscout/src/engine/finance/consulting.ts`

Expand consulting types available at tier 4:

```typescript
// Tier 4+ consulting types
const ADVANCED_CONSULTING: Record<string, ConsultingConfig> = {
  squadAudit: { feeRange: [15000, 50000], durationWeeks: 8 },
  transferStrategy: { feeRange: [20000, 75000], durationWeeks: 12 },
  academyReview: { feeRange: [10000, 30000], durationWeeks: 6 },
  internationalScouting: { feeRange: [25000, 100000], durationWeeks: 16 },
};
```

Each advanced consulting type requires multiple employee-generated reports as deliverables, making the employee system essential:

- **Squad Audit:** Requires 10+ reports on a club's current squad players
- **Transfer Strategy:** Requires 5+ reports on transfer targets + a comparative analysis
- **Academy Review:** Requires 8+ youth reports from the club's academy region
- **International Scouting:** Requires 15+ reports from a specific foreign region (needs satellite office)

Add a `deliverables` field to `ConsultingContract`:
```typescript
export interface ConsultingDeliverable {
  type: "reports" | "analysis" | "presentation";
  description: string;
  required: number;
  delivered: number;
}
```

### 5.3 -- Tier 5: Legacy and industry influence

At tier 5, the player has "made it." New mechanics emphasize legacy over growth:

#### 5.3.1 -- Reputation multiplier
All reputation gains are doubled at tier 5. The player's name carries weight.

**File:** `/Users/tsc-001/talentscout/src/engine/career/progression.ts`

Add a tier-5 multiplier check wherever reputation is adjusted.

#### 5.3.2 -- Industry awards
Annual awards ceremony (triggered at season end) where the player's agency competes for:
- "Scout of the Year" -- Based on highest-quality reports submitted
- "Best Agency" -- Based on revenue + client satisfaction average
- "Discovery of the Year" -- Based on the best player discovery

Awards grant large reputation boosts (+15-25) and one-time cash bonuses.

**New file:** `/Users/tsc-001/talentscout/src/engine/finance/awards.ts`

#### 5.3.3 -- Mentee system
The player can take on an NPC "mentee" -- a junior scout who learns from the player and eventually becomes a semi-autonomous employee. This creates a narrative arc similar to a protege storyline.

**Implementation:** Reuse the `AgencyEmployee` type with a special `role: "mentee"` and custom weekly processing that emphasizes quality growth and narrative events.

Add to `AgencyEmployeeRole`:
```typescript
export type AgencyEmployeeRole = "scout" | "analyst" | "administrator" | "relationshipManager" | "mentee";
```

#### 5.3.4 -- Premium client tier
At tier 5, unlock "Platinum" retainer tier:
```typescript
5: { name: "Platinum", monthlyFeeRange: [25000, 50000], requiredReports: 10 },
```

These are only offered by the top clubs (reputation > 85) and require the player to have 80+ reputation.

### 5.4 -- Tier 4-5 Agency Screen enhancements

**File:** `/Users/tsc-001/talentscout/src/components/game/AgencyScreen.tsx`

Add tier-gated tabs:
- **Tier 3:** "Office" + "Employees" (existing, enhanced in Phase 2/4)
- **Tier 4:** + "Offices" (satellite management) + "Consulting" (advanced consulting pipeline)
- **Tier 5:** + "Legacy" (awards, mentees, industry standing, career statistics)

### Phase 5 Dependencies
- Phase 2 is required (employee productivity drives consulting deliverables)
- Phase 3 is recommended (client relationships affect consulting offers)
- Phase 4 is recommended (employee growth makes mentee system coherent)

### Phase 5 Checklist
- [ ] 5.1 International expansion engine module + satellite office UI
- [ ] 5.2 Advanced consulting types with deliverable requirements
- [ ] 5.3.1 Tier 5 reputation multiplier
- [ ] 5.3.2 Industry awards system
- [ ] 5.3.3 Mentee role and progression
- [ ] 5.3.4 Platinum retainer tier
- [ ] 5.4 Tier-gated Agency screen tabs

---

## File Change Summary

### New Files

| File | Phase | Description |
|------|-------|-------------|
| `src/engine/finance/employeeWork.ts` | 2 | Employee work simulation -- role-specific weekly processing |
| `src/engine/finance/clientRelationships.ts` | 3 | Client satisfaction, pitching, negotiation, renewals |
| `src/engine/finance/employeeEvents.ts` | 4 | Employee events -- poaching, training, personal, breakthrough |
| `src/engine/finance/internationalExpansion.ts` | 5 | Satellite offices, international expansion |
| `src/engine/finance/awards.ts` | 5 | Industry awards ceremony |
| `src/components/game/BusinessDevelopment.tsx` | 3 | Client relationship and pitch UI |

### Modified Files

| File | Phases | Changes |
|------|--------|---------|
| `src/engine/core/types.ts` | 2,3,4,5 | New interfaces, extended `AgencyEmployee`, new fields on `FinancialRecord` |
| `src/engine/finance/agency.ts` | 2,4 | Updated `hireEmployee()` signature, enhanced `processEmployeeWeek()` |
| `src/engine/finance/retainers.ts` | 3 | Retainer renewal system |
| `src/engine/finance/consulting.ts` | 5 | Advanced consulting types, deliverables |
| `src/engine/finance/index.ts` | 2,3,4,5 | Barrel exports for new modules |
| `src/engine/finance/saveMigration.ts` | 2,3,4,5 | Migration steps for new fields |
| `src/engine/career/progression.ts` | 5 | Tier 5 reputation multiplier |
| `src/stores/gameStore.ts` | 1,2,3,4 | Weekly processing changes, new store actions |
| `src/components/game/GameLayout.tsx` | 1 | Agency nav visibility, lock/preview states |
| `src/components/game/AgencyScreen.tsx` | 1,2,4,5 | Preview mode, assignments, activity log, events, tier tabs |
| `src/components/game/Dashboard.tsx` | 1 | Independent path business summary card |
| `src/components/game/FinancialDashboard.tsx` | 3 | Client satisfaction indicators on contract cards |

### Type Changes Summary (cumulative)

**`AgencyEmployee` additions (Phase 2+4):**
- `hiredWeek: number`
- `hiredSeason: number`
- `regionSpecialization?: string`
- `positionSpecialization?: string`
- `reportsGenerated: string[]`
- `currentAssignment?: EmployeeAssignment`
- `experience: number`
- `weeklyLog: EmployeeLogEntry[]`
- `regionFocusWeeks: number` (Phase 4)
- `onLeave?: boolean` (Phase 4)
- `leaveReturnWeek?: number` (Phase 4)

**`FinancialRecord` additions (Phase 3+5):**
- `clientRelationships: ClientRelationship[]`
- `pendingEmployeeEvents: EmployeeEvent[]`
- `satelliteOffices: SatelliteOffice[]`
- `awards: AwardRecord[]`

**New store actions (cumulative):**
- `assignAgencyEmployee(employeeId, assignment)` -- Phase 2
- `submitEmployeeReportToRetainer(reportId, clubId)` -- Phase 2
- `discardEmployeeReport(reportId)` -- Phase 2
- `pitchToClient(clubId, pitchType)` -- Phase 3
- `negotiateRetainer(contractId, desiredFee)` -- Phase 3
- `adjustEmployeeSalary(employeeId, newSalary)` -- Phase 4
- `resolveEmployeeEvent(eventId, optionIndex)` -- Phase 4
- `openSatelliteOffice(region)` -- Phase 5
- `closeSatelliteOffice(officeId)` -- Phase 5
- `assignEmployeeToSatellite(employeeId, officeId)` -- Phase 5

---

## Estimated Effort by Phase

| Phase | Scope | Engine LOC | UI LOC | Store LOC | Calendar Weeks |
|-------|-------|-----------|--------|----------|----------------|
| 1 | Visibility | ~20 | ~250 | ~30 | 1 |
| 2 | Employee productivity | ~400 | ~350 | ~80 | 2-3 |
| 3 | Business development | ~350 | ~300 | ~60 | 2 |
| 4 | Management depth | ~300 | ~200 | ~50 | 2 |
| 5 | Tier 4-5 content | ~400 | ~350 | ~60 | 2-3 |

**Total estimated:** 9-12 calendar weeks for a single developer.

---

## Design Decisions and Rationale

### ADR-1: Employee reports as distinct from player reports

**Decision:** Employee-generated `ScoutReport` objects use the employee's ID as `scoutId`, not the player's. They exist in the same `reports` record in game state.

**Rationale:** This preserves the pure-function architecture. Reports are reports regardless of who generated them. The UI distinguishes employee reports by checking if `scoutId` starts with `emp_`. This avoids a parallel report storage system and lets employee reports flow through existing marketplace and retainer delivery functions unchanged.

**Consequence:** Report quality metrics in career progression should filter by `scoutId === scout.id` to avoid counting employee output in the player's personal stats.

### ADR-2: Employee work output is probabilistic, not guaranteed

**Decision:** Employee scouts have a 30-70% chance per week of generating a report (based on quality/morale/fatigue), not a guaranteed output.

**Rationale:** Guaranteed output would make employees an obvious overpowered investment. Probabilistic output creates meaningful variance -- some weeks your team delivers, some they don't. This makes morale management feel impactful (low morale = lower chance) and prevents a degenerate strategy of hiring max scouts and auto-winning all retainers.

### ADR-3: Client relationships as a separate entity from retainer contracts

**Decision:** `ClientRelationship` is a persistent entity per club, while `RetainerContract` remains transactional. Relationships persist even when contracts end.

**Rationale:** This enables the business development loop. A club whose retainer expired isn't "lost" -- the relationship is "cooling" and can be re-engaged through pitching. It also enables referrals (satisfied clients recommend you) and creates meaningful long-term consequence for quality of service.

### ADR-4: Phase 1 requires zero engine changes

**Decision:** Phase 1 is purely UI/visibility changes. No new types, no new engine functions.

**Rationale:** This ensures Phase 1 can be shipped immediately with zero regression risk. It also validates the design by making the aspiration visible before the mechanics are built. Players should be excited about what they're working toward before they experience it.

---

## Assumptions

1. **Save compatibility:** The project already has a `saveMigration.ts` pattern for handling type changes. We assume new fields with defaults are safe to add without breaking existing saves.
2. **Performance:** Adding 5-12 `processEmployeeWork` calls per week is negligible compared to the existing weekly processing that already iterates over all players, fixtures, and reports.
3. **Report generation simplification:** Employee-generated reports will have simpler content than player-generated reports (no manual observation flow). The `attributeAssessments` array can be auto-generated from player data with noise applied based on employee quality.
4. **Calendar integration:** The mentoring activity (Phase 4.5) assumes the calendar system supports adding new activity types without structural changes (based on the existing `ActivityType` union pattern).
5. **UI framework:** All new UI uses the existing component library (Card, Button, Badge, etc.) and Tailwind classes. No new component library dependencies.
