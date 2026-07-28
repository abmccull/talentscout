import { describe, expect, it } from "vitest";
import {
  DAY_NAMES,
  formatBalance,
  formatMoney,
  getOrdinal,
  moraleEmoji,
  performanceRatingColor,
  priorityBadgeClass,
  sortYouthByEvidence,
  threatBadgeVariant,
  threatLabel,
} from "@/components/game/dashboard/helpers";

describe("dashboard helpers", () => {
  it("formats balances and money with compact currency labels", () => {
    expect(formatBalance(950)).toBe("£950");
    expect(formatBalance(-12_500)).toBe("-£13K");
    expect(formatBalance(1_500_000)).toBe("£1.50M");
    expect(formatMoney(750)).toBe("£750");
    expect(formatMoney(12_500)).toBe("£13K");
    expect(formatMoney(1_500_000)).toBe("£1.50M");
  });

  it("generates ordinals and threat labels", () => {
    expect(getOrdinal(1)).toBe("1st");
    expect(getOrdinal(2)).toBe("2nd");
    expect(getOrdinal(11)).toBe("11th");
    expect(threatBadgeVariant(4)).toBe("destructive");
    expect(threatBadgeVariant(3)).toBe("warning");
    expect(threatBadgeVariant(2)).toBe("default");
    expect(threatBadgeVariant(1)).toBe("secondary");
    expect(threatLabel(4)).toBe("High Threat");
    expect(threatLabel(3)).toBe("Medium");
    expect(threatLabel(2)).toBe("Low");
    expect(threatLabel(1)).toBe("Minimal");
  });

  it("prioritizes evidence-heavy youth entries", () => {
    const sorted = [
      {
        observationCount: 1,
        intelCount: 3,
        reported: false,
        buzzLevel: 80,
        visibility: 55,
      },
      {
        observationCount: 2,
        intelCount: 1,
        reported: false,
        buzzLevel: 40,
        visibility: 20,
      },
      {
        observationCount: 2,
        intelCount: 1,
        reported: true,
        buzzLevel: 10,
        visibility: 10,
      },
    ].sort(sortYouthByEvidence);

    expect(sorted[0]?.reported).toBe(true);
    expect(sorted[1]?.observationCount).toBe(2);
    expect(sorted[2]?.intelCount).toBe(3);
  });

  it("maps dashboard display helpers to the expected classes and labels", () => {
    expect(priorityBadgeClass("critical")).toContain("text-red-400");
    expect(priorityBadgeClass("medium")).toContain("text-blue-400");
    expect(priorityBadgeClass("unknown")).toContain("text-zinc-400");
    expect(performanceRatingColor(80)).toBe("text-emerald-400");
    expect(performanceRatingColor(55)).toBe("text-amber-400");
    expect(performanceRatingColor(20)).toBe("text-red-400");
    expect(moraleEmoji(90)).toBe("😊");
    expect(moraleEmoji(60)).toBe("😐");
    expect(moraleEmoji(30)).toBe("😕");
    expect(moraleEmoji(5)).toBe("😞");
    expect(DAY_NAMES).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });
});
