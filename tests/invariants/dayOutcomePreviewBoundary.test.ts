import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Activity, DayResult, Scout } from "@/engine/core/types";
import type { RNG } from "@/engine/rng";
import { rollActivityQuality, type ActivityQualityTier } from "@/engine/core/activityQuality";
import { DayCard } from "@/components/game/WeekSimulationScreen";

const OUTCOME = "A steady follow-up session. The player performed as expected.";

function pendingDay(): DayResult {
  return {
    dayIndex: 0, dayName: "Monday",
    activity: { type: "followUpSession", slots: 1, targetId: "prospect" } as Activity,
    observations: [], playersDiscovered: 0, reportsWritten: [], profilesGenerated: 0,
    anomaliesFound: 0, xpGained: {}, fatigueChange: 0, inboxMessages: [], narrative: OUTCOME,
    interaction: { prompt: "How will you approach this session?", options: [
      { id: "scan", label: "Broad Assessment", description: "Review several questions." },
      { id: "focus", label: "Targeted Testing", description: "Test one question." },
    ] },
  };
}

function render(day: DayResult, interactiveSessionCompleted = false): string {
  return renderToStaticMarkup(createElement(DayCard, {
    dayResult: day, allDayResults: [day], currentDay: 0, interactiveSessionCompleted,
  }));
}

describe("day outcome preview boundary", () => {
  it("does not render any precomputed outcome narrative before the approach is resolved", () => {
    const day = pendingDay();
    const html = render(day);
    expect(html).not.toContain(OUTCOME);
    expect(html).toContain("Choose an approach or complete a live session");
    expect(html).toContain("Broad Assessment");
    expect(html).toContain("Targeted Testing");
    expect(html).toContain("Decision pending");
    // Changing tomorrow's precomputed performance cannot inform this decision.
    expect(render({ ...day, narrative: "Exceptional hidden outcome.\n\nAdditional reward." })).toBe(html);
  });

  it.each(["player", "delegated"] as const)("reveals the original narrative after a %s approach is locked", (resolutionMode) => {
    const day = pendingDay();
    day.interaction = { ...day.interaction!, selectedOptionId: "scan", resolutionMode };
    const html = render(day);
    expect(html).toContain(OUTCOME);
    expect(html).toContain("Today’s result");
    expect(html).not.toContain("Choose an approach or complete a live session");
  });

  it("reveals the same narrative after live observation and for automatic noninteractive days", () => {
    const day = pendingDay();
    expect(render(day, true)).toContain(OUTCOME);
    delete day.interaction;
    expect(render(day)).toContain(OUTCOME);
    expect(render({ ...day, activity: null, narrative: "A quiet rest day." })).toContain("A quiet rest day.");
  });

  it("describes follow-up opportunity without inventing player performance, preserving tier effects and draw count", () => {
    const effects: Record<ActivityQualityTier, [number, number]> = {
      poor: [0.4, -1], average: [0.8, 0], good: [1, 0], excellent: [1.4, 1], exceptional: [2, 2],
    };
    for (const [tier, [multiplier, discoveryModifier]] of Object.entries(effects)) {
      for (const templateIndex of [0, 1]) {
        let draws = 0;
        const rng = {
          pickWeighted: () => { draws += 1; return tier; },
          pick: (templates: string[]) => { draws += 1; expect(templates).toHaveLength(2); return templates[templateIndex]; },
        } as unknown as RNG;
        const scout = { fatigue: 0, skills: { potentialAssessment: 10, playerJudgment: 10 } } as Scout;
        const result = rollActivityQuality(rng, "followUpSession", scout);
        expect(result).toMatchObject({ tier, multiplier, discoveryModifier });
        expect(draws).toBe(2);
        expect(result.narrative).not.toMatch(/player performed|player showed|player has clearly improved|generational potential|youngster showed|doubt.*answered|confirmed.*observation/i);
        expect(result.narrative).toMatch(/session|visit|look/i);
      }
    }
  });
});
