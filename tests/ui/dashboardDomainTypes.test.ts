import { describe, expectTypeOf, it } from "vitest";

import type {
  DashboardActionTarget as SharedDashboardActionTarget,
  DashboardPriorityCandidate as SharedDashboardPriorityCandidate,
  DashboardPriorityItem as SharedDashboardPriorityItem,
} from "@/engine/dashboard/types";
import type {
  DashboardActionTarget,
  DashboardPriorityCandidate,
  DashboardPriorityItem,
} from "@/components/game/dashboard/dashboardPriorityModel";

describe("dashboard domain type exports", () => {
  it("re-exports the shared dashboard domain types from the priority model", () => {
    expectTypeOf<DashboardActionTarget>().toEqualTypeOf<SharedDashboardActionTarget>();
    expectTypeOf<DashboardPriorityItem>().toEqualTypeOf<SharedDashboardPriorityItem>();
    expectTypeOf<DashboardPriorityCandidate>().toEqualTypeOf<SharedDashboardPriorityCandidate>();
  });
});
