import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FIRST_HOUR_FILES = [
  "src/components/game/GameLayout.tsx",
  "src/components/game/ObservationScreen.tsx",
  "src/components/game/observation/ObservationPitch.tsx",
  "src/components/game/ObservationPhase.tsx",
  "src/components/game/OpeningDiscoveryScreen.tsx",
  "src/components/game/ReportWriter.tsx",
  "src/components/game/InitialAssessmentBuilder.tsx",
  "src/components/game/calendar/PlannerWeekStrip.tsx",
  "src/components/game/calendar/TargetPicker.tsx",
  "src/components/game/calendar/PlannerOpportunitySheet.tsx",
  "src/components/game/dashboard/YouthDeskDashboard.tsx",
  "src/components/game/workspace/desk/YouthActiveCaseBoard.tsx",
] as const;

const LOCKED_PX = /text-\[(?:8|9|10|11)px\]/;

describe("first-hour type floor", () => {
  it("does not lock first-hour labels at 8–11px", () => {
    const hits = FIRST_HOUR_FILES.flatMap((relative) => {
      const source = readFileSync(resolve(process.cwd(), relative), "utf8");
      return LOCKED_PX.test(source) ? [relative] : [];
    });
    expect(hits).toEqual([]);
  });
});
