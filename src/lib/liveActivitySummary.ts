import type { Activity, GameState } from "@/engine/core/types";
import { getInteractiveActivityCompletionKey } from "./activityCompletion";

/** Use only an exact, dated live booking. Legacy records without a booking key are not guessed. */
export function getLiveActivitySummary(
  state: Pick<GameState, "reflectionJournal" | "currentWeek" | "currentSeason">,
  activity: Activity,
  dayIndex: number,
) {
  const bookingId = getInteractiveActivityCompletionKey(activity, dayIndex);
  const entry = Object.values(state.reflectionJournal ?? {}).find((candidate) =>
    candidate.activityInstanceId === bookingId
    && candidate.activityType === activity.type
    && candidate.week === state.currentWeek
    && candidate.season === state.currentSeason
    && (candidate.sessionMode === "fullObservation"
      || (candidate.sessionMode === "investigation" && candidate.conversationDecisions !== undefined)),
  );
  if (!entry) return null;
  if (entry.sessionMode === "investigation") {
    const inquiries = (entry.conversationDecisions ?? []).filter((decision) => decision.inquiry);
    const recalled = inquiries.filter((decision) => decision.inquiry?.status === "recalledAccount");
    return {
      tier: recalled.length > 0 ? "unverified source account" : "inconclusive",
      narrative: [entry.summary, ...new Set(inquiries.map((decision) => decision.narrativeText)),
        "Conversation accounts do not establish a player trait. Check the question through independent observation."]
        .filter(Boolean).join(" "),
      playerEvidence: Object.fromEntries(entry.playerIds.map((id) => [id,
        recalled.some((decision) => decision.inquiry?.playerId === id)
          ? "Recorded source account; not independently verified" : "No new player finding established"])),
    };
  }
  const cards = entry.evidenceCards ?? [];
  const usable = cards.filter((card) => card.clarity !== "missed"
    && card.clarity !== "glimpse" && card.classification !== "noConclusion");
  const evidenceSummary = usable.length > 0
    ? `${usable.length} usable saved cue${usable.length === 1 ? "" : "s"}. Check another context before treating this as a settled pattern.`
    : "No usable claim retained from this watch. Keep the question open and test it in another context.";
  return {
    tier: usable.length > 0 ? "provisional evidence" : "inconclusive",
    narrative: [entry.summary, evidenceSummary].filter(Boolean).join(" "),
    playerEvidence: Object.fromEntries(entry.playerIds.map((id) => {
      const retained = usable.filter((card) => card.playerId === id);
      return [id, retained.length > 0
        ? `${retained.length} usable saved cue${retained.length === 1 ? "" : "s"}; still provisional`
        : "No usable claim retained"];
    })),
  };
}
