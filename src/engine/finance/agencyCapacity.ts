import type {
  ConsultingContract,
  FinancialRecord,
  IndependentTier,
  RetainerContract,
  Scout,
} from "../core/types";

const BASE_REPORT_CAPACITY: Record<IndependentTier, number> = {
  1: 2,
  2: 5,
  3: 9,
  4: 14,
  5: 22,
};

export type AgencyStrategicPosture =
  | "balanced"
  | "cashDefense"
  | "qualityFirst"
  | "diversifyClients"
  | "controlledGrowth";

export interface AgencyStrategicPostureRule {
  label: string;
  purpose: string;
  capacityMultiplier: number;
  qualityDebtAdjustment: number;
  reputationExposureAdjustment: number;
}

export const AGENCY_STRATEGIC_POSTURES: Record<
  AgencyStrategicPosture,
  AgencyStrategicPostureRule
> = {
  balanced: {
    label: "Balanced book",
    purpose: "Keep delivery, client development, and staff recovery in equilibrium.",
    capacityMultiplier: 1,
    qualityDebtAdjustment: 0,
    reputationExposureAdjustment: 0,
  },
  cashDefense: {
    label: "Defend the runway",
    purpose: "Freeze new fixed-cost commitments while the agency rebuilds cash resilience.",
    capacityMultiplier: 1,
    qualityDebtAdjustment: 3,
    reputationExposureAdjustment: 0,
  },
  qualityFirst: {
    label: "Protect the standard",
    purpose: "Reserve review time and accept less work so delegated output remains defensible.",
    capacityMultiplier: 0.8,
    qualityDebtAdjustment: -22,
    reputationExposureAdjustment: -8,
  },
  diversifyClients: {
    label: "Diversify the book",
    purpose: "Reserve commercial time and refuse work that deepens dependence on the dominant client.",
    capacityMultiplier: 0.85,
    qualityDebtAdjustment: -4,
    reputationExposureAdjustment: -5,
  },
  controlledGrowth: {
    label: "Press for growth",
    purpose: "Stretch near-term output to capture demand, accepting higher staff and reputation exposure.",
    capacityMultiplier: 1.15,
    qualityDebtAdjustment: 15,
    reputationExposureAdjustment: 12,
  },
};

const POSTURE_REFERENCE_PATTERN = /^agency-posture:(balanced|cashDefense|qualityFirst|diversifyClients|controlledGrowth):s(\d+)w(\d+)$/;

export interface RecordedAgencyStrategicPosture {
  posture: AgencyStrategicPosture;
  season: number;
  week: number;
  referenceId: string;
}

function parseAgencyStrategicPostureReference(
  referenceId?: string,
): RecordedAgencyStrategicPosture | undefined {
  const match = referenceId?.match(POSTURE_REFERENCE_PATTERN);
  if (!match) return undefined;
  return {
    posture: match[1] as AgencyStrategicPosture,
    season: Number.parseInt(match[2], 10),
    week: Number.parseInt(match[3], 10),
    referenceId: referenceId as string,
  };
}

export function getLatestAgencyStrategicPostureRecord(
  finances: FinancialRecord,
): RecordedAgencyStrategicPosture | undefined {
  for (let index = finances.transactions.length - 1; index >= 0; index -= 1) {
    const record = parseAgencyStrategicPostureReference(
      finances.transactions[index].referenceId,
    );
    if (record) return record;
  }
  return undefined;
}

export function getAgencyStrategicPostureRecordForWeek(
  finances: FinancialRecord,
  week: number,
  season: number,
): RecordedAgencyStrategicPosture | undefined {
  for (let index = finances.transactions.length - 1; index >= 0; index -= 1) {
    const record = parseAgencyStrategicPostureReference(
      finances.transactions[index].referenceId,
    );
    if (record?.week === week && record.season === season) return record;
  }
  return undefined;
}

export function getRecordedAgencyStrategicPosture(
  finances: FinancialRecord,
): AgencyStrategicPosture | undefined {
  return getLatestAgencyStrategicPostureRecord(finances)?.posture;
}

/** Legacy saves use balanced strategy until the player records a decision. */
export function getAgencyStrategicPosture(
  finances: FinancialRecord,
): AgencyStrategicPosture {
  return getRecordedAgencyStrategicPosture(finances) ?? "balanced";
}

export interface AgencyCapacity {
  rawMonthlyReportCapacity: number;
  monthlyReportCapacity: number;
  committedReportWork: number;
  availableReportCapacity: number;
  utilization: number;
  strategicCapacityAdjustment: number;
  posture: AgencyStrategicPosture;
}

export interface AgencyClientConcentration {
  activeClientCount: number;
  dominantClientId?: string;
  dominantShare: number;
  contractedValue: number;
  valueByClient: Record<string, number>;
}

export type AgencyWorkAcceptanceBlocker = "capacity" | "clientConcentration";

export interface AgencyWorkAcceptanceAssessment {
  allowed: boolean;
  blockers: AgencyWorkAcceptanceBlocker[];
  workRequired: number;
  capacity: AgencyCapacity;
  currentConcentration: AgencyClientConcentration;
  projectedConcentration: AgencyClientConcentration;
}

function employeeCapacity(finances: FinancialRecord): number {
  return finances.employees
    .filter((employee) => employee.role === "scout" && !employee.onLeave)
    .reduce((total, employee) => {
      const normalizedQuality = employee.quality <= 20
        ? employee.quality * 5
        : employee.quality;
      return total + Math.max(1, Math.round(normalizedQuality / 25));
    }, 0);
}

function consultingWork(contract: ConsultingContract): number {
  return (contract.deliverables ?? []).reduce((total, deliverable) => {
    const remaining = Math.max(0, deliverable.required - deliverable.delivered);
    return total + (deliverable.type === "reports" ? remaining : Math.ceil(remaining / 2));
  }, 0);
}

function addClientValue(
  valueByClient: Record<string, number>,
  clubId: string,
  amount: number,
): void {
  valueByClient[clubId] = (valueByClient[clubId] ?? 0) + Math.max(0, amount);
}

function summarizeClientConcentration(
  valueByClient: Record<string, number>,
): AgencyClientConcentration {
  const entries = Object.entries(valueByClient).filter(([, value]) => value > 0);
  const contractedValue = entries.reduce((total, [, value]) => total + value, 0);
  const dominant = entries.reduce<[string, number] | undefined>(
    (current, entry) => !current || entry[1] > current[1] ? entry : current,
    undefined,
  );
  return {
    activeClientCount: entries.length,
    dominantClientId: dominant?.[0],
    dominantShare: contractedValue > 0 ? (dominant?.[1] ?? 0) / contractedValue : 0,
    contractedValue,
    valueByClient,
  };
}

/**
 * Concentration is grouped by client, not by contract. Multiple retainers from
 * one club therefore remain one exposure rather than appearing diversified.
 */
export function getAgencyClientConcentration(
  finances: FinancialRecord,
  proposedWork?: { clubId: string; contractedValue: number },
): AgencyClientConcentration {
  const valueByClient: Record<string, number> = {};
  for (const contract of finances.retainerContracts) {
    if (contract.status !== "active" && contract.status !== "suspended") continue;
    addClientValue(valueByClient, contract.clubId, contract.monthlyFee);
  }
  for (const contract of finances.consultingContracts) {
    if (contract.status !== "active") continue;
    addClientValue(valueByClient, contract.clubId, contract.fee);
  }
  if (proposedWork) {
    addClientValue(
      valueByClient,
      proposedWork.clubId,
      proposedWork.contractedValue,
    );
  }
  return summarizeClientConcentration(valueByClient);
}

export function getAgencyCapacity(
  finances: FinancialRecord,
  scout: Scout,
): AgencyCapacity {
  const base = BASE_REPORT_CAPACITY[scout.independentTier ?? 1];
  const officeBonus = Math.max(0, Math.floor((finances.office?.maxEmployees ?? 0) / 2));
  const rawMonthlyReportCapacity = base + employeeCapacity(finances) + officeBonus;
  const posture = getAgencyStrategicPosture(finances);
  const monthlyReportCapacity = Math.max(
    1,
    Math.floor(
      rawMonthlyReportCapacity
      * AGENCY_STRATEGIC_POSTURES[posture].capacityMultiplier,
    ),
  );
  const retainerWork = finances.retainerContracts
    .filter((contract) => contract.status === "active" || contract.status === "suspended")
    .reduce((total, contract) => total + contract.requiredReportsPerMonth, 0);
  const consulting = finances.consultingContracts
    .filter((contract) => contract.status === "active")
    .reduce((total, contract) => total + consultingWork(contract), 0);
  const committedReportWork = retainerWork + consulting;
  const availableReportCapacity = Math.max(0, monthlyReportCapacity - committedReportWork);

  return {
    rawMonthlyReportCapacity,
    monthlyReportCapacity,
    committedReportWork,
    availableReportCapacity,
    utilization: monthlyReportCapacity > 0
      ? Math.min(2, committedReportWork / monthlyReportCapacity)
      : committedReportWork > 0 ? 2 : 0,
    strategicCapacityAdjustment: monthlyReportCapacity - rawMonthlyReportCapacity,
    posture,
  };
}

function assessAgencyWorkAcceptance(
  finances: FinancialRecord,
  scout: Scout,
  input: {
    clubId: string;
    contractedValue: number;
    workRequired: number;
  },
): AgencyWorkAcceptanceAssessment {
  const capacity = getAgencyCapacity(finances, scout);
  const currentConcentration = getAgencyClientConcentration(finances);
  const projectedConcentration = getAgencyClientConcentration(finances, {
    clubId: input.clubId,
    contractedValue: input.contractedValue,
  });
  const blockers: AgencyWorkAcceptanceBlocker[] = [];
  if (capacity.availableReportCapacity < input.workRequired) {
    blockers.push("capacity");
  }

  const deepensDominantDependency = capacity.posture === "diversifyClients"
    && currentConcentration.activeClientCount > 0
    && projectedConcentration.dominantClientId === input.clubId
    && projectedConcentration.dominantShare > 0.65;
  if (deepensDominantDependency) blockers.push("clientConcentration");

  return {
    allowed: blockers.length === 0,
    blockers,
    workRequired: input.workRequired,
    capacity,
    currentConcentration,
    projectedConcentration,
  };
}

export function assessRetainerWorkAcceptance(
  finances: FinancialRecord,
  scout: Scout,
  contract: RetainerContract,
): AgencyWorkAcceptanceAssessment {
  return assessAgencyWorkAcceptance(finances, scout, {
    clubId: contract.clubId,
    contractedValue: contract.monthlyFee,
    workRequired: contract.requiredReportsPerMonth,
  });
}

export function assessConsultingWorkAcceptance(
  finances: FinancialRecord,
  scout: Scout,
  contract: ConsultingContract,
): AgencyWorkAcceptanceAssessment {
  return assessAgencyWorkAcceptance(finances, scout, {
    clubId: contract.clubId,
    contractedValue: contract.fee,
    workRequired: consultingWork(contract),
  });
}

export function canAcceptRetainerWork(
  finances: FinancialRecord,
  scout: Scout,
  contract: RetainerContract,
): boolean {
  return assessRetainerWorkAcceptance(finances, scout, contract).allowed;
}

export function canAcceptConsultingWork(
  finances: FinancialRecord,
  scout: Scout,
  contract: ConsultingContract,
): boolean {
  return assessConsultingWorkAcceptance(finances, scout, contract).allowed;
}
