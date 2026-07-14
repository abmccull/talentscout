import { describe, expect, it } from "vitest";
import {
  PRODUCT_QUALITY_BARS,
  PRODUCT_ROADMAP_MODES,
  PRODUCT_ROADMAP_NOTICE,
  PRODUCT_ROADMAP_PHASES,
  PRODUCT_ROADMAP_STATUS_LABELS,
  PRODUCT_ROADMAP_SYSTEMS,
} from "@/data/productRoadmap";

function expectUniqueIds(items: readonly { id: string }[]): void {
  expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
}

describe("player-facing product roadmap", () => {
  it("keeps Youth Scout as the only currently available game mode", () => {
    const availableModes = PRODUCT_ROADMAP_MODES.filter(
      (mode) => mode.status === "available",
    );

    expect(availableModes.map((mode) => mode.id)).toEqual(["youth-scout"]);
    expect(PRODUCT_ROADMAP_PHASES[0]).toMatchObject({
      id: "youth-early-access",
      status: "available",
    });
    expect(
      PRODUCT_ROADMAP_MODES.filter((mode) => mode.id !== "youth-scout").every(
        (mode) => mode.status !== "available",
      ),
    ).toBe(true);
  });

  it("uses honest status language without promising dates", () => {
    expect(PRODUCT_ROADMAP_NOTICE).toContain("not a promise of dates or final scope");
    expect(PRODUCT_ROADMAP_STATUS_LABELS).toEqual({
      available: "Available now",
      validating: "In validation",
      planned: "Planned direction",
      exploring: "Exploring",
    });

    const shippedCopy = JSON.stringify({
      phases: PRODUCT_ROADMAP_PHASES,
      modes: PRODUCT_ROADMAP_MODES,
      systems: PRODUCT_ROADMAP_SYSTEMS,
    });
    expect(shippedCopy).not.toMatch(/coming soon/i);
    expect(shippedCopy).not.toMatch(/\bQ[1-4]\b|\b20\d{2}\b/);
  });

  it("keeps every catalog entry identifiable and outcome-focused", () => {
    expectUniqueIds(PRODUCT_ROADMAP_PHASES);
    expectUniqueIds(PRODUCT_ROADMAP_MODES);
    expectUniqueIds(PRODUCT_ROADMAP_SYSTEMS);

    expect(
      PRODUCT_ROADMAP_PHASES.every(
        (phase) => phase.outcomes.length >= 3 && phase.summary.length > 40,
      ),
    ).toBe(true);
    expect(
      PRODUCT_ROADMAP_MODES.every(
        (mode) => mode.differentiators.length >= 3 && mode.fantasy.length > 40,
      ),
    ).toBe(true);
    expect(
      PRODUCT_ROADMAP_SYSTEMS.every(
        (system) => system.playerValue.length > 40,
      ),
    ).toBe(true);
    expect(PRODUCT_QUALITY_BARS.length).toBeGreaterThanOrEqual(5);
  });
});
