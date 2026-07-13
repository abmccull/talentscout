import type {
  ScoutReport,
  YouthPresentationApproach,
  YouthRecruitmentBrief,
} from "@/engine/core/types";

export interface PresentationApproachDefinition {
  id: YouthPresentationApproach;
  label: string;
  roomLine: string;
  emphasis: string;
  tradeoff: string;
  adjustments: {
    evidence: number;
    briefFit: number;
    risk: number;
    conviction: number;
  };
}

export const PRESENTATION_APPROACHES: readonly PresentationApproachDefinition[] = [
  {
    id: "evidenceLed",
    label: "Evidence-led",
    roomLine: "Walk the room through what you saw, where you saw it, and how certain you are.",
    emphasis: "Strengthens the evidence case and rewards varied, independent observation.",
    tradeoff: "The player-to-brief story and emotional force receive less room.",
    adjustments: { evidence: 4, briefFit: -1, risk: 0, conviction: -1 },
  },
  {
    id: "fitLed",
    label: "Pathway-led",
    roomLine: "Lead with the academy need, tactical role, and the player's route into the team.",
    emphasis: "Strengthens brief fit when the proposed role and pathway are credible.",
    tradeoff: "Compresses the raw evidence and risk discussion into supporting material.",
    adjustments: { evidence: -1, briefFit: 4, risk: -1, conviction: 0 },
  },
  {
    id: "riskLed",
    label: "Risk-led",
    roomLine: "Name the failure modes first, then explain why the opportunity remains worth taking.",
    emphasis: "Strengthens risk handling for cautious academies and character-sensitive briefs.",
    tradeoff: "A deliberately cautious frame carries less force as a conviction play.",
    adjustments: { evidence: 0, briefFit: 0, risk: 6, conviction: -1 },
  },
] as const;

export interface PresentationStrategyInput {
  /** Undefined means the artifact predates presentation strategy and stays mechanically neutral. */
  approach?: YouthPresentationApproach;
  intendedAudience?: ScoutReport["intendedAudience"];
  brief: YouthRecruitmentBrief;
  contextCount: number;
  hypothesisCount: number;
  riskFactorCount: number;
  roleMatch: boolean;
}

export interface PresentationStrategyImpact {
  approach?: YouthPresentationApproach;
  label: string;
  adjustments: PresentationApproachDefinition["adjustments"];
  /** Direct bounded adjustment applied after the weighted decision score. */
  alignmentAdjustment: number;
  /** Player-facing 0-100 measure persisted in the decision breakdown. */
  presentationScore: number;
  reasons: string[];
  legacyNeutral: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function definitionFor(approach: YouthPresentationApproach): PresentationApproachDefinition {
  return PRESENTATION_APPROACHES.find((candidate) => candidate.id === approach)
    ?? PRESENTATION_APPROACHES[0];
}

/**
 * Evaluate only authored report fields and visible brief/evidence context.
 * No player ability or personality truth is accepted by this function.
 */
export function evaluatePresentationStrategy(
  input: PresentationStrategyInput,
): PresentationStrategyImpact {
  if (!input.approach) {
    return {
      approach: undefined,
      label: "Legacy neutral",
      adjustments: { evidence: 0, briefFit: 0, risk: 0, conviction: 0 },
      alignmentAdjustment: 0,
      presentationScore: 50,
      reasons: ["This report predates presentation strategy, so no framing modifier was applied."],
      legacyNeutral: true,
    };
  }

  const definition = definitionFor(input.approach);
  let alignment = 0;
  const reasons: string[] = [];

  if (input.approach === "evidenceLed") {
    if (input.intendedAudience === "headOfRecruitment") {
      alignment += 2;
      reasons.push("The head of recruitment values an auditable evidence trail.");
    } else if (input.intendedAudience === "sportingDirector") {
      alignment += 1;
      reasons.push("The sporting director values evidence, but still expects a concise strategic case.");
    } else if (input.intendedAudience === "client") {
      alignment -= 1;
      reasons.push("A client audience is less receptive to a process-heavy presentation.");
    }
    if (input.brief.developmentPriority === "highCeiling" || input.brief.developmentPriority === "resale") {
      alignment += 1;
      reasons.push("The brief rewards a defensible projection built from evidence.");
    } else if (input.brief.developmentPriority === "character") {
      alignment -= 1;
      reasons.push("A character-led brief needs more human context than this frame foregrounds.");
    }
    if (input.contextCount >= 3 && input.hypothesisCount >= 2) {
      alignment += 1;
      reasons.push("Varied contexts and preserved hypotheses support this framing.");
    } else if (input.contextCount <= 1 || input.hypothesisCount === 0) {
      alignment -= 2;
      reasons.push("The evidence base is too thin for a process-first pitch.");
    }
  }

  if (input.approach === "fitLed") {
    if (input.intendedAudience === "academyDirector") {
      alignment += 2;
      reasons.push("The academy director is directly accountable for the development pathway.");
    } else if (input.intendedAudience === "sportingDirector") {
      alignment += 1;
      reasons.push("The sporting director responds to a clear role in the wider squad plan.");
    } else if (input.intendedAudience === "client") {
      alignment -= 1;
      reasons.push("A client audience may read a club-first pathway pitch as too institutional.");
    }
    if (input.brief.developmentPriority === "earlyReadiness") {
      alignment += 2;
      reasons.push("The brief prioritizes an immediate, legible route into the academy side.");
    } else if (input.brief.developmentPriority === "character") {
      alignment -= 1;
      reasons.push("The brief is asking for character confidence, not only positional fit.");
    }
    if (input.roleMatch) {
      alignment += 1;
      reasons.push("The proposed role directly matches the academy brief.");
    } else {
      alignment -= 2;
      reasons.push("The proposed role does not match the pathway being presented.");
    }
  }

  if (input.approach === "riskLed") {
    if (input.intendedAudience === "academyDirector" || input.intendedAudience === "sportingDirector") {
      alignment += 1;
      reasons.push("The decision-maker owns the downside if the placement fails.");
    } else if (input.intendedAudience === "headOfRecruitment") {
      alignment -= 1;
      reasons.push("Recruitment leadership still expects the scouting evidence to lead the room.");
    }
    if (input.brief.riskTolerance === "low") {
      alignment += 2;
      reasons.push("The academy's low risk tolerance rewards explicit downside control.");
    } else if (input.brief.riskTolerance === "high") {
      alignment -= 1;
      reasons.push("This academy is comfortable carrying uncertainty for upside.");
    }
    if (input.brief.developmentPriority === "character") {
      alignment += 2;
      reasons.push("The brief specifically prioritizes character and adaptation risk.");
    }
    if (input.riskFactorCount >= 2) {
      alignment += 1;
      reasons.push("The report contains enough disclosed risks to make this frame credible.");
    } else if (input.riskFactorCount === 0) {
      alignment -= 2;
      reasons.push("A risk-led pitch without disclosed risks lacks credibility.");
    }
  }

  const alignmentAdjustment = clamp(alignment, -3, 3);
  return {
    approach: input.approach,
    label: definition.label,
    adjustments: definition.adjustments,
    alignmentAdjustment,
    presentationScore: clamp(50 + alignmentAdjustment * 10, 0, 100),
    reasons,
    legacyNeutral: false,
  };
}
