import type { GameScreen } from "@/stores/gameStoreTypes";

export interface CareerDrilldownDefinition {
  screen: GameScreen;
  label: string;
  description: string;
}

/** Durable Career-hub routes for records that otherwise surface only in notifications. */
export const CAREER_RECORD_DRILLDOWNS = [
  {
    screen: "network",
    label: "Network",
    description: "Contacts, trust, obligations, and access",
  },
  {
    screen: "alumniDashboard",
    label: "Alumni",
    description: "Follow every placed prospect's career",
  },
  {
    screen: "performance",
    label: "Performance",
    description: "Accuracy, calibration, trends, and outcomes",
  },
  {
    screen: "achievements",
    label: "Achievements",
    description: "Current-build milestones and progress",
  },
] as const satisfies readonly CareerDrilldownDefinition[];

/** The Career tab owns finances; this drill-down retains its distinct contract and credit actions. */
export const CAREER_FINANCE_DRILLDOWN = {
  screen: "finances",
  label: "Open cashflow, contracts & credit",
  description: "Review forecasts, loans, retainers, consulting work, and transaction history.",
} as const satisfies CareerDrilldownDefinition;
