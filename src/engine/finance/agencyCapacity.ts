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

export interface AgencyCapacity {
  monthlyReportCapacity: number;
  committedReportWork: number;
  availableReportCapacity: number;
  utilization: number;
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

export function getAgencyCapacity(
  finances: FinancialRecord,
  scout: Scout,
): AgencyCapacity {
  const base = BASE_REPORT_CAPACITY[scout.independentTier ?? 1];
  const officeBonus = Math.max(0, Math.floor((finances.office?.maxEmployees ?? 0) / 2));
  const monthlyReportCapacity = base + employeeCapacity(finances) + officeBonus;
  const retainerWork = finances.retainerContracts
    .filter((contract) => contract.status === "active" || contract.status === "suspended")
    .reduce((total, contract) => total + contract.requiredReportsPerMonth, 0);
  const consulting = finances.consultingContracts
    .filter((contract) => contract.status === "active")
    .reduce((total, contract) => total + consultingWork(contract), 0);
  const committedReportWork = retainerWork + consulting;
  const availableReportCapacity = Math.max(0, monthlyReportCapacity - committedReportWork);

  return {
    monthlyReportCapacity,
    committedReportWork,
    availableReportCapacity,
    utilization: monthlyReportCapacity > 0
      ? Math.min(2, committedReportWork / monthlyReportCapacity)
      : committedReportWork > 0 ? 2 : 0,
  };
}

export function canAcceptRetainerWork(
  finances: FinancialRecord,
  scout: Scout,
  contract: RetainerContract,
): boolean {
  return getAgencyCapacity(finances, scout).availableReportCapacity
    >= contract.requiredReportsPerMonth;
}

export function canAcceptConsultingWork(
  finances: FinancialRecord,
  scout: Scout,
  contract: ConsultingContract,
): boolean {
  return getAgencyCapacity(finances, scout).availableReportCapacity
    >= consultingWork(contract);
}
