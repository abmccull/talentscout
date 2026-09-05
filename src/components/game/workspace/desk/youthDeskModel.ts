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
  playerId?: string;
  subjectAge?: number;
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

function humanizeBriefPriority(priority: string): string {
  return priority.replace(/([A-Z])/g, " $1").trim().toLowerCase();
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
      summary: "Start with one player worth watching. Choose a local match or youth event to find your first lead.",
      stageId,
      stageLabel,
      stageSteps: STAGE_LABELS.map((label, index) => ({
        label,
        active: index === 0,
        complete: false,
      })),
      evidenceLine: "No first-hand evidence yet. A live visit can give you a name to follow.",
      networkLine: "No active background context is attached to a case yet.",
      scheduleLine: openDayCount === 7
        ? "Your week is open. Plan a live look to find your first lead."
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
    lead: "The name is interesting. Watch the player in person before deciding how far to back the first impression.",
    liveLook: "Test the first impression against a new opponent, setting or moment of pressure.",
    case: "Your evidence is taking shape. Test the weakest part of the case before writing your recommendation.",
    recommendation: "You have repeated evidence. Check the club fit and decide how strongly you are prepared to recommend this player.",
    tracked: "Your recommendation is on file. Follow the club decision and watch how the player develops.",
  };

  return {
    title: titles[stageId],
    summary: summaries[stageId],
    subjectName,
    playerId: focusEntry.youth.player.id,
    subjectAge: focusEntry.youth.player.age,
    stageId,
    stageLabel,
    stageSteps,
    evidenceLine: `${focusEntry.observationCount} live look${focusEntry.observationCount === 1 ? "" : "s"} and ${focusEntry.intelCount} context note${focusEntry.intelCount === 1 ? "" : "s"} are on file.`,
    networkLine: focusEntry.intelCount > 0
      ? `You have background notes. Compare them with what you saw on the pitch.`
      : "A coach, family or trusted contact could help you test the remaining question.",
    scheduleLine: openDayCount === 0
      ? "The week is fully committed. Every new call now requires displacing something else."
      : `${openDayCount} open day${openDayCount === 1 ? "" : "s"} remain. Decide which question deserves your next day.`,
    recommendationLine: focusEntry.hasFirmRead
      ? "The evidence bar is high enough to support a recommendation if the fit and timing are believable."
      : "Watch the player in another setting before making a firm recommendation.",
    briefLine: linkedBrief
      ? `This brief weights ${humanizeBriefPriority(linkedBrief.developmentPriority)} most heavily for the ${linkedBrief.requiredPositions.join("/")} pathway. It expires in S${linkedBrief.expiresSeason} W${linkedBrief.expiresWeek} with ${linkedBrief.competitionPressure} pressure.`
      : "No live academy brief currently sharpens this case.",
  };
}
