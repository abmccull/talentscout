import type { DecisionRecord } from "@/engine/consequences";

export interface ConsequenceDecisionCardModel {
  title: string;
  premise: string;
  decisionKindLabel: string;
  weeksRemaining: number;
  quietInterventionReason?: string;
}

function getStringMetadata(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function buildConsequenceDecisionCardModel(input: {
  decision: DecisionRecord;
  currentWeek: number;
  currentSeason: number;
  seasonLength: number;
}): ConsequenceDecisionCardModel {
  const { currentSeason, currentWeek, decision, seasonLength } = input;
  const title = getStringMetadata(decision.metadata?.title)
    ?? (decision.source.kind === "rivalCampaign"
      ? "Rival campaign / counter-move"
      : "Career decision");
  const premise = getStringMetadata(decision.metadata?.premise)
    ?? "Two legitimate obligations are pulling your career in different directions. Your choice will be recorded.";
  const decisionKindLabel = decision.source.kind === "lateCareerDilemma"
    ? "Career crossroads"
    : decision.source.kind === "worldConditionArc"
      ? "World condition decision"
      : decision.source.kind === "professionalCase"
        ? "Scouting case"
        : decision.source.kind === "rivalCampaign"
          ? "Rival campaign"
          : "Conflicting obligations";
  const absoluteWeek = (season: number, week: number) => (season - 1) * seasonLength + week;
  const weeksRemaining = Math.max(
    0,
    absoluteWeek(decision.deadlineAt.season, decision.deadlineAt.week)
      - absoluteWeek(currentSeason, currentWeek),
  );
  const question = getStringMetadata(decision.metadata?.question);
  const quietInterventionReason = decision.metadata?.quietIntervention === true
    ? (question
      ? `Open scouting question: ${question}`
      : "Open scouting question: An unresolved scouting question from an active case forced this dilemma into the open.")
    : undefined;

  return {
    title,
    premise,
    decisionKindLabel,
    weeksRemaining,
    quietInterventionReason,
  };
}
