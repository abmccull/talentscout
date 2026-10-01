import type {
  GameState,
  Observation,
  ReflectionHypothesisRecord,
  ReflectionJournalEntry,
  UnsignedYouth,
} from "@/engine/core/types";
import { buildYouthDeskEvidenceIndex } from "@/lib/youthDeskEvidence";
import { SCOUTING_QUESTIONS } from "@/engine/scout/evidenceModel";
import { collectYouthCasePlayerIds } from "./youthCaseFocus";

export type YouthRivalHeat = "quiet" | "watching" | "contested" | "imminent";

export interface YouthCaseListItem {
  playerId: string;
  youthId: string;
  name: string;
  position: string;
  age: number;
  lastLookLabel: string;
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

function playerJournalHistory(
  journal: Record<string, ReflectionJournalEntry> | undefined,
  playerId: string,
): ReflectionJournalEntry[] {
  return Object.values(journal ?? {})
    .filter((entry) => entry.playerIds.includes(playerId))
    .sort((left, right) =>
      (right.season ?? 0) - (left.season ?? 0) || (right.week ?? 0) - (left.week ?? 0)
      || right.createdAt - left.createdAt || right.id.localeCompare(left.id),
    );
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
  state: Pick<GameState, "scout" | "observations" | "reflectionJournal" | "rivalActivities" | "currentWeek" | "currentSeason">,
  evidenceIndex = buildYouthDeskEvidenceIndex(state),
): YouthCaseListItem {
  const observations = evidenceIndex.get(youth.player.id)?.liveObservations ?? [];
  const last = latestObservation(observations, youth.player.id);
  const eligibleJournal = Object.fromEntries(Object.entries(state.reflectionJournal ?? {}).filter(([, entry]) =>
    entry.season < state.currentSeason || (entry.season === state.currentSeason && entry.week <= state.currentWeek)));
  const history = playerJournalHistory(eligibleJournal, youth.player.id);
  const journal = history[0];
  // A visit without a new hypothesis does not close an earlier question. Resolve
  // revisions before filtering open states, so closed questions cannot reappear.
  const latestHypotheses = new Map<string, ReflectionHypothesisRecord>();
  for (const entry of history) {
    for (const hypothesis of entry.hypotheses ?? []) {
      if (hypothesis.playerId === youth.player.id && !latestHypotheses.has(hypothesis.id)) {
        latestHypotheses.set(hypothesis.id, hypothesis);
      }
    }
  }
  const hypothesis = [...latestHypotheses.values()].find((entry) =>
    entry.state !== "confirmed" && entry.state !== "debunked");
  const question = SCOUTING_QUESTIONS.find((entry) => entry.id === journal?.scoutingQuestionId);
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
    openQuestion: hypothesis?.text
      ?? question?.label
      ?? "What still needs another context?",
    nextTest: observations.length === 0
      ? "Arrange a first live observation before judging the player."
      : hypothesis
      ? "Test that hypothesis in a new context."
      : observations.length === 1
      ? "Book a second look in a different context."
      : "Test the open question against different opposition or a different role.",
    rivalHeat: heat,
    rivalHeatLabel: HEAT_LABEL[heat],
    observationCount: observations.filter((observation) => observation.playerId === youth.player.id).length,
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
  evidenceIndex = buildYouthDeskEvidenceIndex(state),
): YouthCaseListItem[] {
  const caseIds = collectYouthCasePlayerIds(state);
  return Object.values(state.unsignedYouth)
    .filter((youth) => !youth.retired && !youth.placed && caseIds.has(youth.player.id))
    .map((youth) => buildYouthCaseListItem(youth, state, evidenceIndex))
    .sort((left, right) => right.observationCount - left.observationCount || left.name.localeCompare(right.name));
}
