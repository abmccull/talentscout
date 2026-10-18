import type { DialogueOption } from "../observation/types";
import type { VeteranPrologueCase } from "./veteranPrologueTypes";

/** Authored evidence needs questions about that evidence, not a recruitment pitch. */
export function buildPrologueInquiryOptions(
  prologue: VeteranPrologueCase,
  phaseIndex: number,
): DialogueOption[] {
  const beat = prologue.evidenceBeats[phaseIndex];
  const hasContact = Boolean(prologue.sourceContactId);
  const contradictoryFrames = [
    [
      ["Record the account without endorsing it", "You retain the account as a source's claim, not an established trait.", 1, 1],
      ["Separate the example from the character judgment", "Your notes distinguish the reported behavior from the source's interpretation. One example cannot establish a lasting trait.", 3, 0],
      ["Challenge whether this account is enough to judge the player", "You make the weakness of the inference explicit. The direct challenge costs goodwill, but keeps an untested character label out of your assessment.", 5, -2],
    ],
    [
      ["Keep the second account alongside the first", "You preserve both accounts without selecting a winner. The disagreement remains open.", 1, 0],
      ["Compare the circumstances behind the two accounts", "You mark context as a competing explanation. These accounts are not interchangeable observations of the same situation.", 3, 0],
      ["Put the conflicting evidence to your contact", "The contradiction is now explicit in the conversation. Challenging the account risks trust; it does not prove either source wrong.", 5, -2],
    ],
    [
      ["Leave the character verdict open", "You retain the uncertainty and avoid a premature verdict. Further observation is still needed.", 1, 1],
      ["Define what the next observation must test", "Your next test is whether the behavior persists in a different setting. More repetition of the same account will not settle that question.", 3, 0],
      ["Tell the contact why you cannot accept a simple verdict", "You defend a conditional assessment despite pressure for certainty. The contact loses some goodwill, while your notes retain the unresolved alternative.", 5, -2],
    ],
  ] as const;
  const familyFrames = [
    [
      ["Listen without discussing a move", "You retain the family's account without turning access into a recruitment promise.", 1, 1],
      ["Separate the routine from what it proves", "You record the example, while leaving open whether the same habits hold outside the family's view.", 3, 0],
      ["Explain why a family reference needs an independent check", "You state the limit of an invested source. The challenge costs goodwill; it does not make the family dishonest.", 5, -2],
    ],
    [
      ["Keep the example in the family's own terms", "The account stays attributed to its source. You make no wider claim about the player's character.", 1, 1],
      ["Distinguish the player's actions from adult interpretations", "You separate what the account describes from the meaning others give it. The player's wider response remains untested.", 3, 0],
      ["Challenge the leap from this example to readiness for a move", "You resist treating one account as proof of readiness. The family may hear that caution as doubt.", 5, -2],
    ],
    [
      ["Respect the limit and leave the difficult question open", "You stop pressing. The missing context remains a limit in your notes, not a negative character verdict.", 1, 1],
      ["Mark response to setbacks as the next question", "You identify a need for evidence from difficult weeks. No further access or answer has been secured yet.", 3, 0],
      ["Say that avoiding the difficult period limits your recommendation", "You make the gap explicit without diagnosing its cause. That directness costs trust and leaves the final decision open.", 5, -2],
    ],
  ] as const;
  const agentFrames = [
    [
      ["Record the pitch as an interested source's account", "You preserve the material without endorsing the sales claim. The agent's interest stays attached to the evidence.", 1, 1],
      ["Identify what this presentation leaves untested", "You distinguish what is shown from what the selection process could be hiding. No unseen weakness is assumed.", 3, 0],
      ["Challenge the claim that this is enough for a recommendation", "You reject the leap from a selected example to a complete assessment. The agent loses some goodwill.", 5, -2],
    ],
    [
      ["Keep this passage alongside the original pitch", "You retain the new material without letting either passage erase the other.", 1, 0],
      ["Separate individual quality from the surrounding drill", "You mark the conditions as part of the evidence. Repeatability in a different setting remains an open question.", 3, 0],
      ["Push back on the agent's interpretation of this passage", "You make the interpretive disagreement explicit. This tests the relationship without proving your own reading correct.", 5, -2],
    ],
    [
      ["End the review without committing your name", "The lead remains open. You neither dismiss the player nor endorse the agent's conclusion.", 1, 0],
      ["Define an independent repeatability check", "Your next question is whether the promising decision survives pressure outside this presentation. The check has not yet happened.", 3, 0],
      ["Tell the agent that the deadline cannot settle the evidence", "You refuse to let the sales timetable stand in for football evidence. The direct refusal costs goodwill.", 5, -2],
    ],
  ] as const;
  const frames = prologue.templateId === "family-discretion" ? familyFrames
    : prologue.templateId === "agent-exaggeration" ? agentFrames
      : contradictoryFrames;
  return frames[phaseIndex].map(([text, consequence, insightBonus, relationshipDelta], index) => ({
    id: `${prologue.activityInstanceId}:inquiry:${phaseIndex}:${index}`,
    text,
    riskLevel: (["safe", "moderate", "bold"] as const)[index],
    outcome: {
      narrativeText: `${consequence} Evidence retained: ${beat.focused}`,
      insightBonus,
      ...(hasContact ? { relationshipDelta } : {}),
    },
  }));
}
