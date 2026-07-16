/**
 * International expansion — satellite offices for tier 4+ agencies.
 */

import type {
  FinancialRecord,
  OfficeTier,
  SatelliteOffice,
  Scout,
} from "../core/types";
import { normalizeCountryKey } from "@/lib/country";

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
export const SATELLITE_OFFICE_CLOSURE_BASE_COST = 1000;

const HOME_BASE_RELOCATION_COSTS: Record<OfficeTier, number> = {
  home: 8_000,
  coworking: 12_000,
  small: 18_000,
  professional: 28_000,
  hq: 45_000,
};

export interface HomeBaseRelocationQuote {
  eligible: boolean;
  destination: string;
  cost: number;
  reason: string;
  targetOfficeId?: string;
}

export interface HomeBaseRelocationResult {
  scout: Scout;
  finances: FinancialRecord;
  quote: HomeBaseRelocationQuote;
}

type HomeBaseRelocationFinances = Pick<
  FinancialRecord,
  "office" | "satelliteOffices" | "balance"
>;

type HomeBaseRelocationScout = Pick<
  Scout,
  "homeCountry" | "careerPath" | "travelBooking" | "homeBaseRelocations"
>;

function canonicalCountry(country: string): string {
  return normalizeCountryKey(country) ?? country.trim().toLowerCase();
}

export function getSatelliteOfficeMonthlyCostTotal(
  finances: Pick<FinancialRecord, "satelliteOffices">,
): number {
  return finances.satelliteOffices.reduce((sum, office) => sum + office.monthlyCost, 0);
}

export function getSatelliteOfficeCostReferenceId(
  week: number,
  season: number,
): string {
  return `satellite-costs:s${season}w${week}`;
}

export function getHomeBaseRelocationQuote(
  finances: HomeBaseRelocationFinances,
  scout: HomeBaseRelocationScout,
  destination: string,
  week: number,
  season: number,
): HomeBaseRelocationQuote {
  const target = canonicalCountry(destination);
  const current = canonicalCountry(scout.homeCountry ?? "england");
  const cost = HOME_BASE_RELOCATION_COSTS[finances.office.tier];
  const targetOffice = finances.satelliteOffices.find(
    (office) => canonicalCountry(office.region) === target,
  );
  if (!target || target === current) {
    return { eligible: false, destination: target, cost, reason: "Choose an established office outside your current home base." };
  }
  if (scout.careerPath !== "independent") {
    return { eligible: false, destination: target, cost, reason: "Club-employed scouts cannot relocate the agency headquarters." };
  }
  if (scout.travelBooking) {
    return { eligible: false, destination: target, cost, reason: "Finish the current scouting trip before relocating headquarters." };
  }
  if (!targetOffice) {
    return { eligible: false, destination: target, cost, reason: "Build a satellite office in this country before committing the agency headquarters." };
  }
  if (targetOffice.openedSeason === season && week - targetOffice.openedWeek < 8) {
    return {
      eligible: false,
      destination: target,
      cost,
      targetOfficeId: targetOffice.id,
      reason: `The office must operate for ${8 - Math.max(0, week - targetOffice.openedWeek)} more week(s) before it can support headquarters.`,
    };
  }
  if (scout.homeBaseRelocations?.some((record) => record.season === season)) {
    return { eligible: false, destination: target, cost, targetOfficeId: targetOffice.id, reason: "Headquarters can move only once per season." };
  }
  if (finances.balance < cost) {
    return { eligible: false, destination: target, cost, targetOfficeId: targetOffice.id, reason: `The relocation requires £${cost.toLocaleString()} in available funds.` };
  }
  return {
    eligible: true,
    destination: target,
    cost,
    targetOfficeId: targetOffice.id,
    reason: "The established office can become headquarters. Your previous base will remain as an unstaffed satellite office.",
  };
}

/**
 * Convert an established satellite office into the permanent agency base.
 * The previous base remains in the network, but must be staffed again if the
 * player wants to preserve its strongest regional effects.
 */
export function relocateHomeBase(
  finances: FinancialRecord,
  scout: Scout,
  destination: string,
  week: number,
  season: number,
): HomeBaseRelocationResult | null {
  const quote = getHomeBaseRelocationQuote(finances, scout, destination, week, season);
  if (!quote.eligible || !quote.targetOfficeId) return null;

  const oldCountry = canonicalCountry(scout.homeCountry ?? "england");
  const actionSequence = (finances.actionSequence ?? 0) + 1;
  const relocationId = `base-relocation:s${season}:w${week}:a${actionSequence}`;
  const targetOffice = finances.satelliteOffices.find((office) => office.id === quote.targetOfficeId)!;
  const absorbedEmployeeIds = new Set(targetOffice.employeeIds);
  const oldBaseOffice: SatelliteOffice = {
    id: `sat_${oldCountry}_s${season}w${week}_a${actionSequence}`,
    region: oldCountry,
    monthlyCost: DEFAULT_MONTHLY_COST,
    qualityBonus: 0.10,
    maxEmployees: 3,
    employeeIds: [],
    openedWeek: week,
    openedSeason: season,
  };

  return {
    quote,
    scout: {
      ...scout,
      homeCountry: quote.destination,
      homeBaseRelocations: [
        ...(scout.homeBaseRelocations ?? []),
        {
          id: relocationId,
          fromCountry: oldCountry,
          toCountry: quote.destination,
          week,
          season,
          cost: quote.cost,
          convertedOfficeId: targetOffice.id,
        },
      ].slice(-8),
    },
    finances: {
      ...finances,
      actionSequence,
      balance: finances.balance - quote.cost,
      employees: finances.employees.map((employee) =>
        absorbedEmployeeIds.has(employee.id)
          ? {
              ...employee,
              weeklyLog: [
                ...employee.weeklyLog,
                {
                  week,
                  season,
                  action: `Regional office became agency headquarters in ${quote.destination}`,
                  result: "Role retained; previous-base coverage now requires a new assignment.",
                },
              ].slice(-16),
            }
          : employee,
      ),
      satelliteOffices: [
        ...finances.satelliteOffices.filter((office) =>
          office.id !== targetOffice.id
          && canonicalCountry(office.region) !== oldCountry,
        ),
        oldBaseOffice,
      ],
      transactions: [
        ...finances.transactions,
        {
          week,
          season,
          amount: -quote.cost,
          description: `Agency headquarters relocated: ${oldCountry} to ${quote.destination}`,
          referenceId: relocationId,
        },
      ],
    },
  };
}

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
  actionSequence = (finances.actionSequence ?? 0) + 1,
): FinancialRecord | null {
  const normalizedRegion = region.trim().toLowerCase();
  if (
    !normalizedRegion
    || finances.satelliteOffices.some(
      (office) => office.region.trim().toLowerCase() === normalizedRegion,
    )
  ) {
    return null;
  }
  const setupCost = SETUP_COSTS[region] ?? DEFAULT_SETUP_COST;
  if (finances.balance < setupCost) return null;

  const office: SatelliteOffice = {
    id: `sat_${region}_s${season}w${week}_a${actionSequence}`,
    region: normalizedRegion,
    monthlyCost: DEFAULT_MONTHLY_COST,
    qualityBonus: 0.10,
    maxEmployees: 3,
    employeeIds: [],
    openedWeek: week,
    openedSeason: season,
  };

  return {
    ...finances,
    actionSequence: Math.max(finances.actionSequence ?? 0, actionSequence),
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
  week: number,
  season: number,
): FinancialRecord {
  const office = finances.satelliteOffices.find((candidate) => candidate.id === officeId);
  if (!office) return finances;
  const affectedEmployees = new Set(office.employeeIds);
  const closureCost = SATELLITE_OFFICE_CLOSURE_BASE_COST + affectedEmployees.size * 500;
  const actionSequence = (finances.actionSequence ?? 0) + 1;
  return {
    ...finances,
    actionSequence,
    balance: finances.balance - closureCost,
    employees: finances.employees.map((employee) =>
      affectedEmployees.has(employee.id)
        ? {
            ...employee,
            morale: Math.max(0, employee.morale - 12),
            weeklyLog: [
              ...employee.weeklyLog,
              {
                week,
                season,
                action: `Satellite office closed in ${office.region}`,
                result: "Reassigned to the main operation; morale fell after the disruption.",
              },
            ].slice(-16),
          }
        : employee,
    ),
    satelliteOffices: finances.satelliteOffices.filter((o) => o.id !== officeId),
    transactions: [
      ...finances.transactions,
      {
        week,
        season,
        amount: -closureCost,
        description: `Satellite office closure and reassignment: ${office.region}`,
        referenceId: `satellite-close:${office.id}:s${season}:w${week}:a${actionSequence}`,
      },
    ],
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
  if (
    !office
    || !finances.employees.some((employee) => employee.id === employeeId)
    || (
      !office.employeeIds.includes(employeeId)
      && office.employeeIds.length >= office.maxEmployees
    )
  ) return finances;

  return {
    ...finances,
    satelliteOffices: finances.satelliteOffices.map((o) =>
      o.id === officeId
        ? {
            ...o,
            employeeIds: o.employeeIds.includes(employeeId)
              ? o.employeeIds
              : [...o.employeeIds, employeeId],
          }
        : { ...o, employeeIds: o.employeeIds.filter((id) => id !== employeeId) },
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
  const referenceId = getSatelliteOfficeCostReferenceId(week, season);
  if (finances.transactions.some((transaction) =>
    transaction.referenceId === referenceId
    || transaction.referenceId === `monthly-finance:s${season}w${week}:operating-expenses`
  )) {
    return finances;
  }

  const totalCost = getSatelliteOfficeMonthlyCostTotal(finances);

  return {
    ...finances,
    balance: finances.balance - totalCost,
    transactions: [
      ...finances.transactions,
      {
        week,
        season,
        amount: -totalCost,
        description: `Satellite office costs (${finances.satelliteOffices.length} offices)`,
        referenceId,
      },
    ],
  };
}
