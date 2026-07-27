"use client";

export interface YouthDeskProspectEntry {
  youth: {
    id: string;
    placed?: boolean;
    player: {
      id: string;
      firstName: string;
      lastName: string;
      age: number;
      position: string;
      secondaryPositions: string[];
    };
  };
  observationCount: number;
  intelCount: number;
  reported: boolean;
  buzzLevel: number;
  visibility: number;
  hasFirmRead: boolean;
}

export interface YouthDeskBriefSummary {
  id: string;
  expiresWeek: number;
  expiresSeason: number;
  requiredPositions: string[];
  developmentPriority: string;
  weeklyWageBudget: number;
  riskTolerance: "low" | "medium" | "high";
  competitionPressure: number;
}

export interface YouthActiveCaseModel {
  title: string;
  summary: string;
  subjectName?: string;
  stageId: "lead" | "liveLook" | "case" | "recommendation" | "tracked";
  stageLabel: string;
  stageSteps: Array<{
    label: string;
    active: boolean;
    complete: boolean;
  }>;
  evidenceLine: string;
  networkLine: string;
  scheduleLine: string;
  recommendationLine: string;
  briefLine: string;
}

const STAGE_LABELS: YouthActiveCaseModel["stageLabel"][] = [
  "Lead",
  "Live look",
  "Case",
  "Recommendation",
  "Tracked",
];

function matchesBrief(entry: YouthDeskProspectEntry, brief: YouthDeskBriefSummary): boolean {
  return (
    entry.youth.player.age <= 19 &&
    (
      brief.requiredPositions.includes(entry.youth.player.position)
      || entry.youth.player.secondaryPositions.some((position) => brief.requiredPositions.includes(position))
    )
  );
}

export function buildYouthActiveCaseModel(args: {
  decisionReadyYouth: YouthDeskProspectEntry[];
  evidenceQueue: YouthDeskProspectEntry[];
  observedYouthEvidence: YouthDeskProspectEntry[];
  openRecruitmentBriefs: YouthDeskBriefSummary[];
  pendingPlacementCount: number;
  scheduledSlots: number;
  openDayCount: number;
}): YouthActiveCaseModel {
  const {
    decisionReadyYouth,
    evidenceQueue,
    observedYouthEvidence,
    openRecruitmentBriefs,
    pendingPlacementCount,
    scheduledSlots,
    openDayCount,
  } = args;
  const focusEntry = decisionReadyYouth[0] ?? evidenceQueue[0] ?? observedYouthEvidence[0];
  const linkedBrief = focusEntry
    ? openRecruitmentBriefs.find((brief) => matchesBrief(focusEntry, brief)) ?? openRecruitmentBriefs[0]
    : openRecruitmentBriefs[0];

  const subjectName = focusEntry
    ? `${focusEntry.youth.player.firstName} ${focusEntry.youth.player.lastName}`
    : undefined;

  let stageIndex = 0;
  if (focusEntry?.reported || pendingPlacementCount > 0) stageIndex = 4;
  else if (focusEntry?.hasFirmRead) stageIndex = 3;
  else if ((focusEntry?.observationCount ?? 0) >= 2 || (focusEntry?.intelCount ?? 0) >= 2) stageIndex = 2;
  else if ((focusEntry?.observationCount ?? 0) >= 1) stageIndex = 1;

  const stageId = (["lead", "liveLook", "case", "recommendation", "tracked"] as const)[stageIndex];
  const stageLabel = STAGE_LABELS[stageIndex]!;

  if (!focusEntry) {
    return {
      title: "Find the lead worth your next week",
      summary: "You do not have an active case yet. The desk should create one name, one context, and one reason to care before the calendar gets noisy again.",
      stageId,
      stageLabel,
      stageSteps: STAGE_LABELS.map((label, index) => ({
        label,
        active: index === 0,
        complete: false,
      })),
      evidenceLine: "No live evidence yet. Discovery work should create the first lead.",
      networkLine: "No active background context is attached to a case yet.",
      scheduleLine: openDayCount === 7
        ? "The week is still blank. Planner should create the first live look."
        : `${scheduledSlots}/7 days are committed, but none are anchored to a live case yet.`,
      recommendationLine: pendingPlacementCount > 0
        ? `${pendingPlacementCount} recommendation${pendingPlacementCount === 1 ? "" : "s"} still need outcome tracking.`
        : "No recommendation is close enough to carry your name yet.",
      briefLine: linkedBrief
        ? `${linkedBrief.requiredPositions.join("/")} pathway expires in S${linkedBrief.expiresSeason} W${linkedBrief.expiresWeek}.`
        : "No academy brief is shaping the desk yet.",
    };
  }

  const stageSteps = STAGE_LABELS.map((label, index) => ({
    label,
    active: index === stageIndex,
    complete: index < stageIndex,
  }));

  const titles: Record<YouthActiveCaseModel["stageId"], string> = {
    lead: `${subjectName} is a lead, not a case yet`,
    liveLook: `Get another live look on ${subjectName}`,
    case: `Build the full case on ${subjectName}`,
    recommendation: `Back your judgment on ${subjectName}`,
    tracked: `${subjectName} is now a tracked recommendation`,
  };

  const summaries: Record<YouthActiveCaseModel["stageId"], string> = {
    lead: "The name is interesting, but the evidence still belongs to rumor and first impressions. The week should buy context, not conviction.",
    liveLook: "One impression is a clue. The desk should now test whether the player survives a new context, opponent, or emotional load.",
    case: "The evidence is starting to stack. What matters now is whether the dossier can survive challenge, not just accumulate notes.",
    recommendation: "You have enough repeat information to make a defensible call. The question is whether you are ready to attach your reputation to it.",
    tracked: "The recommendation has left the desk. What remains is accountability: did the pathway, timing, and pitch hold up in the real world?",
  };

  return {
    title: titles[stageId],
    summary: summaries[stageId],
    subjectName,
    stageId,
    stageLabel,
    stageSteps,
    evidenceLine: `${focusEntry.observationCount} live look${focusEntry.observationCount === 1 ? "" : "s"} and ${focusEntry.intelCount} context note${focusEntry.intelCount === 1 ? "" : "s"} are on file.`,
    networkLine: focusEntry.intelCount > 0
      ? `Private context is attached to the case. Make sure it sharpens the read instead of replacing it.`
      : "No supporting context is attached yet. The next week can still add family, coach, or contact color.",
    scheduleLine: openDayCount === 0
      ? "The week is fully committed. Every new call now requires displacing something else."
      : `${openDayCount} open day${openDayCount === 1 ? "" : "s"} remain. Planner should be used to decide what this case is worth.`,
    recommendationLine: focusEntry.hasFirmRead
      ? "The evidence bar is high enough to support a recommendation if the fit and timing are believable."
      : "The desk still needs another context before the recommendation can be trusted.",
    briefLine: linkedBrief
      ? `${linkedBrief.requiredPositions.join("/")} pathway expires in S${linkedBrief.expiresSeason} W${linkedBrief.expiresWeek} with ${linkedBrief.competitionPressure} pressure.`
      : "No live academy brief currently sharpens this case.",
  };
}
