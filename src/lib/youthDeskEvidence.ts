import type { GameState, Observation, ObservationContext } from "@/engine/core/types";
import { getPerceivedAbility } from "@/engine/scout/perceivedAbility";

const LIVE = new Set<ObservationContext>([
  "liveMatch", "trainingGround", "youthTournament", "academyVisit", "schoolMatch",
  "grassrootsTournament", "streetFootball", "academyTrialDay", "youthFestival",
  "followUpSession", "reserveMatch", "agentShowcase", "trialMatch",
]);
const VIDEO = new Set<ObservationContext>(["videoAnalysis", "deepVideoAnalysis"]);

export function buildYouthDeskEvidenceIndex(state: Pick<GameState,
  "observations" | "reflectionJournal" | "scout" | "currentWeek" | "currentSeason"
>) {
  const eligibleDate = (record: { week: number; season: number }) =>
    record.season < state.currentSeason
    || (record.season === state.currentSeason && record.week <= state.currentWeek);
  const groups = new Map<string, { observations: Observation[]; conversations: Set<string> }>();
  const seenObservations = new Set<string>();
  const conversationKey = (observation: Observation) => observation.sourceSessionId
    ?? `${observation.season}:${observation.week}:${observation.activityInstanceId ?? observation.id}`;
  const group = (id: string) => {
    if (!groups.has(id)) groups.set(id, { observations: [], conversations: new Set() });
    return groups.get(id)!;
  };
  for (const observation of Object.values(state.observations)) {
    if (observation.scoutId !== state.scout.id || !eligibleDate(observation)) continue;
    const identity = `${observation.playerId}:${observation.season}:${observation.week}:${observation.sourceSessionId ?? observation.activityInstanceId ?? observation.id}`;
    if (seenObservations.has(identity)) continue;
    seenObservations.add(identity);
    const entry = group(observation.playerId);
    entry.observations.push(observation);
    if (observation.context === "parentCoachMeeting") {
      entry.conversations.add(conversationKey(observation));
    }
  }
  for (const journal of Object.values(state.reflectionJournal ?? {})) {
    if (journal.sessionMode !== "investigation" || !eligibleDate(journal)) continue;
    for (const playerId of journal.playerIds) {
      const entry = group(playerId);
      // An observation and its journal describe one meeting, not two sources.
      for (const observation of entry.observations) {
        if (observation.context === "parentCoachMeeting"
          && (observation.sourceSessionId === journal.sessionId
            || journal.observationIds?.includes(observation.id)
            || (journal.activityInstanceId && observation.activityInstanceId === journal.activityInstanceId
              && observation.week === journal.week && observation.season === journal.season))) {
          entry.conversations.delete(conversationKey(observation));
        }
      }
      entry.conversations.add(journal.sessionId);
    }
  }
  return new Map([...groups].map(([id, entry]) => {
    const live = entry.observations.filter((o) => LIVE.has(o.context));
    const video = entry.observations.filter((o) => VIDEO.has(o.context));
    const perceived = getPerceivedAbility([...live, ...video].sort((a, b) =>
      a.season - b.season || a.week - b.week || a.id.localeCompare(b.id)), id);
    return [id, {
      liveObservations: live,
      abilityObservations: [...live, ...video],
      observationCount: live.length,
      videoCount: video.length,
      analysisCount: entry.observations.filter((o) => !LIVE.has(o.context)
        && !VIDEO.has(o.context) && o.context !== "parentCoachMeeting").length,
      conversationCount: entry.conversations.size,
      hasFirmRead: live.length >= 2 && perceived !== null && perceived.observationCount >= 2
        && (perceived.caConfidence >= 0.7 || perceived.paConfidence >= 0.7),
    }];
  }));
}
