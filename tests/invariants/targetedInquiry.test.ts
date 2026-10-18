import { describe, expect, it } from "vitest";
import type { Contact, HiddenIntel } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { createSession, setSessionScoutingQuestion, startSession } from "@/engine/observation/session";
import { recordInquiryDecision, restoreInquiryDecisions } from "@/engine/observation/inquiryConsequences";
import { populateInvestigationPhases } from "@/engine/observation/investigation";
import { shapeTargetedInquiry } from "@/engine/observation/targetedInquiry";
import { resolveDialogueOptionSelection } from "@/engine/observation/interactionSelection";

function session() {
  return populateInvestigationPhases(createSession({
    activityType: "parentCoachMeeting", specialization: "youth",
    playerPool: [{ playerId: "lead", name: "Theo", position: "CM" }],
    sourceContactId: "coach", sourceContactName: "Maya", sourceRelationshipScore: 60,
    scoutingQuestionId: "pressure", seed: "inquiry", week: 4, season: 2,
  }, createRNG("inquiry")), createRNG("inquiry"));
}
const account: HiddenIntel = {
  playerId: "lead", sourceContactId: "coach", sourceName: "Maya",
  attribute: "bigGameTemperament", hint: "Usually asks for the ball when the stakes rise.",
  reliability: 0.8, recordedSeason: 2, recordedWeek: 2,
};

describe("targeted inquiry provenance", () => {
  it("restores the actual question and prompt when the reopened setup default changes", () => {
    const shaped = shapeTargetedInquiry(session(), [account]);
    const active = { ...startSession(shaped), currentPhaseIndex: 1 };
    const node = active.phases[1].dialogueNodes![0];
    const selected = resolveDialogueOptionSelection(active, node.id, "recall-account");
    const contact = recordInquiryDecision({ id: "coach", name: "Maya", relationship: 60 } as Contact,
      active, selected.resolution!);
    const reopened = shapeTargetedInquiry({ ...session(), scoutingQuestionId: "movement" }, [account]);
    expect(reopened.phases[1].dialogueNodes![0].text).not.toBe(node.text);
    const restored = restoreInquiryDecisions(reopened, JSON.parse(JSON.stringify(contact)));
    expect(restored.scoutingQuestionId).toBe("pressure");
    expect(restored.phases[1].dialogueNodes![0].text).toBe(node.text);
    expect(restored.phases[1].dialogueChoiceResolutions![node.id]).toEqual(selected.resolution);
    expect(setSessionScoutingQuestion(restored, "movement", [])).toBe(restored);
    expect(restoreInquiryDecisions(restored, contact)).toBe(restored);
    expect(restored.insightPointsEarned).toBe(selected.session.insightPointsEarned);
    const differentPlayer = { ...reopened, players: [{ ...reopened.players[0], playerId: "other" }] };
    expect(restoreInquiryDecisions(differentPlayer, contact).phases[1].dialogueChoiceResolutions).toBeUndefined();
  });
  it("uses only the named source's relevant, non-future account for the target", () => {
    const original = session();
    const other = [
      { ...account, playerId: "other", hint: "Wrong player" },
      { ...account, sourceContactId: "other", hint: "Wrong source" },
      { ...account, attribute: "professionalism" as const, hint: "Wrong question" },
      { ...account, recordedWeek: 5, hint: "Future account" },
    ];
    const shaped = shapeTargetedInquiry(original, [...other, account]);
    const node = shaped.phases[1].dialogueNodes![0];
    expect(node.options[0].outcome.narrativeText).toContain(account.hint);
    expect(JSON.stringify(node)).not.toMatch(/Wrong|Future|reliability/);
    expect(node.options[0].outcome.inquiry?.recordedWeek).toBe(2);
    expect(node.options.every((option) => option.outcome.insightBonus === 0)).toBe(true);
    expect(original.phases[1].dialogueNodes![0].id).not.toBe(node.id);
    const unanswered = shapeTargetedInquiry(original, other);
    expect(unanswered.phases[1].dialogueNodes![0].options[0].outcome.inquiry?.status).toBe("unanswered");
  });

  it("follows a changed setup question without recycling an unrelated claim", () => {
    const shaped = shapeTargetedInquiry(session(), [account]);
    const changed = shapeTargetedInquiry({ ...shaped, scoutingQuestionId: "movement" }, [account]);
    const outcome = changed.phases[1].dialogueNodes![0].options[0].outcome;
    expect(outcome.inquiry?.questionId).toBe("movement");
    expect(outcome.inquiry?.status).toBe("unanswered");
    expect(outcome.narrativeText).not.toContain(account.hint);
  });

  it("locks and saves attribution exactly once without awarding new evidence for a repeated account", () => {
    const shaped = shapeTargetedInquiry(session(), [account]);
    const active = { ...startSession(shaped), currentPhaseIndex: 1 };
    const node = active.phases[1].dialogueNodes![0];
    const selected = resolveDialogueOptionSelection(active, node.id, "recall-account");
    expect(selected.applied).toBe(true);
    expect(selected.resolution?.inquiry?.statement).toBe(account.hint);
    expect(selected.session.insightPointsEarned).toBe(active.insightPointsEarned);
    expect(selected.session.flaggedMoments).toEqual([]);
    const restored = JSON.parse(JSON.stringify(selected.session));
    expect(restored.phases[1].dialogueChoiceResolutions[node.id].inquiry).toEqual(selected.resolution?.inquiry);
    expect(resolveDialogueOptionSelection(restored, node.id, "check-basis").applied).toBe(false);
    expect(shapeTargetedInquiry(restored, [])).toBe(restored);
  });
});
