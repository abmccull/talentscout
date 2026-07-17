/**
 * Employee work simulation — processes weekly employee assignments
 * and generates output (reports, quality bonuses, client leads, admin savings).
 */

import type { RNG } from "../rng/index";
import type {
  FinancialRecord,
  AgencyEmployee,
  EmployeeLogEntry,
  Player,
  Club,
  Scout,
  ScoutReport,
  AttributeAssessment,
  PlayerAttribute,
  Position,
} from "../core/types";
import { ATTRIBUTE_DOMAINS } from "../core/types";
import {
  appendAnalystReview,
  createAnalystReviewArtifact,
  formatAnalystEvidenceCategory,
  formatAnalystReviewBias,
  MAX_AVAILABLE_ANALYST_REVIEWS,
} from "./analystReviews";
import { addGameWeeksWithSeasonLength } from "../core/gameDate";

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

export interface EmployeeWorkResult {
  finances: FinancialRecord;
  generatedReports: ScoutReport[];
  logEntries: EmployeeLogEntry[];
  inboxMessages: Array<{ title: string; body: string }>;
}

// ---------------------------------------------------------------------------
// Efficiency helpers
// ---------------------------------------------------------------------------

/**
 * Compute an efficiency multiplier [0, 1] for an employee based on morale and fatigue.
 * Quality contribution is factored in separately at call sites.
 */
export function getEmployeeEfficiency(employee: AgencyEmployee): number {
  const moraleFactor = employee.morale / 100;
  const fatigueFactor = 1 - employee.fatigue / 200;
  const qualityFactor = employee.quality / 20;
  // Compensation satisfaction changes output by at most -12%/+4%. Quality,
  // morale, and fatigue remain the primary drivers, so premium pay helps but
  // never becomes a dominant substitute for good management.
  const paySatisfaction = Math.max(
    0,
    Math.min(100, employee.paySatisfaction ?? 65),
  );
  const payFactor = Math.max(0.88, Math.min(1.04, 0.88 + paySatisfaction * 0.0016));
  return Math.max(0, Math.min(1, moraleFactor * fatigueFactor * qualityFactor * payFactor));
}

/** Resolve the office whose quality modifier actually applies to this employee. */
export function getEmployeeOfficeQualityBonus(
  finances: Pick<FinancialRecord, "office" | "satelliteOffices">,
  employeeId: string,
): number {
  return finances.satelliteOffices.find((office) =>
    office.employeeIds.includes(employeeId),
  )?.qualityBonus ?? finances.office.qualityBonus ?? 0;
}

// ---------------------------------------------------------------------------
// Internal: scout work
// ---------------------------------------------------------------------------

/**
 * A small subset of observable attributes that field scouts can assess in one week.
 * Hidden attributes are excluded — they require sustained observation.
 */
const OBSERVABLE_ATTRIBUTES: readonly PlayerAttribute[] = [
  "firstTouch",
  "passing",
  "dribbling",
  "shooting",
  "pace",
  "strength",
  "stamina",
  "composure",
  "positioning",
  "workRate",
  "offTheBall",
  "vision",
];

function processScoutWork(
  rng: RNG,
  emp: AgencyEmployee,
  efficiency: number,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  result: EmployeeWorkResult,
  week: number,
  season: number,
): void {
  // Determine which players are in the target region (approximate via nationality / club location).
  // We use nationality as a proxy for region since Player has no explicit region field.
  const assignment = emp.currentAssignment;
  const targetRegion = assignment?.targetRegion ?? emp.regionSpecialization;
  const activeClient = assignment?.targetClubId
    ? result.finances.retainerContracts.find((contract) =>
        contract.clubId === assignment.targetClubId && contract.status === "active"
      )
    : result.finances.retainerContracts
        .filter((contract) =>
          contract.status === "active"
          && contract.reportsDeliveredThisMonth < contract.requiredReportsPerMonth
        )
        .sort((left, right) =>
          (right.requiredReportsPerMonth - right.reportsDeliveredThisMonth)
          - (left.requiredReportsPerMonth - left.reportsDeliveredThisMonth)
          || left.id.localeCompare(right.id)
        )[0];

  // Pick a candidate player
  const playerList = Object.values(players);
  if (playerList.length === 0) {
    result.logEntries.push({ week, season, action: `${emp.name} found no players to scout this week.` });
    return;
  }

  let candidates: Player[];
  if (targetRegion) {
    // Filter by nationality matching the region string (case-insensitive partial match)
    const regionLower = targetRegion.toLowerCase();
    const regional = playerList.filter((p) => p.nationality.toLowerCase().includes(regionLower));
    candidates = regional.length > 0 ? regional : playerList;
  } else if (assignment?.targetPlayerId) {
    const specific = players[assignment.targetPlayerId];
    candidates = specific ? [specific] : playerList;
  } else {
    candidates = playerList;
  }

  if (activeClient) {
    const briefMatches = candidates.filter((player) => {
      const ownerClubId = player.contractClubId ?? player.clubId;
      if (ownerClubId === activeClient.clubId) return false;
      if (!activeClient.brief) return true;
      return activeClient.brief.targetPositions.includes(player.position)
        && player.age >= activeClient.brief.ageRange[0]
        && player.age <= activeClient.brief.ageRange[1];
    });
    if (briefMatches.length > 0) candidates = briefMatches;
  }

  // Report generation chance scales with coverage skill (skill1) + efficiency
  const coverage = emp.skills?.skill1 ?? emp.quality;
  const reportChance = Math.min(0.95, 0.3 + (coverage / 20) * 0.4 * efficiency);
  if (!rng.chance(reportChance)) {
    result.logEntries.push({
      week,
      season,
      action: `${emp.name} scouted this week but found nothing report-worthy.`,
    });
    return;
  }

  const target = rng.pick(candidates);

  // Build attribute assessments for a sample of observable attributes
  const numAttributes = Math.max(2, Math.round(3 + emp.quality * 0.3));
  const shuffled = rng.shuffle(OBSERVABLE_ATTRIBUTES).slice(0, numAttributes);

  const assessments: AttributeAssessment[] = shuffled.map((attr) => {
    const trueVal = target.attributes[attr] ?? rng.nextInt(5, 15);
    // Error range narrows as accuracy skill (skill2) improves; acc 3 → ±4, acc 15 → ±1
    const accuracy = emp.skills?.skill2 ?? emp.quality;
    const error = Math.max(1, Math.round(4 - (accuracy / 20) * 3));
    const estimate = Math.max(1, Math.min(20, trueVal + rng.nextInt(-error, error)));
    const halfWidth = Math.max(1, error);
    return {
      attribute: attr,
      estimatedValue: estimate,
      confidenceRange: [Math.max(1, estimate - halfWidth), Math.min(20, estimate + halfWidth)] as [number, number],
      domain: ATTRIBUTE_DOMAINS[attr],
    };
  });

  // Office quality bonus applies a small upward nudge to report quality score
  const officeBonus = getEmployeeOfficeQualityBonus(result.finances, emp.id);
  const qualityScore = Math.min(100, Math.round(
    (emp.quality / 20) * 60 + efficiency * 30 + officeBonus * 100,
  ));

  const reportId = `rpt_emp_${emp.id}_${week}_${season}_${rng.nextInt(1000, 9999)}`;

  const report: ScoutReport = {
    id: reportId,
    playerId: target.id,
    scoutId: emp.id,
    submittedWeek: week,
    submittedSeason: season,
    attributeAssessments: assessments,
    strengths: [],
    weaknesses: [],
    conviction: (emp.skills?.skill3 ?? emp.quality) >= 14 ? "recommend" : "note",
    summary: `Employee scout report on ${target.firstName} ${target.lastName} filed by ${emp.name}.`,
    estimatedValue: target.marketValue,
    qualityScore,
    intendedClubId: activeClient?.clubId ?? assignment?.targetClubId,
    intendedAudience: activeClient ? "client" : undefined,
  };

  result.generatedReports.push(report);

  // Track report IDs on the employee
  const updatedEmployees = result.finances.employees.map((e) =>
    e.id === emp.id
      ? { ...e, reportsGenerated: [...e.reportsGenerated, reportId] }
      : e,
  );
  result.finances = { ...result.finances, employees: updatedEmployees };

  result.logEntries.push({
    week,
    season,
    action: `${emp.name} filed a report on ${target.firstName} ${target.lastName}.`,
    result: `Quality score: ${qualityScore}`,
    reportId,
  });
}

// ---------------------------------------------------------------------------
// Internal: analyst work
// ---------------------------------------------------------------------------

function processAnalystWork(
  emp: AgencyEmployee,
  efficiency: number,
  result: EmployeeWorkResult,
  reports: Record<string, ScoutReport>,
  scoutId: string,
  week: number,
  season: number,
): void {
  const review = createAnalystReviewArtifact({
    employee: emp,
    efficiency,
    reports,
    scoutId,
    existingReviews: result.finances.analystReviews,
    week,
    season,
  });

  if (!review) {
    const availableCount = result.finances.analystReviews.filter(
      (candidate) => candidate.status === "available",
    ).length;
    const resultCopy = availableCount >= MAX_AVAILABLE_ANALYST_REVIEWS
      ? `Review queue full (${availableCount}/${MAX_AVAILABLE_ANALYST_REVIEWS})`
      : "This week's review is already recorded";
    result.logEntries.push({
      week,
      season,
      action: `${emp.name} could not add another analyst review.`,
      result: resultCopy,
    });
    return;
  }

  result.finances = appendAnalystReview(result.finances, review);
  const category = formatAnalystEvidenceCategory(review.evidenceCategory);
  const bias = formatAnalystReviewBias(review.bias);
  const target = review.scope === "reportRevision"
    ? `revision ${review.sourceReportId}`
    : "the next eligible report";

  result.logEntries.push({
    week,
    season,
    action: `${emp.name} completed an evidence review for ${target}.`,
    result: `${category}; +${review.craftQualityBonus} craft points available`,
  });

  result.inboxMessages.push({
    title: `Analyst Review Ready: ${category}`,
    body: `${emp.name} reviewed ${target}.\n\nCritique: ${review.critique}\n\nMethod bias — ${bias}: ${review.biasDisclosure}\n\nThis review adds ${review.craftQualityBonus} craft points to one eligible report and is consumed when that report is filed.`,
  });
}

// ---------------------------------------------------------------------------
// Internal: administrator work
// ---------------------------------------------------------------------------

function processAdminWork(
  rng: RNG,
  emp: AgencyEmployee,
  efficiency: number,
  result: EmployeeWorkResult,
  week: number,
  season: number,
): void {
  // Administrators reduce overhead by auto-processing admin tasks.
  // Represented as a small transaction credit proportional to quality.
  const costControl = emp.skills?.skill1 ?? emp.quality;
  const savingPercent = costControl * 0.5 * efficiency; // up to ~37.5% at cost control 15, efficiency 1
  const overheadCredit = Math.round((result.finances.office.monthlyCost * savingPercent) / 100 / 4); // weekly fraction
  const referenceId = `admin-saving:${emp.id}:s${season}w${week}`;

  if (
    overheadCredit > 0
    && !result.finances.transactions.some((transaction) =>
      transaction.referenceId === referenceId
    )
  ) {
    result.finances = {
      ...result.finances,
      balance: result.finances.balance + overheadCredit,
      transactions: [
        ...result.finances.transactions,
        {
          week,
          season,
          amount: overheadCredit,
          description: `Admin efficiency saving (${emp.name})`,
          referenceId,
          category: "operatingCost",
        },
      ],
    };

    result.logEntries.push({
      week,
      season,
      action: `${emp.name} handled admin duties, saving £${overheadCredit} in overhead.`,
      result: `+£${overheadCredit}`,
    });
  } else {
    result.logEntries.push({ week, season, action: `${emp.name} handled routine admin duties.` });
  }
}

// ---------------------------------------------------------------------------
// Internal: relationship manager work
// ---------------------------------------------------------------------------

function processRelationshipManagerWork(
  rng: RNG,
  emp: AgencyEmployee,
  efficiency: number,
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  scout: Scout,
  result: EmployeeWorkResult,
  week: number,
  season: number,
): void {
  // 10–25% chance per week of generating a new retainer lead (governed by prospecting skill).
  const prospecting = emp.skills?.skill1 ?? emp.quality;
  const leadChance = Math.min(0.25, 0.10 + (prospecting / 20) * 0.15 * efficiency);
  if (!rng.chance(leadChance)) {
    result.logEntries.push({ week, season, action: `${emp.name} worked client relationships — no new leads this week.` });
    return;
  }

  const clubList = Object.values(clubs);
  if (clubList.length === 0) {
    result.logEntries.push({ week, season, action: `${emp.name} found no clubs to pitch to this week.` });
    return;
  }

  // Pick a club that doesn't already have an active retainer
  const activeClubIds = new Set(
    result.finances.retainerContracts.filter((r) => r.status === "active").map((r) => r.clubId),
  );
  const pendingClubIds = new Set(result.finances.pendingRetainerOffers.map((r) => r.clubId));

  const blacklistedClubIds = new Set(result.finances.blacklistedClubs ?? []);
  const available = clubList.filter((c) =>
    !activeClubIds.has(c.id)
    && !pendingClubIds.has(c.id)
    && !blacklistedClubIds.has(c.id)
  );
  if (available.length === 0) {
    result.logEntries.push({
      week,
      season,
      action: `${emp.name} worked the market, but every suitable club is already covered.`,
    });
    return;
  }
  const prospect = rng.pick(available);

  const tier = prospect.reputation >= 75 ? 3 : prospect.reputation >= 40 ? 2 : 1;
  const feeRanges: Record<number, [number, number]> = {
    1: [500, 1000],
    2: [1500, 3000],
    3: [4000, 8000],
  };
  const [minFee, maxFee] = feeRanges[tier] ?? [500, 1000];

  // Negotiation skill (skill3) biases the roll toward maxFee
  const negotiation = emp.skills?.skill3 ?? emp.quality;
  const feeRoll = rng.nextInt(minFee, maxFee);
  const negotiationBonus = Math.round((maxFee - minFee) * (negotiation / 20) * 0.3);
  const monthlyFee = Math.min(maxFee, feeRoll + negotiationBonus);
  const offerExpiry = addGameWeeksWithSeasonLength({ week, season }, 3);
  const positions: Position[] = ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"];
  const roster = prospect.playerIds.map((playerId) => players[playerId]).filter(Boolean);
  const targetPosition = positions
    .map((position) => ({
      position,
      count: roster.filter((player) => player.position === position).length,
    }))
    .sort((left, right) => left.count - right.count || left.position.localeCompare(right.position))[0].position;

  const offer = {
    id: `retainer_${prospect.id}_rm_${week}_${season}`,
    clubId: prospect.id,
    tier: tier as 1 | 2 | 3 | 4 | 5,
    monthlyFee,
    requiredReportsPerMonth: tier + 1,
    reportsDeliveredThisMonth: 0,
    status: "active" as const,
    brief: {
      focus: prospect.scoutingPhilosophy === "academyFirst" ? "academy" as const : "firstTeam" as const,
      targetPositions: [targetPosition],
      ageRange: prospect.scoutingPhilosophy === "academyFirst" ? [15, 20] as [number, number] : [18, 27] as [number, number],
      minimumReportQuality: 48 + tier * 6,
      description: `${prospect.name} wants decision-ready intelligence at ${targetPosition}.`,
    },
    offeredWeek: week,
    offeredSeason: season,
    offerExpiresWeek: offerExpiry.week,
    offerExpiresSeason: offerExpiry.season,
    termMonths: 3,
    deliveredReportIds: [],
    averageDeliveredQuality: 0,
    consecutivePeriodsMet: 0,
    consecutivePeriodsMissed: 0,
  };

  result.finances = {
    ...result.finances,
    pendingRetainerOffers: [...result.finances.pendingRetainerOffers, offer],
  };

  result.logEntries.push({
    week,
    season,
    action: `${emp.name} secured a retainer lead from ${prospect.name}.`,
    result: `Tier ${tier} offer — £${offer.monthlyFee}/mo`,
  });

  result.inboxMessages.push({
    title: "New Retainer Lead",
    body: `${emp.name} has negotiated a Tier ${tier} retainer offer from ${prospect.name} (£${offer.monthlyFee}/mo). Review in your contracts panel.`,
  });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Process all active employee assignments for one week.
 * Returns updated finances, any generated scout reports, log entries, and inbox messages.
 */
export function processEmployeeWork(
  rng: RNG,
  finances: FinancialRecord,
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  scout: Scout,
  reports: Record<string, ScoutReport>,
  week: number,
  season: number,
): EmployeeWorkResult {
  const result: EmployeeWorkResult = {
    finances: {
      ...finances,
      analystReviews: finances.analystReviews ?? [],
    },
    generatedReports: [],
    logEntries: [],
    inboxMessages: [],
  };

  const updatedEmployees = [...result.finances.employees];

  for (let i = 0; i < updatedEmployees.length; i++) {
    const emp = updatedEmployees[i];

    if (emp.onLeave) {
      result.logEntries.push({ week, season, action: `${emp.name} is on leave.` });
      continue;
    }

    if (!emp.currentAssignment || emp.currentAssignment.type === "idle") {
      result.logEntries.push({ week, season, action: `${emp.name} is idle — no assignment.` });
      continue;
    }

    const efficiency = getEmployeeEfficiency(emp);

    switch (emp.role) {
      case "scout":
      case "mentee":
        processScoutWork(rng, emp, efficiency, players, clubs, result, week, season);
        break;
      case "analyst":
        processAnalystWork(
          emp,
          efficiency,
          result,
          reports,
          scout.id,
          week,
          season,
        );
        break;
      case "administrator":
        processAdminWork(rng, emp, efficiency, result, week, season);
        break;
      case "relationshipManager":
        processRelationshipManagerWork(
          rng,
          emp,
          efficiency,
          clubs,
          players,
          scout,
          result,
          week,
          season,
        );
        break;
    }

    // Update the employee's weekly log (keep last 8 entries)
    const empLogEntries = result.logEntries.filter((l) => l.action.startsWith(emp.name));
    const latestEntry = empLogEntries[empLogEntries.length - 1];
    if (latestEntry) {
      // Find the current version of this employee in updatedEmployees (may have been updated above)
      const currentEmpInUpdated = result.finances.employees.find((e) => e.id === emp.id);
      if (currentEmpInUpdated) {
        const newLog = [...currentEmpInUpdated.weeklyLog, latestEntry].slice(-8);
        const finalEmployees = result.finances.employees.map((e) =>
          e.id === emp.id ? { ...e, weeklyLog: newLog } : e,
        );
        result.finances = { ...result.finances, employees: finalEmployees };
      }
    }
  }

  return result;
}
