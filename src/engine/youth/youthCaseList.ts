import type {
  GameState,
  Observation,
  ReflectionJournalEntry,
  UnsignedYouth,
} from "@/engine/core/types";
import { getFreshReportObservationIds } from "@/engine/reports/reportAccountability";
import { collectYouthCasePlayerIds } from "./youthCaseFocus";

export type YouthRivalHeat = "quiet" | "watching" | "contested" | "imminent";

export interface YouthCaseListItem {
  playerId: string;
  youthId: string;
  name: string;
  position: string;
  age: number;
  lastLookLabel: string;
  questionLabel: string;
  openQuestion: string;
  nextTest: string;
  rivalHeat: YouthRivalHeat;
  rivalHeatLabel: string;
  observationCount: number;
}

function latestObservation(
  observations: Observation[],
  playerId: string,
): Observation | undefined {
  return observations
    .filter((observation) => observation.playerId === playerId)
    .sort((left, right) =>
      right.season - left.season || right.week - left.week,
    )[0];
}

function latestJournal(
  journal: Record<string, ReflectionJournalEntry> | undefined,
  playerId: string,
): ReflectionJournalEntry | undefined {
  return Object.values(journal ?? {})
    .filter((entry) => entry.playerIds.includes(playerId))
    .sort((left, right) =>
      (right.season ?? 0) - (left.season ?? 0) || (right.week ?? 0) - (left.week ?? 0),
    )[0];
}

export function rivalHeatFromYouth(
  youth: UnsignedYouth,
  rivalActivities: GameState["rivalActivities"],
): YouthRivalHeat {
  const hits = (rivalActivities ?? []).filter((activity) =>
    activity.playerId === youth.player.id,
  );
  if (hits.some((activity) => activity.type === "playerSigned")) return "contested";
  if (hits.some((activity) => activity.type === "reportSubmitted") || hits.length >= 3) {
    return "contested";
  }
  if (hits.length >= 1) return "watching";
  return "quiet";
}

const HEAT_LABEL: Record<YouthRivalHeat, string> = {
  quiet: "No rival heat",
  watching: "A rival is watching",
  contested: "Contested",
  imminent: "Rival claim imminent",
};

export function buildYouthCaseListItem(
  youth: UnsignedYouth,
  state: Pick<GameState, "observations" | "reflectionJournal" | "rivalActivities" | "currentWeek" | "currentSeason"> & Partial<Pick<GameState, "reports" | "scout">>,
): YouthCaseListItem {
  const observations = Object.values(state.observations ?? {})
    .filter((observation) => !state.scout || observation.scoutId === state.scout.id);
  const last = latestObservation(observations, youth.player.id);
  const journal = latestJournal(state.reflectionJournal, youth.player.id);
  const hypothesis = journal?.hypotheses?.find((entry) => entry.playerId === youth.player.id);
  const report = Object.values(state.reports ?? {})
    .filter((entry) => entry.playerId === youth.player.id
      && (!state.scout || entry.scoutId === state.scout.id))
    .sort((left, right) => right.submittedSeason - left.submittedSeason
      || right.submittedWeek - left.submittedWeek || (right.revision ?? 0) - (left.revision ?? 0))[0];
  const assessment = report?.evidenceAssessment;
  const passedForNow = (report?.recommendedAction ?? assessment?.recommendation) === "pass";
  // Report evidence IDs distinguish a genuinely new same-week observation
  // from simply reopening the existing journal or another scout's evidence.
  const canReconsider = Boolean(passedForNow && report
    && getFreshReportObservationIds(observations, report).length > 0);
  const preservedPass = report?.summary?.trim() || assessment?.generatedSummary?.trim()
    || "The original judgment and evidence remain on record.";
  const reportIsLatest = report && (!journal || report.submittedSeason > journal.season
    || (report.submittedSeason === journal.season && report.submittedWeek >= journal.week));
  const unknown = reportIsLatest ? assessment?.unknowns[0]?.statement : undefined;
  // These are saved scout judgments, never a claim inferred from hidden ability.
  const reflectionNote = journal?.notes?.find((note) => note.trim());
  const lastCue = last?.notes?.find((note) => note.trim());
  const observationCount = observations.filter((observation) => observation.playerId === youth.player.id).length;
  const heat = rivalHeatFromYouth(youth, state.rivalActivities);
  return {
    playerId: youth.player.id,
    youthId: youth.id,
    name: `${youth.player.firstName} ${youth.player.lastName}`,
    position: youth.player.position,
    age: youth.player.age,
    lastLookLabel: last
      ? `Week ${last.week}, S${last.season}`
      : "No look yet",
    questionLabel: passedForNow ? canReconsider ? "Reconsideration available" : "Passed for now"
      : unknown ? "Still to test" : hypothesis ? "Working hypothesis"
      : reflectionNote ? "Last reflection" : lastCue ? "Latest evidence" : "The open question",
    openQuestion: passedForNow ? `Passed for now. ${preservedPass}`
      : unknown ?? hypothesis?.text ?? reflectionNote ?? lastCue
        ?? (observationCount ? "Which part of this read needs another context?" : "What will a first look reveal?"),
    nextTest: passedForNow
      ? canReconsider ? "Optional: reconsider this pass against the new first-hand evidence."
        : "No next look planned; spend attention elsewhere."
      : reportIsLatest && assessment ? assessment.nextTest.label
      : hypothesis ? "Test that hypothesis in a new context."
      : observationCount > 1 ? "Revisit the evidence and choose the next test."
      : observationCount === 1 ? "Book a second look in a different context."
      : "Plan a first observation.",
    rivalHeat: heat,
    rivalHeatLabel: HEAT_LABEL[heat],
    observationCount,
  };
}

export function listYouthCases(
  state: Pick<
    GameState,
    | "scout"
    | "openingCase"
    | "unsignedYouth"
    | "observations"
    | "reports"
    | "placementReports"
    | "alumniRecords"
    | "discoveryRecords"
    | "reflectionJournal"
    | "rivalActivities"
    | "currentWeek"
    | "currentSeason"
  >,
): YouthCaseListItem[] {
  const caseIds = collectYouthCasePlayerIds(state);
  return Object.values(state.unsignedYouth)
    .filter((youth) => !youth.retired && !youth.placed && caseIds.has(youth.player.id))
    .map((youth) => buildYouthCaseListItem(youth, state))
    .sort((left, right) => right.observationCount - left.observationCount || left.name.localeCompare(right.name));
}
