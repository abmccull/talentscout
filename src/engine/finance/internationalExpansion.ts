/**
 * International expansion — satellite offices for tier 4+ agencies.
 */

import type { FinancialRecord, SatelliteOffice } from "../core/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Override setup costs for specific regions (keyed by region name).
 * Any region not listed uses the default cost.
 */
const SETUP_COSTS: Record<string, number> = {};
const DEFAULT_SETUP_COST = 8000;
const DEFAULT_MONTHLY_COST = 1200;

// ---------------------------------------------------------------------------
// Office lifecycle
// ---------------------------------------------------------------------------

/**
 * Open a satellite office in the given region.
 * Deducts the setup cost from balance immediately.
 * Returns null if the scout cannot afford the setup cost.
 */
export function openSatelliteOffice(
  finances: FinancialRecord,
  region: string,
  week: number,
  season: number,
): FinancialRecord | null {
  const setupCost = SETUP_COSTS[region] ?? DEFAULT_SETUP_COST;
  if (finances.balance < setupCost) return null;

  const office: SatelliteOffice = {
    id: `sat_${region}_${Date.now()}`,
    region,
    monthlyCost: DEFAULT_MONTHLY_COST,
    qualityBonus: 0.10,
    maxEmployees: 3,
    employeeIds: [],
    openedWeek: week,
    openedSeason: season,
  };

  return {
    ...finances,
    balance: finances.balance - setupCost,
    satelliteOffices: [...finances.satelliteOffices, office],
    transactions: [
      ...finances.transactions,
      { week, season, amount: -setupCost, description: `Satellite office opened: ${region}` },
    ],
  };
}

/**
 * Close a satellite office, removing it from the list.
 * Any employees assigned to it should be reassigned separately.
 */
export function closeSatelliteOffice(
  finances: FinancialRecord,
  officeId: string,
): FinancialRecord {
  return {
    ...finances,
    satelliteOffices: finances.satelliteOffices.filter((o) => o.id !== officeId),
  };
}

// ---------------------------------------------------------------------------
// Employee assignment
// ---------------------------------------------------------------------------

/**
 * Assign an employee to a satellite office.
 * Returns unchanged finances if the office is full or not found.
 */
export function assignEmployeeToSatellite(
  finances: FinancialRecord,
  employeeId: string,
  officeId: string,
): FinancialRecord {
  const office = finances.satelliteOffices.find((o) => o.id === officeId);
  if (!office || office.employeeIds.length >= office.maxEmployees) return finances;

  return {
    ...finances,
    satelliteOffices: finances.satelliteOffices.map((o) =>
      o.id === officeId
        ? { ...o, employeeIds: [...o.employeeIds, employeeId] }
        : o,
    ),
  };
}

/**
 * Remove an employee from any satellite office they're assigned to.
 */
export function unassignEmployeeFromSatellite(
  finances: FinancialRecord,
  employeeId: string,
): FinancialRecord {
  return {
    ...finances,
    satelliteOffices: finances.satelliteOffices.map((o) => ({
      ...o,
      employeeIds: o.employeeIds.filter((id) => id !== employeeId),
    })),
  };
}

// ---------------------------------------------------------------------------
// Monthly cost processing
// ---------------------------------------------------------------------------

/**
 * Deduct monthly costs for all satellite offices.
 * Called at the end of each month (every 4 weeks).
 */
export function processSatelliteOfficeCosts(
  finances: FinancialRecord,
  week: number,
  season: number,
): FinancialRecord {
  if (week % 4 !== 0) return finances;
  if (finances.satelliteOffices.length === 0) return finances;

  const totalCost = finances.satelliteOffices.reduce((sum, o) => sum + o.monthlyCost, 0);

  return {
    ...finances,
    balance: finances.balance - totalCost,
    transactions: [
      ...finances.transactions,
      { week, season, amount: -totalCost, description: `Satellite office costs (${finances.satelliteOffices.length} offices)` },
    ],
  };
}
