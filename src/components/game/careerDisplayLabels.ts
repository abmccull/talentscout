import type { Specialization } from "@/engine/core/types";
import type { CareerSignaturePillar } from "@/engine/career/legacySignature";

export const CAREER_PILLAR_LABELS: Record<CareerSignaturePillar, string> = {
  guardian: "Guardian",
  calibrator: "Calibrator",
  pathwayBuilder: "Pathway Builder",
  connector: "Connector",
  departmentSteward: "Department Steward",
  territoryReader: "Territory Reader",
};

export const SCOUT_SPECIALIZATION_LABELS: Record<Specialization, string> = {
  youth: "Youth",
  firstTeam: "First Team",
  regional: "Regional",
  data: "Data",
};
