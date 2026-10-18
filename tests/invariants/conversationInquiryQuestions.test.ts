import { expect, it } from "vitest";
import type { DialogueChoiceResolution } from "@/engine/observation/types";
import { getConversationInquiryQuestions } from "@/engine/scout/conversationInquiryQuestions";

const decision: DialogueChoiceResolution = {
  phaseIndex: 1, nodeId: "question", optionId: "recall", optionText: "Compare the account",
  narrativeText: "An attributed account.", insightPointsAwarded: 0, relationshipDeltaApplied: 0,
  inquiry: { playerId: "prospect", questionId: "pressure", sourceName: "Coach", status: "recalledAccount",
    statement: "Usually handles pressure." },
};

it("deduplicates repeated accounts without treating their statement as a finding", () => {
  const original = JSON.stringify(decision);
  expect(getConversationInquiryQuestions([decision, decision])).toEqual([
    { playerId: "prospect", questionId: "pressure", label: "What changes when pressure arrives?" },
  ]);
  expect(JSON.stringify(decision)).toBe(original);
});

it("keeps another player's inquiry out of a scoped dossier", () => {
  const other = { ...decision, inquiry: { ...decision.inquiry!, playerId: "other" } };
  expect(getConversationInquiryQuestions([decision, other], new Set(["prospect"])))
    .toEqual(getConversationInquiryQuestions([decision]));
  expect(getConversationInquiryQuestions([decision], new Set())).toEqual([]);
});
