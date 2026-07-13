/**
 * Employee lifecycle events — poaching, training requests, personal issues, breakthroughs.
 */

import type { RNG } from "../rng/index";
import type {
  AgencyEmployee,
  FinancialRecord,
  EmployeeEvent,
  Scout,
} from "../core/types";
import {
  getEmployeePayEffects,
  getEmployeeSalaryBand,
  renegotiateEmployeeSalary,
} from "./employeeEconomics";
import {
  addGameWeeksWithSeasonLength,
  gameWeeksBetweenWithSeasonLength,
  LEGACY_SEASON_LENGTH_WEEKS,
} from "../core/gameDate";

// ---------------------------------------------------------------------------
// Event generation
// ---------------------------------------------------------------------------

/**
 * Check whether a random employee event fires this week.
 * Returns null if no event occurs or the employee is on leave.
 *
 * Event probabilities:
 *  - Poaching:         0.4%-12% from quality and visible pay position
 *  - Training request: 5%
 *  - Personal issue:   2%
 *  - Breakthrough:     3% (scout, quality > 10 only)
 */
export function checkEmployeeEvents(
  rng: RNG,
  employee: AgencyEmployee,
  finances: FinancialRecord,
  scout: Scout,
  week: number,
  season: number,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): EmployeeEvent | null {
  // On-leave employees don't generate events
  if (employee.onLeave) return null;

  // Poaching pressure is driven by visible employee quality and pay position.
  // Premium contracts substantially reduce, but never fully remove, the risk.
  const salaryBand = getEmployeeSalaryBand(employee, scout.reputation);
  const payEffects = getEmployeePayEffects(employee, scout.reputation);
  const qualityPressure = Math.max(0, Math.min(0.025, (employee.quality - 8) * 0.0025));
  const poachingChance = Math.max(
    0.004,
    Math.min(0.12, payEffects.poachingChance + qualityPressure),
  );
  const alreadyHasPoachingOffer = finances.pendingEmployeeEvents.some(
    (event) => event.employeeId === employee.id && event.type === "poaching",
  );
  if (employee.quality > 8 && !alreadyHasPoachingOffer && rng.chance(poachingChance)) {
    const rivalOffer = Math.min(
      salaryBand.maximum + Math.round(salaryBand.marketRate * 0.15),
      Math.max(salaryBand.fairMaximum, Math.round(salaryBand.marketRate * 1.2)),
    );
    const matchSalary = Math.min(
      salaryBand.maximum,
      Math.max(salaryBand.fairMinimum, Math.round(employee.salary * 1.2 / 25) * 25),
    );
    const deadline = addGameWeeksWithSeasonLength(
      { season, week },
      2,
      seasonLength,
    );
    return {
      id: `evt_poach_${employee.id}_s${season}_w${week}`,
      type: "poaching",
      employeeId: employee.id,
      description: `A rival agency is trying to poach ${employee.name} with a £${rivalOffer}/mo offer.`,
      options: [
        {
          label: `Match salary (£${matchSalary}/mo)`,
          cost: 0,
          moraleChange: 5,
          effect: "matchSalary",
          salary: matchSalary,
        },
        {
          label: "Let them go",
          cost: 0,
          moraleChange: 0,
          effect: "acceptPoach",
        },
      ],
      deadline: deadline.week,
      deadlineSeason: deadline.season,
    };
  }

  // Training request: employee wants professional development
  if (rng.chance(0.05)) {
    const trainingCost = Math.round(500 + employee.quality * 100);
    const deadline = addGameWeeksWithSeasonLength(
      { season, week },
      3,
      seasonLength,
    );
    return {
      id: `evt_train_${employee.id}_s${season}_w${week}`,
      type: "trainingRequest",
      employeeId: employee.id,
      description: `${employee.name} wants to attend a professional development course.`,
      options: [
        {
          label: `Fund training (£${trainingCost})`,
          cost: trainingCost,
          moraleChange: 10,
          effect: "fundTraining",
        },
        {
          label: "Decline",
          cost: 0,
          moraleChange: -8,
          effect: "declineTraining",
        },
      ],
      deadline: deadline.week,
      deadlineSeason: deadline.season,
    };
  }

  // Personal issue: employee requests time off
  if (rng.chance(0.02)) {
    const deadline = addGameWeeksWithSeasonLength(
      { season, week },
      1,
      seasonLength,
    );
    return {
      id: `evt_personal_${employee.id}_s${season}_w${week}`,
      type: "personalIssue",
      employeeId: employee.id,
      description: `${employee.name} has requested time off for personal reasons.`,
      options: [
        {
          label: "Grant leave (2 weeks)",
          cost: 0,
          moraleChange: 10,
          effect: "grantLeave",
        },
        {
          label: "Deny request",
          cost: 0,
          moraleChange: -15,
          effect: "denyLeave",
        },
      ],
      deadline: deadline.week,
      deadlineSeason: deadline.season,
    };
  }

  // Breakthrough: high-quality scout discovers promising talent
  if (employee.role === "scout" && employee.quality > 10 && rng.chance(0.03)) {
    const deadline = addGameWeeksWithSeasonLength(
      { season, week },
      4,
      seasonLength,
    );
    return {
      id: `evt_break_${employee.id}_s${season}_w${week}`,
      type: "breakthrough",
      employeeId: employee.id,
      description: `${employee.name} discovered a promising talent during their scouting work!`,
      options: [
        {
          label: "Review the find",
          cost: 0,
          moraleChange: 5,
          effect: "ignore",
        },
      ],
      deadline: deadline.week,
      deadlineSeason: deadline.season,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Event resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a pending employee event by selecting one of its options.
 * Applies cost, morale changes, and any special effects (leave, salary match, etc.).
 * Removes the event from pendingEmployeeEvents.
 */
export function resolveEmployeeEvent(
  finances: FinancialRecord,
  eventId: string,
  optionIndex: number,
  week: number,
  season: number,
  employerReputation = 50,
): FinancialRecord {
  const event = finances.pendingEmployeeEvents.find((e) => e.id === eventId);
  if (!event) return finances;

  const option = event.options[optionIndex];
  if (!option) return finances;

  // Remove the resolved event
  let updated: FinancialRecord = {
    ...finances,
    pendingEmployeeEvents: finances.pendingEmployeeEvents.filter((e) => e.id !== eventId),
  };

  // Apply financial cost
  if (option.cost) {
    updated = {
      ...updated,
      balance: updated.balance - option.cost,
      transactions: [
        ...updated.transactions,
        {
          week,
          season,
          amount: -option.cost,
          description: `Employee event: ${event.type}`,
          referenceId: `employee-event-cost:${event.id}:${optionIndex}`,
        },
      ],
    };
  }

  // Apply morale change and per-effect special logic to the target employee
  updated = {
    ...updated,
    employees: updated.employees.map((emp) => {
      if (emp.id !== event.employeeId) return emp;

      switch (option.effect) {
        case "matchSalary":
          return {
            ...emp,
            morale: Math.min(100, emp.morale + option.moraleChange),
          };

        case "acceptPoach":
          // Employee will be removed in the filter step below
          return emp;

        case "grantLeave":
          return {
            ...emp,
            morale: Math.min(100, emp.morale + option.moraleChange),
            onLeave: true,
            leaveReturnWeek: 2,
          };

        case "denyLeave":
          return { ...emp, morale: Math.max(5, emp.morale + option.moraleChange) };

        case "fundTraining": {
          // If employee has skills, boost XP on weakest skill
          if (emp.skills) {
            const levels = [emp.skills.skill1, emp.skills.skill2, emp.skills.skill3];
            const weakestIdx = levels.indexOf(Math.min(...levels));
            const newSkills = { ...emp.skills };
            if (weakestIdx === 0) newSkills.xp1 += 30;
            else if (weakestIdx === 1) newSkills.xp2 += 30;
            else newSkills.xp3 += 30;
            return {
              ...emp,
              morale: Math.min(100, emp.morale + option.moraleChange),
              experience: emp.experience + 50,
              skills: newSkills,
            };
          }
          return {
            ...emp,
            morale: Math.min(100, emp.morale + option.moraleChange),
            experience: emp.experience + 50,
          };
        }

        case "declineTraining":
          return { ...emp, morale: Math.max(5, emp.morale + option.moraleChange) };

        default:
          // "ignore" and any unhandled effects — just apply morale change
          return { ...emp, morale: Math.min(100, Math.max(5, emp.morale + option.moraleChange)) };
      }
    }),
  };

  if (option.effect === "matchSalary") {
    const target = updated.employees.find((employee) => employee.id === event.employeeId);
    if (target) {
      const band = getEmployeeSalaryBand(target, employerReputation);
      const requestedSalary = option.salary
        ?? Math.min(
          band.maximum,
          Math.max(band.fairMinimum, Math.round(target.salary * 1.2 / 25) * 25),
        );
      updated = renegotiateEmployeeSalary(
        updated,
        target.id,
        requestedSalary,
        employerReputation,
        week,
        season,
      );
    }
  }

  // Remove poached employee
  if (option.effect === "acceptPoach") {
    updated = {
      ...updated,
      employees: updated.employees.filter((e) => e.id !== event.employeeId),
    };
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Deadline expiry
// ---------------------------------------------------------------------------

/**
 * Expire any employee events whose deadline has passed.
 * Expired events are removed; the "ignore" effect (no morale penalty) is applied
 * since no action was taken.
 */
export function expireEmployeeEvents(
  finances: FinancialRecord,
  week: number,
  season: number,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): FinancialRecord {
  const { expired, remaining } = finances.pendingEmployeeEvents.reduce<{
    expired: EmployeeEvent[];
    remaining: EmployeeEvent[];
  }>(
    (acc, event) => {
      // Normalize pre-authority saves whose deadline overflowed the authored
      // season (for example S1 W40 in a 38-week competition).
      const deadline = addGameWeeksWithSeasonLength(
        { season: event.deadlineSeason, week: 1 },
        Math.max(0, event.deadline - 1),
        seasonLength,
      );
      const isPastDeadline = gameWeeksBetweenWithSeasonLength(
        deadline,
        { season, week },
        seasonLength,
      ) > 0;
      if (isPastDeadline) {
        acc.expired.push(event);
      } else {
        acc.remaining.push(event);
      }
      return acc;
    },
    { expired: [], remaining: [] },
  );

  if (expired.length === 0) return finances;

  return { ...finances, pendingEmployeeEvents: remaining };
}
