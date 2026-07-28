"use client";

import type { DashboardPriorityCardProps } from "./DashboardPriorityCard";
import { DashboardPriorityCard } from "./DashboardPriorityCard";

export function DashboardOpportunityCard(props: Omit<DashboardPriorityCardProps, "variant">) {
  return <DashboardPriorityCard {...props} variant="opportunity" />;
}
