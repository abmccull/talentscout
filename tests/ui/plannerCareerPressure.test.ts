import { describe, expect, it } from "vitest";
import type { CareerFingerprintProjection } from "@/engine/career/fingerprint";
import { buildPlannerCareerPressure } from "@/components/game/calendar/plannerCareerPressure";

function projection(
  overrides: Partial<CareerFingerprintProjection> = {},
): CareerFingerprintProjection {
  return {
    title: "Conviction scout",
    summary: "A distinct career.",
    comparisonKey: "conviction|academy-reckoning",
    fingerprintId: "career-fingerprint-1",
    labels: [
      {
        id: "identity",
        label: "Identity",
        value: "Conviction scout",
        detail: "A decisive evaluator.",
        tone: "sky",
      },
      {
        id: "world",
        label: "World",
        value: "Academy squeeze",
        detail: "Pathways are unusually scarce.",
        tone: "violet",
      },
      {
        id: "thread",
        label: "Current thread",
        value: "Build the record",
        detail: "Recommendations are defining the career.",
        tone: "sky",
      },
      {
        id: "territory",
        label: "Territory",
        value: "Selective around Ghana",
        detail: "Coverage can deepen or broaden.",
        tone: "amber",
      },
      {
        id: "pressure",
        label: "Live front",
        value: "Family promises live",
        detail: "Two obligations can redirect trust.",
        tone: "red",
      },
    ],
    ...overrides,
  };
}

describe("buildPlannerCareerPressure", () => {
  it("turns the most urgent live front into a scheduling question", () => {
    const result = buildPlannerCareerPressure(projection());

    expect(result.kind).toBe("pressure");
    expect(result.value).toBe("Family promises live");
    expect(result.schedulingQuestion).toMatch(/protects this relationship or rival front/i);
    expect(result.opportunityCost).toMatch(/selective around ghana/i);
    expect(result.fingerprintId).toBe("career-fingerprint-1");
  });

  it("prioritizes a recovery chapter when multiple fronts are critical", () => {
    const input = projection();
    input.labels = input.labels.map((label) =>
      label.id === "thread"
        ? {
            ...label,
            value: "Comeback chapter",
            detail: "The next choice must demonstrate change.",
            tone: "red" as const,
          }
        : label,
    );

    const result = buildPlannerCareerPressure(input);

    expect(result.kind).toBe("thread");
    expect(result.value).toBe("Comeback chapter");
    expect(result.schedulingQuestion).toMatch(/advances this career chapter/i);
  });

  it("falls back to the world condition when no stronger pressure is active", () => {
    const input = projection();
    input.labels = input.labels.map((label) => {
      if (label.id === "world") return { ...label, tone: "violet" as const };
      if (label.id === "thread" || label.id === "territory" || label.id === "pressure") {
        return { ...label, tone: "emerald" as const };
      }
      return label;
    });

    const result = buildPlannerCareerPressure(input);

    expect(result.kind).toBe("world");
    expect(result.value).toBe("Academy squeeze");
    expect(result.schedulingQuestion).toMatch(/this particular football world/i);
  });
});
