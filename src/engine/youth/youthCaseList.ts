import type {
  GameState,
  Observation,
  ReflectionJournalEntry,
  UnsignedYouth,
} from "@/engine/core/types";
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
  state: Pick<GameState, "observations" | "reflectionJournal" | "rivalActivities" | "currentWeek" | "currentSeason">,
): YouthCaseListItem {
  const observations = Object.values(state.observations ?? {});
  const last = latestObservation(observations, youth.player.id);
  const journal = latestJournal(state.reflectionJournal, youth.player.id);
  const hypothesis = journal?.hypotheses?.find((entry) => entry.playerId === youth.player.id);
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
      ?? journal?.notes?.[0]
      ?? "What still needs another context?",
    nextTest: hypothesis
      ? "Test that hypothesis in a new context."
      : "Book a second look in a different context.",
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
): YouthCaseListItem[] {
  const caseIds = collectYouthCasePlayerIds(state);
  return Object.values(state.unsignedYouth)
    .filter((youth) => !youth.retired && !youth.placed && caseIds.has(youth.player.id))
    .map((youth) => buildYouthCaseListItem(youth, state))
    .sort((left, right) => right.observationCount - left.observationCount || left.name.localeCompare(right.name));
}
