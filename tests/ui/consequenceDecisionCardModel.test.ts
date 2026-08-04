import { describe, expect, it } from "vitest";

import { buildConsequenceDecisionCardModel } from "@/components/game/inbox/consequenceDecisionCardModel";
import type { DecisionRecord } from "@/engine/consequences";

function baseDecision(metadata?: DecisionRecord["metadata"]): DecisionRecord {
  return {
    id: "decision-1",
    source: { kind: "relationshipConflict", id: "conflict-1" },
    offeredAt: { season: 2, week: 10 },
    deadlineAt: { season: 2, week: 12 },
    status: "offered",
    visibility: "private",
    stakeholders: [],
    options: [{
      id: "option-1",
      label: "Back the family contact",
      knownTradeoffs: ["You may cool an agent relationship."],
      immediateEffects: [],
      scheduledConsequences: [],
    }],
    outcomeRoll: 0.4,
    consequenceIds: [],
    metadata,
  };
}

describe("consequence decision card model", () => {
  it("surfaces the unresolved scouting question for quiet-week interventions", () => {
    const model = buildConsequenceDecisionCardModel({
      decision: baseDecision({
        quietIntervention: true,
        question: "Can he cope when the match turns transitional and chaotic?",
      }),
      currentWeek: 10,
      currentSeason: 2,
      seasonLength: 38,
    });

    expect(model.quietInterventionReason).toBe(
      "Open scouting question: Can he cope when the match turns transitional and chaotic?",
    );
    expect(model.weeksRemaining).toBe(2);
  });

  it("falls back to a truthful explanation when the quiet-week case question is absent", () => {
    const model = buildConsequenceDecisionCardModel({
      decision: baseDecision({
        quietIntervention: true,
      }),
      currentWeek: 10,
      currentSeason: 2,
      seasonLength: 38,
    });

    expect(model.quietInterventionReason).toBe(
      "Open scouting question: An unresolved scouting question from an active case forced this dilemma into the open.",
    );
  });

  it("does not add quiet-week context to ordinary career decisions", () => {
    const model = buildConsequenceDecisionCardModel({
      decision: baseDecision({
        title: "Protect your territory",
        premise: "A rival has pushed into your region.",
      }),
      currentWeek: 10,
      currentSeason: 2,
      seasonLength: 38,
    });

    expect(model.quietInterventionReason).toBeUndefined();
    expect(model.title).toBe("Protect your territory");
    expect(model.premise).toBe("A rival has pushed into your region.");
  });
});
